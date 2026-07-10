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
 * PUT /api/v1/users/me
 * Update current user profile
 */
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { first_name, last_name, email, phone, mfa_enabled } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (first_name !== undefined) { updates.push(`first_name = $${idx++}`); values.push(first_name); }
    if (last_name !== undefined)  { updates.push(`last_name = $${idx++}`);  values.push(last_name); }
    if (email !== undefined)      { updates.push(`email = $${idx++}`);      values.push(email); }
    if (phone !== undefined)      { updates.push(`phone = $${idx++}`);      values.push(phone); }
    if (mfa_enabled !== undefined){ updates.push(`mfa_enabled = $${idx++}`); values.push(mfa_enabled); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.user.tg_user_id);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE tg_user_id = $${idx} RETURNING *`,
      values
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
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
 * PUT /api/v1/users/me/addresses/:addressId
 * Update an existing address
 */
router.put('/me/addresses/:addressId', requireAuth, async (req, res, next) => {
  try {
    const { label, sub_city, woreda, house_number, landmark, phone, is_default } = req.body;
    if (is_default) {
      await query('UPDATE delivery_addresses SET is_default = FALSE WHERE tg_user_id = $1', [req.user.tg_user_id]);
    }
    const result = await query(
      `UPDATE delivery_addresses
       SET label = COALESCE($1, label), sub_city = COALESCE($2, sub_city),
           woreda = COALESCE($3, woreda), house_number = COALESCE($4, house_number),
           landmark = COALESCE($5, landmark), phone = COALESCE($6, phone),
           is_default = COALESCE($7, is_default)
       WHERE address_id = $8 AND tg_user_id = $9 RETURNING *`,
      [label, sub_city, woreda, house_number, landmark, phone, is_default, req.params.addressId, req.user.tg_user_id]
    );
    res.json({ address: result.rows[0] });
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
