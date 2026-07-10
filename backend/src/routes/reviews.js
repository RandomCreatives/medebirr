const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { order_id, product_id, rating, comment } = req.body;
    const tg_user_id = req.user.tg_user_id;

    if (!order_id || !product_id || !rating) {
      return res.status(400).json({ error: 'order_id, product_id, and rating are required' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const orderCheck = await query(
      `SELECT store_id FROM orders WHERE order_id = $1 AND buyer_tg_user_id = $2`,
      [order_id, tg_user_id]
    );
    if (orderCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Order not found or not yours' });
    }
    const store_id = orderCheck.rows[0].store_id;

    const result = await query(
      `INSERT INTO reviews (order_id, product_id, store_id, reviewer_tg_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (order_id, product_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
       RETURNING *`,
      [order_id, product_id, store_id, tg_user_id, rating, comment || null]
    );

    await query(
      `UPDATE products SET rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE product_id = $1),
                           rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = $1)
       WHERE product_id = $1`,
      [product_id]
    );

    res.status(201).json({ review: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/product/:productId', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT r.review_id, r.rating, r.comment, r.created_at,
              u.first_name, u.last_name, u.username
       FROM reviews r
       JOIN users u ON r.reviewer_tg_id = u.tg_user_id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [req.params.productId]
    );
    res.json({ reviews: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
