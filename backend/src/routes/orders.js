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
 * PUT /api/v1/orders/:orderId/dispatch
 * Seller assigns a rider to an order
 */
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
