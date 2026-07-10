const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

/**
 * GET /api/v1/users/me/coupons
 * List coupons assigned to current user
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT uc.id, uc.is_redeemed, uc.redeemed_at, uc.created_at,
              c.coupon_id, c.code, c.discount_type, c.discount_value,
              c.min_order_etb, c.expires_at, c.is_active
       FROM user_coupons uc
       JOIN coupons c ON uc.coupon_id = c.coupon_id
       WHERE uc.tg_user_id = $1 AND c.is_active = TRUE
       ORDER BY uc.is_redeemed ASC, c.expires_at ASC NULLS LAST`,
      [req.user.tg_user_id]
    );
    res.json({ coupons: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/coupons/validate
 * Validate and claim a promotional code
 */
router.post('/validate', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Please enter a coupon code' });
    }

    const couponResult = await query(
      'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND is_active = TRUE',
      [code.trim()]
    );

    if (couponResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid coupon code' });
    }

    const coupon = couponResult.rows[0];

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This coupon has expired' });
    }

    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
      return res.status(400).json({ error: 'This coupon has reached its usage limit' });
    }

    const existing = await query(
      'SELECT id FROM user_coupons WHERE tg_user_id = $1 AND coupon_id = $2',
      [req.user.tg_user_id, coupon.coupon_id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You have already claimed this coupon' });
    }

    await query(
      'INSERT INTO user_coupons (tg_user_id, coupon_id) VALUES ($1, $2)',
      [req.user.tg_user_id, coupon.coupon_id]
    );

    await query(
      'UPDATE coupons SET used_count = used_count + 1 WHERE coupon_id = $1',
      [coupon.coupon_id]
    );

    const discount = coupon.discount_type === 'percent'
      ? `${coupon.discount_value}% OFF`
      : `Br ${Number(coupon.discount_value).toLocaleString()} OFF`;

    res.json({
      message: `Coupon claimed: ${discount}`,
      coupon: {
        coupon_id: coupon.coupon_id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        min_order_etb: coupon.min_order_etb,
        expires_at: coupon.expires_at,
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
