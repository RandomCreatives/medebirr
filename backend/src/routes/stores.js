const express = require('express');
const crypto = require('crypto');
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
      `SELECT s.store_id, s.store_name, s.store_slug, s.store_code, s.location_sub_city, s.location_woreda,
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
              sp.cash_on_delivery, sp.telebirr_enabled, sp.telegram_notifs
       FROM stores s
       LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
       WHERE s.store_id = $1 OR s.store_slug = $1::text`,
      [req.params.storeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Store not found' });

    const store = result.rows[0];
    // Don't expose sensitive payment keys or password hash
    delete store.cbe_account_number;
    delete store.telebirr_merchant_id;
    delete store.seller_password_hash;

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
    body('telebirr_merchant_id').optional().isString(),
    body('cbe_account_number').optional().isString(),
    body('telebirr_account_name').optional().isString(),
    body('cbe_account_name').optional().isString()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const {
        store_name, tg_group_id, tg_channel_username, description,
        location_sub_city, location_woreda, location_detail,
        physical_address, business_phone, telebirr_merchant_id, cbe_account_number,
        telebirr_account_name, cbe_account_name, seller_password
      } = req.body;

      // Generate unique 16-char store code
      const storeCode = crypto.randomBytes(8).toString('hex').toUpperCase();

      // Hash seller password if provided
      let passwordHash = null;
      if (seller_password) {
        if (seller_password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
        const salt = crypto.randomBytes(16).toString('hex');
        passwordHash = salt + ':' + crypto.scryptSync(seller_password, salt, 64).toString('hex');
      }

      // Generate slug from store name
      const slug = store_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const result = await query(
        `INSERT INTO stores (
          store_name, store_slug, store_code, admin_tg_user_id, tg_group_id, tg_channel_username,
          description, location_sub_city, location_woreda, location_detail,
          physical_address, business_phone, telebirr_merchant_id, cbe_account_number,
          telebirr_account_name, cbe_account_name, seller_password_hash,
          status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'verified')
        RETURNING store_id, store_name, store_slug, store_code, status`,
        [store_name, slug, storeCode, req.user.tg_user_id, tg_group_id || null,
         tg_channel_username || null, description || null,
         location_sub_city, location_woreda || null, location_detail || null,
         physical_address || null, business_phone,
         telebirr_merchant_id || null, cbe_account_number || null,
         telebirr_account_name || null, cbe_account_name || null,
         passwordHash]
      );

      const store = result.rows[0];

      // Create default policy
      await query(
        'INSERT INTO seller_policies (store_id) VALUES ($1)',
        [store.store_id]
      );

      res.status(201).json({ store, message: 'Store registered and verified. Products will appear in the hub immediately.' });
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
      physical_address, business_phone, tg_channel_username,
      telebirr_merchant_id, cbe_account_number, telebirr_account_name, cbe_account_name
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
        telebirr_merchant_id = COALESCE($8, telebirr_merchant_id),
        cbe_account_number = COALESCE($9, cbe_account_number),
        telebirr_account_name = COALESCE($10, telebirr_account_name),
        cbe_account_name = COALESCE($11, cbe_account_name),
        updated_at = NOW()
       WHERE store_id = $12
       RETURNING store_id, store_name, store_slug, status, updated_at`,
      [description, location_sub_city, location_woreda, location_detail,
       physical_address, business_phone, tg_channel_username,
       telebirr_merchant_id, cbe_account_number, telebirr_account_name, cbe_account_name,
       req.params.storeId]
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
      cash_on_delivery, telebirr_enabled, cbe_enabled, telegram_notifs
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
        cbe_enabled = COALESCE($9, cbe_enabled),
        telegram_notifs = COALESCE($10, telegram_notifs),
        updated_at = NOW()
       WHERE store_id = $11
       RETURNING *`,
      [return_policy_type, custom_policy_text, addis_delivery_fee,
       regional_dispatch_fee, free_delivery_threshold,
       zone_fee_matrix ? JSON.stringify(zone_fee_matrix) : null,
       cash_on_delivery, telebirr_enabled, cbe_enabled, telegram_notifs, req.params.storeId]
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

/**
 * PUT /api/v1/stores/:storeId/settings
 * Update store settings (auto-detect products, etc.)
 */
router.put('/:storeId/settings', requireAuth, async (req, res, next) => {
  try {
    const { auto_detect_products } = req.body;

    const storeCheck = await query(
      'SELECT store_id FROM stores WHERE store_id = $1 AND admin_tg_user_id = $2',
      [req.params.storeId, req.user.tg_user_id]
    );
    if (storeCheck.rows.length === 0) return res.status(403).json({ error: 'Not authorized' });

    await query(
      'UPDATE stores SET auto_detect_products = $1, updated_at = NOW() WHERE store_id = $2',
      [auto_detect_products, req.params.storeId]
    );

    res.json({ success: true, auto_detect_products });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/stores/:storeId/verification
 * Get store verification status and tier
 */
router.get('/:storeId/verification', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT verification_tier, verification_requested_at, group_member_count,
              total_orders, rating, rating_count, status
       FROM stores WHERE store_id = $1`,
      [req.params.storeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Store not found' });

    const store = result.rows[0];

    // Check pending verification requests
    const pendingVerif = await query(
      `SELECT verification_id, status, submitted_at, verification_type
       FROM seller_verifications
       WHERE store_id = $1 AND status = 'pending'
       ORDER BY submitted_at DESC LIMIT 1`,
      [req.params.storeId]
    );

    res.json({
      tier: store.verification_tier || 'none',
      status: store.status,
      total_orders: store.total_orders,
      rating: store.rating,
      rating_count: store.rating_count,
      group_member_count: store.group_member_count,
      pending_request: pendingVerif.rows[0] || null,
      // Progress to next tier
      next_tier: getNextTier(store)
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/stores/:storeId/verify-request
 * Submit a verification request
 */
router.post('/:storeId/verify-request', requireAuth, async (req, res, next) => {
  try {
    const { notes, verification_type } = req.body;

    const storeCheck = await query(
      'SELECT store_id FROM stores WHERE store_id = $1 AND admin_tg_user_id = $2',
      [req.params.storeId, req.user.tg_user_id]
    );
    if (storeCheck.rows.length === 0) return res.status(403).json({ error: 'Not authorized' });

    // Check if already pending
    const existing = await query(
      `SELECT verification_id FROM seller_verifications
       WHERE store_id = $1 AND status = 'pending'`,
      [req.params.storeId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You already have a pending verification request' });
    }

    const result = await query(
      `INSERT INTO seller_verifications (store_id, notes, verification_type)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.storeId, notes || null, verification_type || 'basic']
    );

    await query(
      'UPDATE stores SET verification_requested_at = NOW() WHERE store_id = $1',
      [req.params.storeId]
    );

    res.status(201).json({ verification: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/stores/:storeId/verify-password
 * Verify seller password (returns store_code + access token on success)
 */
router.post('/:storeId/verify-password', requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    const result = await query(
      'SELECT store_id, store_name, store_slug, store_code, seller_password_hash FROM stores WHERE store_id = $1 AND admin_tg_user_id = $2',
      [req.params.storeId, req.user.tg_user_id]
    );
    if (result.rows.length === 0) return res.status(403).json({ error: 'Not authorized' });

    const store = result.rows[0];
    if (!store.seller_password_hash) {
      // No password set yet — allow set flow instead
      return res.status(400).json({ error: 'No password set', needs_setup: true });
    }

    const [salt, storedHash] = store.seller_password_hash.split(':');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    if (hash !== storedHash) return res.status(401).json({ error: 'Incorrect password' });

    delete store.seller_password_hash;
    res.json({ store, message: 'Password verified' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/stores/:storeId/set-password
 * Set initial seller password (for stores without one)
 */
router.post('/:storeId/set-password', requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const storeCheck = await query(
      'SELECT store_id, seller_password_hash FROM stores WHERE store_id = $1 AND admin_tg_user_id = $2',
      [req.params.storeId, req.user.tg_user_id]
    );
    if (storeCheck.rows.length === 0) return res.status(403).json({ error: 'Not authorized' });
    if (storeCheck.rows[0].seller_password_hash) return res.status(400).json({ error: 'Password already set' });

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');

    await query('UPDATE stores SET seller_password_hash = $1 WHERE store_id = $2', [passwordHash, req.params.storeId]);
    res.json({ message: 'Password set successfully' });
  } catch (err) {
    next(err);
  }
});

function getNextTier(store) {
  const tier = store.verification_tier || 'none';
  if (tier === 'trusted') return null;
  if (tier === 'verified') return { tier: 'trusted', requirement: '50+ orders, 4.0+ rating, 30+ days active' };
  if (tier === 'basic') return { tier: 'verified', requirement: '10+ completed orders or 500+ group members' };
  return { tier: 'basic', requirement: 'Link your Telegram group' };
}

module.exports = router;
