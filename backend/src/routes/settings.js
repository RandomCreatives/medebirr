const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

/**
 * GET /api/v1/users/me/settings
 * Get user application settings
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    let result = await query(
      'SELECT * FROM user_settings WHERE tg_user_id = $1',
      [req.user.tg_user_id]
    );

    if (result.rows.length === 0) {
      await query(
        `INSERT INTO user_settings (tg_user_id) VALUES ($1)`,
        [req.user.tg_user_id]
      );
      result = await query(
        'SELECT * FROM user_settings WHERE tg_user_id = $1',
        [req.user.tg_user_id]
      );
    }

    res.json({ settings: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/users/me/settings
 * Update user application settings
 */
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const { dark_mode, notif_orders, notif_promos, notif_chat, biometric_login } = req.body;

    await query(
      `INSERT INTO user_settings (tg_user_id, dark_mode, notif_orders, notif_promos, notif_chat, biometric_login)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tg_user_id) DO UPDATE SET
         dark_mode = COALESCE($2, user_settings.dark_mode),
         notif_orders = COALESCE($3, user_settings.notif_orders),
         notif_promos = COALESCE($4, user_settings.notif_promos),
         notif_chat = COALESCE($5, user_settings.notif_chat),
         biometric_login = COALESCE($6, user_settings.biometric_login),
         updated_at = NOW()`,
      [req.user.tg_user_id, dark_mode, notif_orders, notif_promos, notif_chat, biometric_login]
    );

    const result = await query(
      'SELECT * FROM user_settings WHERE tg_user_id = $1',
      [req.user.tg_user_id]
    );

    res.json({ settings: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
