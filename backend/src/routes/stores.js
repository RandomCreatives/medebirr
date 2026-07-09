const express = require('express');
const { body, param, query: queryValidator, validationResult } = require('express-validator');
const { requireAuth, requireSellerOf } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

/**
 * GET /api/v1/stores
 * List all verified stores (public)
 */
router.get('/', async (req, res, next) => {
  try {
    const { sub_city, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = ["s.status = 'verified'"];

    if (sub_city) {
      params.push(sub_city);
      conditions.push(`s.location_sub_city = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(s.store_name ILIKE $${params.length} OR s.description ILIKE $${params.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const result = await query(
      `SELECT s.store_id, s.store_name, s.store_slug, s.location_sub_city, s.location_woreda,
              s.description, s.tg_channel_username, s.rating, s.rating_count,
              s.total_orders, s.verified_badge,
              sp.return_policy_type, sp.addis_delivery_fee
       FROM stores s
       LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
       ${whereClause}
       ORDER BY s.rating DESC, s.total_orders DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ stores: result.rows, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/stores/:storeId
 * Get single store detail
 */
router.get('/:storeId', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.*, sp.return_policy_type, sp.custom_policy_text, sp.addis_delivery_fee,
              sp.regional_dispatch_fee, sp.free_delivery_threshold, sp.zone_fee_matrix,
              sp.cash_on_delivery, sp.telebirr_enabled, sp.chapa_enabled
       FROM stores s
       LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
       WHERE s.store_id = $1 OR s.store_slug = $1`,
      [req.params.storeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Store not found' });

    const store = result.rows[0];
    // Don't expose sensitive payment keys publicly
    delete store.chapa_secret_key;
    delete store.cbe_account_number;
    delete store.telebirr_merchant_id; // Expose only to buyer during checkout

    res.json({ store });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/stores
 * Register a new store (seller onboarding)
 */
router.post(
  '/',
  requireAuth,
  [
    body('store_name').trim().notEmpty().isLength({ min: 3, max: 255 }),
    body('location_sub_city').notEmpty(),
    body('business_phone').notEmpty(),
    body('telebirr_merchant_id').optional().isString()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const {
        store_name, tg_group_id, tg_channel_username, description,
        location_sub_city, location_woreda, location_detail,
        physical_address, business_phone, telebirr_merchant_id, cbe_account_number
      } = req.body;

      // Generate slug from store name
      const slug = store_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const result = await query(
        `INSERT INTO stores (
          store_name, store_slug, admin_tg_user_id, tg_group_id, tg_channel_username,
          description, location_sub_city, location_woreda, location_detail,
          physical_address, business_phone, telebirr_merchant_id, cbe_account_number,
          status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
        RETURNING store_id, store_name, store_slug, status`,
        [store_name, slug, req.user.tg_user_id, tg_group_id || null,
         tg_channel_username || null, description || null,
         location_sub_city, location_woreda || null, location_detail || null,
         physical_address || null, business_phone,
         telebirr_merchant_id || null, cbe_account_number || null]
      );

      const store = result.rows[0];

      // Create default policy
      await query(
        'INSERT INTO seller_policies (store_id) VALUES ($1)',
        [store.store_id]
      );

      res.status(201).json({ store, message: 'Store registered. Pending verification review.' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/v1/stores/:storeId
 * Update store settings (seller only)
 */
router.put('/:storeId', requireAuth, requireSellerOf('storeId'), async (req, res, next) => {
  try {
    const {
      description, location_sub_city, location_woreda, location_detail,
      physical_address, business_phone, tg_channel_username
    } = req.body;

    const result = await query(
      `UPDATE stores SET
        description = COALESCE($1, description),
        location_sub_city = COALESCE($2, location_sub_city),
        location_woreda = COALESCE($3, location_woreda),
        location_detail = COALESCE($4, location_detail),
        physical_address = COALESCE($5, physical_address),
        business_phone = COALESCE($6, business_phone),
        tg_channel_username = COALESCE($7, tg_channel_username),
        updated_at = NOW()
       WHERE store_id = $8
       RETURNING store_id, store_name, store_slug, status, updated_at`,
      [description, location_sub_city, location_woreda, location_detail,
       physical_address, business_phone, tg_channel_username, req.params.storeId]
    );
    res.json({ store: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/stores/:storeId/policy
 * Update seller policy
 */
router.put('/:storeId/policy', requireAuth, requireSellerOf('storeId'), async (req, res, next) => {
  try {
    const {
      return_policy_type, custom_policy_text, addis_delivery_fee,
      regional_dispatch_fee, free_delivery_threshold, zone_fee_matrix,
      cash_on_delivery, telebirr_enabled, chapa_enabled
    } = req.body;

    const result = await query(
      `UPDATE seller_policies SET
        return_policy_type = COALESCE($1, return_policy_type),
        custom_policy_text = COALESCE($2, custom_policy_text),
        addis_delivery_fee = COALESCE($3, addis_delivery_fee),
        regional_dispatch_fee = COALESCE($4, regional_dispatch_fee),
        free_delivery_threshold = COALESCE($5, free_delivery_threshold),
        zone_fee_matrix = COALESCE($6, zone_fee_matrix),
        cash_on_delivery = COALESCE($7, cash_on_delivery),
        telebirr_enabled = COALESCE($8, telebirr_enabled),
        chapa_enabled = COALESCE($9, chapa_enabled),
        updated_at = NOW()
       WHERE store_id = $10
       RETURNING *`,
      [return_policy_type, custom_policy_text, addis_delivery_fee,
       regional_dispatch_fee, free_delivery_threshold,
       zone_fee_matrix ? JSON.stringify(zone_fee_matrix) : null,
       cash_on_delivery, telebirr_enabled, chapa_enabled, req.params.storeId]
    );
    res.json({ policy: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/stores/:storeId/stats
 * Seller dashboard stats
 */
router.get('/:storeId/stats', requireAuth, requireSellerOf('storeId'), async (req, res, next) => {
  try {
    const storeId = req.params.storeId;

    const [ordersStats, productsStats, recentOrders] = await Promise.all([
      query(
        `SELECT
          COUNT(*) FILTER (WHERE order_status = 'pending') AS pending_count,
          COUNT(*) FILTER (WHERE order_status = 'dispatched') AS dispatched_count,
          COUNT(*) FILTER (WHERE order_status = 'delivered') AS delivered_count,
          COUNT(*) FILTER (WHERE payment_status = 'paid' AND created_at >= NOW() - INTERVAL '30 days') AS monthly_orders,
          COALESCE(SUM(total_etb) FILTER (WHERE payment_status = 'paid' AND created_at >= NOW() - INTERVAL '30 days'), 0) AS monthly_revenue,
          COALESCE(SUM(total_etb) FILTER (WHERE payment_status = 'paid'), 0) AS total_revenue
         FROM orders WHERE store_id = $1`,
        [storeId]
      ),
      query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_published) AS published FROM products WHERE store_id = $1', [storeId]),
      query(
        `SELECT o.order_ref, o.total_etb, o.order_status, o.payment_status, o.created_at,
                u.first_name, u.last_name, u.username
         FROM orders o
         JOIN users u ON o.buyer_tg_user_id = u.tg_user_id
         WHERE o.store_id = $1
         ORDER BY o.created_at DESC LIMIT 5`,
        [storeId]
      )
    ]);

    res.json({
      orders: ordersStats.rows[0],
      products: productsStats.rows[0],
      recentOrders: recentOrders.rows
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/stores/:storeId
 * Delete a store and all its data (owner only)
 * Requires confirmation — checks for active/paid orders first
 */
router.delete('/:storeId', requireAuth, requireSellerOf('storeId'), async (req, res, next) => {
  try {
    const storeId = req.params.storeId;

    // Block deletion if there are active (unpaid or dispatched) orders
    const activeOrders = await query(
      `SELECT COUNT(*) FROM orders
       WHERE store_id = $1
         AND order_status NOT IN ('delivered','cancelled')
         AND payment_status = 'paid'`,
      [storeId]
    );
    if (parseInt(activeOrders.rows[0].count) > 0) {
      return res.status(409).json({
        error: 'Cannot delete store with active orders',
        detail: `You have ${activeOrders.rows[0].count} paid order(s) that are not yet delivered. Fulfil or cancel them first.`
      });
    }

    const store = req.store; // Attached by requireSellerOf

    // Soft-delete: mark suspended + clear group link so the group can be reused
    await query(
      `UPDATE stores SET
        status = 'deleted',
        tg_group_id = NULL,
        tg_channel_username = NULL,
        updated_at = NOW()
       WHERE store_id = $1`,
      [storeId]
    );

    // Unpublish all products
    await query('UPDATE products SET is_published = FALSE WHERE store_id = $1', [storeId]);

    res.json({
      message: `Store "${store.store_name}" has been deleted. All products have been unpublished.`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
