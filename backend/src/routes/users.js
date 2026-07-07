const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

/**
 * GET /api/v1/users/me
 * Get current user profile
 */
router.get('/me', requireAuth, async (req, res) => {
  const storeResult = await query(
    `SELECT s.store_id, s.store_name, s.store_slug, s.status, s.verified_badge,
            sp.return_policy_type, sp.addis_delivery_fee
     FROM stores s
     LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
     WHERE s.admin_tg_user_id = $1`,
    [req.user.tg_user_id]
  );
  res.json({ user: req.user, stores: storeResult.rows });
});

/**
 * GET /api/v1/users/me/addresses
 */
router.get('/me/addresses', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM delivery_addresses WHERE tg_user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [req.user.tg_user_id]
    );
    res.json({ addresses: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/users/me/addresses
 */
router.post('/me/addresses', requireAuth, async (req, res, next) => {
  try {
    const { label, sub_city, woreda, house_number, landmark, phone, is_default } = req.body;
    if (!sub_city || !phone) return res.status(400).json({ error: 'sub_city and phone are required' });

    if (is_default) {
      await query('UPDATE delivery_addresses SET is_default = FALSE WHERE tg_user_id = $1', [req.user.tg_user_id]);
    }

    const result = await query(
      `INSERT INTO delivery_addresses (tg_user_id, label, sub_city, woreda, house_number, landmark, phone, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.tg_user_id, label || 'Home', sub_city, woreda || null, house_number || null, landmark || null, phone, is_default || false]
    );
    res.status(201).json({ address: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/users/me/addresses/:addressId
 */
router.delete('/me/addresses/:addressId', requireAuth, async (req, res, next) => {
  try {
    await query(
      'DELETE FROM delivery_addresses WHERE address_id = $1 AND tg_user_id = $2',
      [req.params.addressId, req.user.tg_user_id]
    );
    res.json({ message: 'Address deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/users/me/wishlist
 */
router.get('/me/wishlist', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT p.product_id, p.title, p.price_etb, p.image_urls, p.category,
              s.store_name, s.store_slug, sp.return_policy_type
       FROM wishlists w
       JOIN products p ON w.product_id = p.product_id
       JOIN stores s ON p.store_id = s.store_id
       LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
       WHERE w.tg_user_id = $1
       ORDER BY w.created_at DESC`,
      [req.user.tg_user_id]
    );
    res.json({ wishlist: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/users/me/wishlist/:productId
 */
router.post('/me/wishlist/:productId', requireAuth, async (req, res, next) => {
  try {
    await query(
      'INSERT INTO wishlists (tg_user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.tg_user_id, req.params.productId]
    );
    res.json({ message: 'Added to wishlist' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/users/me/wishlist/:productId
 */
router.delete('/me/wishlist/:productId', requireAuth, async (req, res, next) => {
  try {
    await query(
      'DELETE FROM wishlists WHERE tg_user_id = $1 AND product_id = $2',
      [req.user.tg_user_id, req.params.productId]
    );
    res.json({ message: 'Removed from wishlist' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/users/me/notifications
 */
router.get('/me/notifications', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM notifications WHERE tg_user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.tg_user_id]
    );
    await query('UPDATE notifications SET is_read = TRUE WHERE tg_user_id = $1 AND is_read = FALSE', [req.user.tg_user_id]);
    res.json({ notifications: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
