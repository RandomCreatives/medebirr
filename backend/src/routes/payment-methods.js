const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

/**
 * GET /api/v1/users/me/payment-methods
 * List saved payment methods for current user
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT method_id, card_brand, last_four, exp_month, exp_year, cardholder_name, is_default, created_at
       FROM payment_methods WHERE tg_user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.user.tg_user_id]
    );
    res.json({ methods: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/users/me/payment-methods
 * Add a new payment method (stores only last 4 digits — PCI compliant)
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { card_brand, last_four, exp_month, exp_year, cardholder_name, is_default } = req.body;
    if (!card_brand || !last_four || !exp_month || !exp_year) {
      return res.status(400).json({ error: 'card_brand, last_four, exp_month, and exp_year are required' });
    }
    if (!/^\d{4}$/.test(last_four)) {
      return res.status(400).json({ error: 'last_four must be exactly 4 digits' });
    }

    if (is_default) {
      await query('UPDATE payment_methods SET is_default = FALSE WHERE tg_user_id = $1', [req.user.tg_user_id]);
    }

    const result = await query(
      `INSERT INTO payment_methods (tg_user_id, card_brand, last_four, exp_month, exp_year, cardholder_name, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.tg_user_id, card_brand, last_four, exp_month, exp_year, cardholder_name || null, is_default || false]
    );
    res.status(201).json({ method: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/users/me/payment-methods/:methodId
 */
router.delete('/:methodId', requireAuth, async (req, res, next) => {
  try {
    await query(
      'DELETE FROM payment_methods WHERE method_id = $1 AND tg_user_id = $2',
      [req.params.methodId, req.user.tg_user_id]
    );
    res.json({ message: 'Payment method deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/users/me/payment-methods/:methodId/default
 * Set a payment method as default
 */
router.patch('/:methodId/default', requireAuth, async (req, res, next) => {
  try {
    await query('UPDATE payment_methods SET is_default = FALSE WHERE tg_user_id = $1', [req.user.tg_user_id]);
    await query(
      'UPDATE payment_methods SET is_default = TRUE WHERE method_id = $1 AND tg_user_id = $2',
      [req.params.methodId, req.user.tg_user_id]
    );
    res.json({ message: 'Default payment method updated' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
