const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth, requireSellerOf } = require('../middleware/auth');
const { query, getClient } = require('../db');

const router = express.Router();

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
    body('payment_method').isIn(['telebirr', 'chapa', 'cash'])
  ],
  async (req, res, next) => {
    const client = await getClient();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const { store_id, items, delivery_address, payment_method, address_id } = req.body;
      await client.query('BEGIN');

      // Get store & policy
      const storeResult = await client.query(
        `SELECT s.*, sp.addis_delivery_fee, sp.regional_dispatch_fee, sp.zone_fee_matrix,
                sp.return_policy_type, sp.custom_policy_text, sp.cash_on_delivery,
                sp.telebirr_enabled, sp.telebirr_enabled, sp.free_delivery_threshold
         FROM stores s
         LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
         WHERE s.store_id = $1 AND s.status = 'verified'`,
        [store_id]
      );
      if (storeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Store not found or not verified' });
      }
      const store = storeResult.rows[0];

      // Validate payment method availability
      if (payment_method === 'telebirr' && !store.telebirr_enabled) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Telebirr not enabled for this store' });
      }
      if (payment_method === 'cash' && !store.cash_on_delivery) {
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

      // Calculate delivery fee based on sub-city
      let deliveryFee = store.addis_delivery_fee || 150;
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
      const total = subtotal + deliveryFee;

      // Policy snapshot for immutable order record
      const policySnapshot = {
        return_policy_type: store.return_policy_type,
        custom_policy_text: store.custom_policy_text,
        store_name: store.store_name,
        telebirr_merchant_id: store.telebirr_merchant_id
      };

      // Create order
      const orderRef = generateOrderRef();
      const orderResult = await client.query(
        `INSERT INTO orders (
          order_ref, buyer_tg_user_id, store_id, address_id, delivery_address,
          subtotal_etb, delivery_fee_etb, total_etb, payment_method,
          payment_status, order_status, policy_snapshot
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','pending',$10)
        RETURNING *`,
        [orderRef, req.user.tg_user_id, store_id, address_id || null,
         JSON.stringify(delivery_address), subtotal, deliveryFee, total,
         payment_method, JSON.stringify(policySnapshot)]
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

      res.status(201).json({
        order: {
          ...order,
          items: orderItems,
          store: { store_id: store.store_id, store_name: store.store_name, telebirr_merchant_id: store.telebirr_merchant_id }
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

    const itemRows = items.rows.map(i => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;">${i.title}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">${i.quantity}</td>
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
    body { font-family: -apple-system, Arial, sans-serif; background: #f8f9fa; padding: 20px; color: #1a1a1a; }
    .receipt { max-width: 680px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: #111216; color: white; padding: 28px 32px; }
    .brand { font-size: 22px; font-weight: 900; color: #FCCD04; margin-bottom: 4px; }
    .brand-sub { font-size: 12px; color: #9DA3AE; }
    .receipt-title { text-align: right; }
    .receipt-title h2 { font-size: 18px; color: #FCCD04; margin-bottom: 6px; }
    .header-row { display: flex; justify-content: space-between; align-items: flex-end; }
    .body { padding: 28px 32px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .info-box { background: #f8f9fa; padding: 16px; border-radius: 8px; }
    .info-box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 10px; font-weight: 700; }
    .info-box p { font-size: 13px; line-height: 1.7; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    thead th { background: #111216; color: white; padding: 10px 8px; text-align: left; font-size: 12px; }
    thead th:nth-child(2) { text-align: center; }
    thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
    .totals { margin-top: 0; }
    .totals tr td { padding: 7px 8px; font-size: 13px; color: #555; }
    .totals tr:last-child td { font-size: 16px; font-weight: 900; color: #111; border-top: 2px solid #111; padding-top: 10px; }
    .totals tr:last-child td:last-child { color: #D97706; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 800; background: ${statusColor}22; color: ${statusColor}; }
    .policy-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 14px; margin-top: 24px; font-size: 12px; color: #166534; line-height: 1.6; }
    .footer { background: #f8f9fa; padding: 20px 32px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #eee; }
    @media print { body { background: white; padding: 0; } .receipt { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="header-row">
        <div><div class="brand">መደብር | Medebirr</div><div class="brand-sub">Ethiopia's Telegram Marketplace · medebirr.vercel.app</div></div>
        <div class="receipt-title">
          <h2>OFFICIAL RECEIPT</h2>
          <div style="font-size:13px;color:#ccc;">#${order.order_ref}</div>
          <div style="font-size:12px;color:#9DA3AE;margin-top:4px;">${orderDate} EAT</div>
          <div style="margin-top:8px;"><span class="status-badge">${order.payment_status === 'paid' ? '✓ PAID & SETTLED' : order.payment_status.toUpperCase()}</span></div>
        </div>
      </div>
    </div>

    <div class="body">
      <div class="info-grid">
        <div class="info-box">
          <h3>Seller / Store</h3>
          <p><strong>${order.store_name}</strong><br/>
          ${order.location_sub_city ? order.location_sub_city + ', Addis Ababa<br/>' : ''}
          ${order.tg_channel_username ? '@' + order.tg_channel_username + '<br/>' : ''}
          ${order.telebirr_merchant_id ? 'Telebirr: ' + order.telebirr_merchant_id : ''}</p>
        </div>
        <div class="info-box">
          <h3>Buyer</h3>
          <p><strong>${order.first_name} ${order.last_name || ''}</strong><br/>
          ${order.buyer_username ? '@' + order.buyer_username + '<br/>' : ''}
          📍 ${addrStr || 'Address not specified'}<br/>
          📞 ${addr.phone || 'N/A'}</p>
        </div>
      </div>

      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table class="totals">
        <tr><td colspan="3" style="text-align:right;color:#555;">Subtotal</td><td style="text-align:right;">Br ${parseFloat(order.subtotal_etb).toLocaleString()}</td></tr>
        <tr><td colspan="3" style="text-align:right;color:#555;">Delivery Fee</td><td style="text-align:right;">Br ${parseFloat(order.delivery_fee_etb).toLocaleString()}</td></tr>
        <tr><td colspan="3" style="text-align:right;">Total Paid</td><td style="text-align:right;">Br ${parseFloat(order.total_etb).toLocaleString()}</td></tr>
      </table>

      <div class="policy-box">
        🛡️ <strong>${returnPolicy}:</strong> ${order.custom_policy_text || 'See store for full policy details.'}
      </div>
    </div>

    <div class="footer">
      Generated by መደብር | Medebirr · ${new Date().getFullYear()} ·
      Verify at medebirr.vercel.app/api/v1/orders/${order.order_id}/receipt<br/>
      Payment via ${order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1)} ·
      Order Status: ${order.order_status}
    </div>
  </div>
  <div style="text-align:center;margin-top:20px;">
    <button onclick="window.print()" style="background:#111;color:#FCCD04;border:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;">🖨️ Print / Save as PDF</button>
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
    const { rider_name, rider_phone, dispatch_note } = req.body;
    if (!rider_name || !rider_phone) {
      return res.status(400).json({ error: 'rider_name and rider_phone are required' });
    }

    // Verify seller owns the store
    const orderCheck = await query(
      `SELECT o.order_id, o.buyer_tg_user_id, o.payment_status, s.admin_tg_user_id
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

    const result = await query(
      `UPDATE orders SET
        order_status = 'dispatched', rider_name = $1, rider_phone = $2,
        dispatch_note = $3, updated_at = NOW()
       WHERE order_id = $4 RETURNING *`,
      [rider_name, rider_phone, dispatch_note || null, req.params.orderId]
    );

    // Notify buyer via Telegram bot
    try {
      const tgService = require('../services/telegram');
      await tgService.notifyBuyerRiderAssigned(
        ord.buyer_tg_user_id, result.rows[0], rider_name, rider_phone
      );
    } catch (e) {
      console.warn('Buyer rider notification failed:', e.message);
    }

    res.json({ order: result.rows[0], message: 'Rider assigned. Buyer will be notified.' });
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

    res.json({ order: result.rows[0], message: 'Delivery confirmed. Warranty period started.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
