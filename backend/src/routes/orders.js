const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth, requireSellerOf } = require('../middleware/auth');
const { query, getClient } = require('../db');
const { generateOTP } = require('../utils/otp');

const router = express.Router();

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/**
 * Generate unique order reference
 */
function generateOrderRef() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `ORD-${date}-${rand}`;
}

/**
 * POST /api/v1/orders
 * Create order from cart (per-store checkout)
 */
router.post(
  '/',
  requireAuth,
  [
    body('store_id').notEmpty().isUUID(),
    body('items').isArray({ min: 1 }),
    body('items.*.product_id').isUUID(),
    body('items.*.quantity').isInt({ min: 1 }),
    body('delivery_address').isObject(),
    body('delivery_address.sub_city').notEmpty(),
    body('delivery_address.phone').notEmpty(),
    body('payment_method').isIn(['telebirr', 'cbe', 'cash']),
    body('coupon_code').optional({ values: 'falsy' }).isString()
  ],
  async (req, res, next) => {
    const client = await getClient();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const { store_id, items, delivery_address, payment_method, address_id, delivery_method, coupon_code,
              delivery_latitude, delivery_longitude } = req.body;
      const isPickup = delivery_method === 'pickup';
      await client.query('BEGIN');

      // Get store & policy
      const storeResult = await client.query(
        `SELECT s.*, sp.addis_delivery_fee, sp.regional_dispatch_fee, sp.zone_fee_matrix,
                sp.return_policy_type, sp.custom_policy_text,
                COALESCE(sp.cash_on_delivery, TRUE) AS cash_on_delivery,
                COALESCE(sp.telebirr_enabled, TRUE) AS telebirr_enabled,
                COALESCE(sp.cbe_enabled, FALSE) AS cbe_enabled,
                COALESCE(sp.free_delivery_threshold, 2000) AS free_delivery_threshold,
                COALESCE(sp.addis_delivery_fee, 150) AS addis_delivery_fee_default
         FROM stores s
         LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
         WHERE s.store_id = $1 AND s.status IN ('verified', 'active')`,
        [store_id]
      );
      if (storeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Store not found or not verified' });
      }
      const store = storeResult.rows[0];

      // Self-buy restriction
      if (store.admin_tg_user_id === req.user.tg_user_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'You cannot purchase from your own store' });
      }

      // Validate payment method availability — defaults to enabled via COALESCE
      if (payment_method === 'telebirr' && store.telebirr_enabled === false) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Telebirr not enabled for this store' });
      }
      if (payment_method === 'cbe' && store.cbe_enabled === false) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'CBE not enabled for this store' });
      }
      if (payment_method === 'cash' && store.cash_on_delivery === false) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cash on delivery not available for this store' });
      }

      // Fetch and lock product stock
      let subtotal = 0;
      const orderItems = [];

      for (const cartItem of items) {
        const prodResult = await client.query(
          'SELECT * FROM products WHERE product_id = $1 AND store_id = $2 AND is_published = TRUE FOR UPDATE',
          [cartItem.product_id, store_id]
        );
        if (prodResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: `Product ${cartItem.product_id} not found in this store` });
        }
        const product = prodResult.rows[0];
        const available = product.stock_quantity - product.reserved_stock;
        if (available < cartItem.quantity) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `Insufficient stock for "${product.title}". Available: ${available}` });
        }

        // Reserve stock
        await client.query(
          'UPDATE products SET reserved_stock = reserved_stock + $1 WHERE product_id = $2',
          [cartItem.quantity, cartItem.product_id]
        );

        const itemSubtotal = product.price_etb * cartItem.quantity;
        subtotal += itemSubtotal;
        orderItems.push({
          product_id: cartItem.product_id,
          title: product.title,
          price_etb: product.price_etb,
          quantity: cartItem.quantity,
          variant_choice: cartItem.variant_choice || null,
          subtotal_etb: itemSubtotal
        });
      }

      // Calculate delivery fee (free for store pickup)
      let deliveryFee = 0;
      if (!isPickup) {
        deliveryFee = store.addis_delivery_fee || 150;
        if (store.zone_fee_matrix) {
          const matrix = typeof store.zone_fee_matrix === 'string'
            ? JSON.parse(store.zone_fee_matrix)
            : store.zone_fee_matrix;
          const zoneFee = matrix[delivery_address.sub_city];
          if (zoneFee !== undefined) deliveryFee = zoneFee;
        }
        // Free delivery threshold check
        if (store.free_delivery_threshold && subtotal >= store.free_delivery_threshold) {
          deliveryFee = 0;
        }
      }
      const totalBeforeDiscount = subtotal + deliveryFee;

      // Apply coupon if provided (Social shares, Group buys, etc.)
      let discountAmount = 0;
      let appliedCoupon = null;

      if (coupon_code && coupon_code.trim()) {
        console.log(`[Checkout] Validating coupon code: ${coupon_code} for store: ${store_id}`);
        const couponResult = await client.query(
          `SELECT * FROM coupons
           WHERE UPPER(code) = UPPER($1)
             AND is_active = TRUE
             AND (expires_at IS NULL OR expires_at > NOW())
             AND (store_id IS NULL OR store_id = $2)
             AND (tg_user_id IS NULL OR tg_user_id = $3)`,
          [coupon_code.trim(), store_id, req.user.tg_user_id]
        );

        if (couponResult.rows.length > 0) {
          const coupon = couponResult.rows[0];
          appliedCoupon = coupon;

          if (subtotal >= Number(coupon.min_order_etb || 0)) {
            if (coupon.discount_type === 'percent') {
              discountAmount = subtotal * (Number(coupon.discount_value) / 100);
            } else if (coupon.discount_type === 'fixed') {
              discountAmount = Number(coupon.discount_value);
            }
            discountAmount = Math.min(discountAmount, subtotal);
            console.log(`[Checkout] Applied coupon ${coupon_code} with discount value: Br ${discountAmount}`);
          } else {
            console.log(`[Checkout] Subtotal Br ${subtotal} is below minimum order threshold Br ${coupon.min_order_etb}`);
          }
        } else {
          console.log(`[Checkout] Coupon code ${coupon_code} is invalid, expired, or not owned by user.`);
        }
      }

      const total = Math.max(0, totalBeforeDiscount - discountAmount);

      // Policy snapshot for immutable order record
      const policySnapshot = {
        return_policy_type: store.return_policy_type,
        custom_policy_text: store.custom_policy_text,
        store_name: store.store_name,
        telebirr_merchant_id: store.telebirr_merchant_id,
        cbe_account_number: store.cbe_account_number,
        telebirr_account_name: store.telebirr_account_name,
        cbe_account_name: store.cbe_account_name
      };

      // Create order
      const orderRef = generateOrderRef();
      const deliveryOtp = generateOTP(4);
      const orderResult = await client.query(
        `INSERT INTO orders (
          order_ref, buyer_tg_user_id, store_id, address_id, delivery_address,
          subtotal_etb, delivery_fee_etb, total_etb, payment_method,
          payment_status, order_status, policy_snapshot, delivery_method,
          coupon_code, discount_etb, delivery_otp,
          delivery_latitude, delivery_longitude
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','pending',$10,$11,$12,$13,$14,$15,$16)
        RETURNING *`,
        [orderRef, req.user.tg_user_id, store_id, address_id || null,
         JSON.stringify(delivery_address), subtotal, deliveryFee, total,
         payment_method, JSON.stringify(policySnapshot), delivery_method || 'delivery',
         appliedCoupon ? appliedCoupon.code : null, discountAmount,
         deliveryOtp,
         delivery_latitude != null ? Number(delivery_latitude) : null,
         delivery_longitude != null ? Number(delivery_longitude) : null]
      );
      const order = orderResult.rows[0];

      // Insert order items
      for (const oi of orderItems) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, title, price_etb, quantity, variant_choice, subtotal_etb)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [order.order_id, oi.product_id, oi.title, oi.price_etb, oi.quantity,
           oi.variant_choice ? JSON.stringify(oi.variant_choice) : null, oi.subtotal_etb]
        );
      }

      await client.query('COMMIT');

      // Increment coupon usage count
      if (appliedCoupon) {
        try {
          await query('UPDATE coupons SET used_count = used_count + 1 WHERE coupon_id = $1', [appliedCoupon.coupon_id]);
        } catch (_) {}
      }

      // Notify buyer
      try {
        const notif = require('../services/notifications');
        await notif.notifyOrderStatus(order, 'pending', { store_name: store.store_name });
      } catch (_) {}

      res.status(201).json({
        order: {
          ...order,
          items: orderItems,
          store: {
            store_id: store.store_id,
            store_name: store.store_name,
            telebirr_merchant_id: store.telebirr_merchant_id,
            telebirr_account_name: store.telebirr_account_name,
            cbe_account_number: store.cbe_account_number,
            cbe_account_name: store.cbe_account_name,
            physical_address: store.physical_address
          }
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

/**
 * GET /api/v1/orders
 * Get buyer's order history
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.tg_user_id];
    const conditions = ['o.buyer_tg_user_id = $1'];

    if (status) {
      params.push(status);
      conditions.push(`o.order_status = $${params.length}`);
    }
    params.push(limit, offset);

    const result = await query(
      `SELECT o.order_id, o.order_ref, o.total_etb, o.order_status, o.payment_status,
              o.payment_method, o.delivery_address, o.created_at, o.rider_name, o.rider_phone,
              o.delivery_provider, o.delivery_otp, o.payment_proof,
              o.qr_scan_attempts, o.qr_verified_by_rider, o.qr_verified_by_buyer, o.receipt_pdf_url,
              s.store_name, s.store_slug, s.tg_channel_username
       FROM orders o
       JOIN stores s ON o.store_id = s.store_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ orders: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/orders/:orderId
 * Get single order detail (buyer or seller)
 */
router.get('/:orderId', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT o.*, s.store_name, s.store_slug, s.tg_channel_username, s.admin_tg_user_id
       FROM orders o
       JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1`,
      [req.params.orderId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = result.rows[0];
    // Only buyer or seller can view
    if (order.buyer_tg_user_id !== req.user.tg_user_id && order.admin_tg_user_id !== req.user.tg_user_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const itemsResult = await query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [req.params.orderId]
    );

    res.json({ order: { ...order, items: itemsResult.rows } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/orders/store/:storeId
 * Seller: get all orders for their store
 */
router.get('/store/:storeId', requireAuth, requireSellerOf('storeId'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.params.storeId];
    const conditions = ['o.store_id = $1'];

    if (status) {
      params.push(status);
      conditions.push(`o.order_status = $${params.length}`);
    }
    params.push(limit, offset);

    const result = await query(
      `SELECT o.order_id, o.order_ref, o.total_etb, o.order_status, o.payment_status,
              o.payment_method, o.delivery_address, o.created_at, o.rider_name, o.rider_phone,
              o.delivery_provider, o.delivery_otp,
              o.qr_scan_attempts, o.qr_verified_by_rider, o.qr_verified_by_buyer, o.receipt_pdf_url,
              u.first_name, u.last_name, u.username AS buyer_username
       FROM orders o
       JOIN users u ON o.buyer_tg_user_id = u.tg_user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ orders: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/orders/:orderId/receipt
 * Generate and return a PDF receipt for an order
 */
router.get('/:orderId/receipt', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT o.*, s.store_name, s.tg_channel_username, s.telebirr_merchant_id,
              s.location_sub_city, s.physical_address,
              sp.return_policy_type, sp.custom_policy_text,
              u.first_name, u.last_name, u.username AS buyer_username
       FROM orders o
       JOIN stores s ON o.store_id = s.store_id
       JOIN users u ON o.buyer_tg_user_id = u.tg_user_id
       LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
       WHERE o.order_id = $1`,
      [req.params.orderId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = result.rows[0];

    // Only buyer or seller can download receipt
    const storeCheck = await query('SELECT admin_tg_user_id FROM stores WHERE store_id = $1', [order.store_id]);
    const isSellerOwner = storeCheck.rows[0]?.admin_tg_user_id === req.user.tg_user_id;
    if (order.buyer_tg_user_id !== req.user.tg_user_id && !isSellerOwner) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const items = await query('SELECT * FROM order_items WHERE order_id = $1', [req.params.orderId]);
    const addr = typeof order.delivery_address === 'string' ? JSON.parse(order.delivery_address) : order.delivery_address;
    const policy = typeof order.policy_snapshot === 'string' ? JSON.parse(order.policy_snapshot) : order.policy_snapshot;

    // Build HTML receipt (lightweight, no PDF lib dependency)
    const policyLabel = { '7_day_free':'7-Day Free Return','3_day_warranty':'3-Day Warranty','size_exchange':'Size Exchange','fresh_guarantee':'Freshness Guarantee','no_return':'No Returns' };
    const returnPolicy = policyLabel[order.return_policy_type] || 'Store Policy';
    const orderDate = new Date(order.created_at).toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' });
    const addrStr = [addr.sub_city, addr.woreda, addr.house_number, addr.landmark].filter(Boolean).join(', ');
    const statusColor = order.payment_status === 'paid' ? '#10B981' : '#F59E0B';
    const statusText = (order.order_status || 'pending').toUpperCase();
    const payMethod = (order.payment_method || 'cash').toUpperCase();
    const payStatus = (order.payment_status || 'pending').toUpperCase();
    const txCode = order.transaction_code || order.payment_tx_ref || '';
    const deliveryMethod = order.delivery_method === 'pickup' ? 'Store Pickup' : 'Home Delivery';
    const riderName = order.rider_name || '';
    const riderPhone = order.rider_phone || '';

    const itemRows = items.rows.map(i => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;">${esc(i.title)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">${esc(i.quantity)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">Br ${parseFloat(i.price_etb).toLocaleString()}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:700;">Br ${parseFloat(i.subtotal_etb).toLocaleString()}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt ${order.order_ref}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Arial, sans-serif; background: #111; padding: 20px; color: #1a1a1a; }
    .receipt { max-width: 680px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    .header { background: #111216; padding: 24px 28px; display: flex; justify-content: space-between; align-items: center; }
    .brand { font-size: 20px; font-weight: 900; color: #FCCD04; }
    .brand-sub { font-size: 11px; color: #9DA3AE; margin-top: 2px; }
    .order-ref { text-align: right; }
    .order-ref .ref { font-size: 18px; font-weight: 900; color: #FCCD04; }
    .order-ref .date { font-size: 11px; color: #9DA3AE; margin-top: 3px; }
    .status-row { text-align: center; padding: 14px 28px; }
    .status-badge { display: inline-block; padding: 5px 16px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; }
    .body { padding: 0 28px 28px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .info-box { background: #F8F9FA; padding: 16px; border-radius: 8px; }
    .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: #999; font-weight: 700; margin-bottom: 8px; }
    .info-name { font-size: 14px; font-weight: 800; color: #111; margin-bottom: 6px; }
    .info-detail { font-size: 12px; line-height: 1.8; color: #555; }
    .payment-bar { background: #111216; border-radius: 8px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .pay-left { display: flex; gap: 24px; }
    .pay-item .pay-label { font-size: 9px; text-transform: uppercase; color: #9DA3AE; letter-spacing: 1px; }
    .pay-item .pay-value { font-size: 13px; font-weight: 800; color: #FCCD04; margin-top: 2px; }
    .pay-tx { font-size: 11px; color: #9DA3AE; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    table.items thead th { background: #F3F4F6; padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #888; font-weight: 700; }
    table.items thead th:nth-child(2) { text-align: center; }
    table.items thead th:nth-child(3), table.items thead th:nth-child(4) { text-align: right; }
    table.items tbody tr { border-bottom: 1px solid #F0F0F0; }
    table.items tbody tr:nth-child(even) { background: #FAFAFA; }
    table.items tbody td { padding: 11px 12px; font-size: 13px; color: #333; }
    table.items tbody td:nth-child(2) { text-align: center; color: #888; }
    table.items tbody td:nth-child(3) { text-align: right; color: #888; }
    table.items tbody td:nth-child(4) { text-align: right; font-weight: 700; color: #111; }
    .totals { width: 100%; }
    .totals td { padding: 6px 12px; font-size: 13px; color: #666; text-align: right; }
    .totals tr:last-child td { font-size: 16px; font-weight: 900; color: #111; border-top: 2px solid #111; padding-top: 10px; }
    .totals tr:last-child td:last-child { color: #D97706; }
    .rider-bar { background: #F5F3FF; border: 1px solid #DDD6FE; border-radius: 8px; padding: 12px 16px; margin-top: 16px; }
    .rider-label { font-size: 10px; text-transform: uppercase; color: #7C3AED; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px; }
    .rider-detail { font-size: 13px; color: #333; }
    .policy-box { background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 14px 16px; margin-top: 16px; font-size: 12px; color: #166534; line-height: 1.6; }
    .footer { background: #F8F9FA; padding: 18px 28px; text-align: center; font-size: 11px; color: #AAA; border-top: 1px solid #eee; }
    @media print { body { background: white; padding: 0; } .receipt { box-shadow: none; border-radius: 0; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div>
        <div class="brand">MEDEBIRR</div>
        <div class="brand-sub">Ethiopia's Telegram Marketplace</div>
      </div>
      <div class="order-ref">
        <div class="ref">${order.order_ref}</div>
        <div class="date">${orderDate} EAT</div>
      </div>
    </div>

    <div class="status-row">
      <span class="status-badge" style="background:${statusColor}18;color:${statusColor};">
        ${order.order_status === 'delivered' ? '&#10003; ' : ''}${statusText}
      </span>
    </div>

    <div class="body">
      <div class="info-grid">
        <div class="info-box">
          <div class="info-label">Buyer</div>
          <div class="info-name">${esc(order.first_name)} ${esc(order.last_name || '')}</div>
          <div class="info-detail">
            ${order.buyer_username ? '@' + esc(order.buyer_username) + '<br/>' : ''}
            ${addr.phone ? esc(addr.phone) + '<br/>' : ''}
            ${addrStr ? esc(addrStr) : ''}
          </div>
        </div>
        <div class="info-box">
          <div class="info-label">Seller</div>
          <div class="info-name">${esc(order.store_name)}</div>
          <div class="info-detail">
            ${order.location_sub_city ? esc(order.location_sub_city) + ', Addis Ababa<br/>' : ''}
            ${order.tg_channel_username ? '@' + esc(order.tg_channel_username) + '<br/>' : ''}
            ${order.telebirr_merchant_id ? 'Telebirr: ' + esc(order.telebirr_merchant_id) : ''}
          </div>
        </div>
      </div>

      <div class="payment-bar">
        <div class="pay-left">
          <div class="pay-item">
            <div class="pay-label">Payment</div>
            <div class="pay-value">${esc(payMethod)}</div>
          </div>
          <div class="pay-item">
            <div class="pay-label">Status</div>
            <div class="pay-value" style="color:${statusColor};">${esc(payStatus)}</div>
          </div>
          <div class="pay-item">
            <div class="pay-label">Delivery</div>
            <div class="pay-value">${esc(deliveryMethod)}</div>
          </div>
        </div>
        <div class="pay-tx">${txCode ? 'TX: ' + esc(txCode) : ''}</div>
      </div>

      <table class="items">
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>

      <table class="totals">
        <tr><td style="text-align:right;">Subtotal</td><td style="width:120px;text-align:right;">Br ${parseFloat(order.subtotal_etb).toLocaleString()}</td></tr>
        <tr><td style="text-align:right;">Delivery Fee</td><td style="text-align:right;">Br ${parseFloat(order.delivery_fee_etb).toLocaleString()}</td></tr>
        <tr><td style="text-align:right;">Total</td><td style="text-align:right;">Br ${parseFloat(order.total_etb).toLocaleString()}</td></tr>
      </table>

      ${riderName ? `
      <div class="rider-bar">
        <div class="rider-label">Delivery Rider</div>
        <div class="rider-detail">${esc(riderName)} ${riderPhone ? '&middot; ' + esc(riderPhone) : ''}</div>
      </div>` : ''}

      ${policy?.return_policy_type && policy.return_policy_type !== 'no_return' ? `
      <div class="policy-box">
        <strong>${esc(returnPolicy)}:</strong> ${esc(policy.custom_policy_text || 'See store for full policy details.')}
      </div>` : ''}
    </div>

    <div class="footer">
      Generated by Medebirr &middot; ${new Date().getFullYear()} &middot; For support: @medebirrbot
    </div>
  </div>
  <div style="text-align:center;margin-top:20px;">
    <button onclick="window.print()" style="background:#111;color:#FCCD04;border:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;">Print / Save as PDF</button>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${order.order_ref}.html"`);
    res.send(html);
  } catch (err) {
    next(err);
  }
});


router.put('/:orderId/dispatch', requireAuth, async (req, res, next) => {
  try {
    const { rider_name, rider_phone, dispatch_note, delivery_provider } = req.body;
    const provider = ['self', 'company'].includes(delivery_provider) ? delivery_provider : 'rider';

    // Verify seller owns the store
    const orderCheck = await query(
      `SELECT o.order_id, o.buyer_tg_user_id, o.payment_status, s.admin_tg_user_id,
              s.store_name, s.business_phone
       FROM orders o JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1`,
      [req.params.orderId]
    );
    if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const ord = orderCheck.rows[0];

    if (ord.admin_tg_user_id !== req.user.tg_user_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (ord.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Cannot dispatch unpaid order' });
    }

    // Resolve rider identity per delivery provider.
    // 'self'   -> the seller delivers (no external rider)
    // 'company'-> a local delivery company (name required, phone optional)
    // 'rider'  -> a named individual rider (name + phone required)
    let finalName = rider_name ? String(rider_name).trim() : '';
    let finalPhone = rider_phone ? String(rider_phone).trim() : '';

    if (provider === 'self') {
      if (!finalName) finalName = `${ord.store_name || 'Seller'} (Self-delivery)`;
      if (!finalPhone) finalPhone = ord.business_phone || '';
    } else if (provider === 'company') {
      if (!finalName) return res.status(400).json({ error: 'Delivery company name is required' });
    } else {
      if (!finalName || !finalPhone) {
        return res.status(400).json({ error: 'rider_name and rider_phone are required' });
      }
    }

    const result = await query(
      `UPDATE orders SET
        order_status = 'dispatched', rider_name = $1, rider_phone = $2,
        dispatch_note = $3, delivery_provider = $4, updated_at = NOW()
       WHERE order_id = $5 RETURNING *`,
      [finalName, finalPhone, dispatch_note || null, provider, req.params.orderId]
    );

    // Notify buyer via Telegram bot with rich interactive message
    const label = provider === 'self'
      ? `${ord.store_name || 'The seller'} is delivering your order`
      : provider === 'company'
        ? `Delivery partner: ${finalName}`
        : finalName;
    try {
      const tgService = require('../services/telegram');
      console.log(`[Dispatch] Sending rich buyer notification for order ${result.rows[0].order_ref} to user ${ord.buyer_tg_user_id}`);
      await tgService.notifyBuyerRiderAssigned(
        ord.buyer_tg_user_id,
        result.rows[0],
        label,
        finalPhone
      );
    } catch (e) {
      console.warn('Buyer interactive dispatch notification failed, falling back to simple text:', e.message);
      try {
        const notif = require('../services/notifications');
        await notif.notifyOrderStatus(result.rows[0], 'dispatched', { rider_name: label, rider_phone: finalPhone });
      } catch (err) {
        console.error('Fallback notification also failed:', err.message);
      }
    }

    res.json({ order: result.rows[0], message: 'Delivery assigned. Buyer will be notified.' });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/orders/:orderId/confirm-delivery
 * Buyer confirms delivery (QR handshake)
 */
router.put('/:orderId/confirm-delivery', requireAuth, async (req, res, next) => {
  try {
    const orderCheck = await query(
      'SELECT order_id, buyer_tg_user_id, order_status FROM orders WHERE order_id = $1',
      [req.params.orderId]
    );
    if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const ord = orderCheck.rows[0];

    if (ord.buyer_tg_user_id !== req.user.tg_user_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (ord.order_status !== 'dispatched') {
      return res.status(400).json({ error: 'Order not in dispatched state' });
    }

    const result = await query(
      `UPDATE orders SET
        order_status = 'delivered', buyer_confirmed_at = NOW(),
        delivered_at = NOW(), updated_at = NOW()
       WHERE order_id = $1 RETURNING *`,
      [req.params.orderId]
    );

    // Release reserved stock and increment order count
    const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.orderId]);
    for (const item of items.rows) {
      await query(
        `UPDATE products SET
          reserved_stock = GREATEST(0, reserved_stock - $1),
          order_count = order_count + $1
         WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }

    // Update store total_orders and total_revenue
    await query(
      `UPDATE stores SET
        total_orders = total_orders + 1,
        total_revenue = total_revenue + (SELECT total_etb FROM orders WHERE order_id = $1)
       WHERE store_id = (SELECT store_id FROM orders WHERE order_id = $1)`,
      [req.params.orderId]
    );

    // Notify buyer
    try {
      const notif = require('../services/notifications');
      await notif.notifyOrderStatus(result.rows[0], 'delivered');
    } catch (_) {}

    res.json({ order: result.rows[0], message: 'Delivery confirmed. Warranty period started.' });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/orders/:orderId/cancel
 * Buyer cancels a pending or confirmed order
 */
router.patch('/:orderId/cancel', requireAuth, async (req, res, next) => {
  try {
    const orderCheck = await query(
      'SELECT order_id, buyer_tg_user_id, order_status FROM orders WHERE order_id = $1',
      [req.params.orderId]
    );
    if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const ord = orderCheck.rows[0];

    if (ord.buyer_tg_user_id !== req.user.tg_user_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (!['pending', 'confirmed'].includes(ord.order_status)) {
      return res.status(400).json({ error: 'Only pending or confirmed orders can be cancelled' });
    }

    const result = await query(
      `UPDATE orders SET
        order_status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE order_id = $1 RETURNING *`,
      [req.params.orderId]
    );

    // Release reserved stock
    const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.orderId]);
    for (const item of items.rows) {
      await query(
        `UPDATE products SET
          reserved_stock = GREATEST(0, reserved_stock - $1)
         WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }

    // Notify buyer
    try {
      const notif = require('../services/notifications');
      await notif.notifyOrderStatus(result.rows[0], 'cancelled', { reason: 'Cancelled by buyer' });
    } catch (_) {}

    res.json({ order: result.rows[0], message: 'Order cancelled.' });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/orders/:orderId/cancel-seller
 * Seller-initiated cancellation (only for orders owned by the seller's store)
 */
router.patch('/:orderId/cancel-seller', requireAuth, async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    const ordResult = await query(
      `SELECT o.*, s.admin_tg_user_id FROM orders o
       JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1`,
      [req.params.orderId]
    );
    if (ordResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const ord = ordResult.rows[0];
    if (ord.admin_tg_user_id !== req.user.tg_user_id) return res.status(403).json({ error: 'Not authorized' });
    if (!['pending', 'confirmed'].includes(ord.order_status)) {
      return res.status(400).json({ error: 'Only pending or confirmed orders can be cancelled' });
    }

    const result = await query(
      `UPDATE orders SET
        order_status = 'cancelled', cancel_reason = $2, cancelled_at = NOW(), updated_at = NOW()
       WHERE order_id = $1 RETURNING *`,
      [req.params.orderId, reason || 'Cancelled by seller']
    );

    // Release reserved stock
    const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.orderId]);
    for (const item of items.rows) {
      await query(
        `UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - $1) WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }

    // Notify buyer via Telegram
    try {
      const notif = require('../services/notifications');
      const fullOrder = await query('SELECT * FROM orders WHERE order_id = $1', [req.params.orderId]);
      await notif.notifyOrderStatus(fullOrder.rows[0], 'cancelled', { reason: reason || 'Cancelled by seller' });
    } catch (_) {}

    res.json({ order: result.rows[0], message: 'Order cancelled by seller.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
