/**
 * Pending Products routes
 * Manages products detected from Telegram posts, awaiting seller completion
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');
const tg = require('../services/telegram');

const router = express.Router();

// Secure all routes under /pending-products
router.use(requireAuth);

/**
 * GET /api/v1/pending-products/store/:storeId
 * List pending products for a store (seller only)
 */
router.get('/store/:storeId', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT pp.*, s.store_name, s.admin_tg_user_id
       FROM pending_products pp
       JOIN stores s ON pp.store_id = s.store_id
       WHERE pp.store_id = $1
         AND s.admin_tg_user_id = $2
         AND pp.status IN ('pending', 'completed')
       ORDER BY pp.detected_at DESC
       LIMIT 50`,
      [req.params.storeId, req.user.tg_user_id]
    );
    res.json({ pending_products: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/pending-products/:id/complete
 * Seller completes a pending product (adds description, category, etc.)
 */
router.put('/:id/complete', async (req, res, next) => {
  try {
    const { title, description, category, sub_category, price_etb, compare_price,
            stock_quantity, tags, image_urls } = req.body;

    if (!description || !category) {
      return res.status(400).json({ error: 'description and category are required' });
    }

    // Verify ownership
    const check = await query(
      `SELECT pp.*, s.admin_tg_user_id
       FROM pending_products pp
       JOIN stores s ON pp.store_id = s.store_id
       WHERE pp.pending_id = $1 AND s.admin_tg_user_id = $2`,
      [req.params.id, req.user.tg_user_id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Pending product not found' });
    }

    const result = await query(
      `UPDATE pending_products SET
        title = COALESCE($2, title),
        description = $3,
        category = $4,
        sub_category = $5,
        price_etb = COALESCE($6, price_etb),
        compare_price = $7,
        stock_quantity = $8,
        tags = $9,
        image_urls = COALESCE($10, image_urls),
        status = 'completed',
        completed_at = NOW()
       WHERE pending_id = $1 RETURNING *`,
      [req.params.id, title, description, category, sub_category || null,
       price_etb || null, compare_price || null, stock_quantity || 1,
       tags || null, image_urls || null]
    );

    res.json({ pending_product: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pending-products/:id/publish
 * Publish a completed pending product → creates product + broadcasts to Telegram group
 */
router.post('/:id/publish', async (req, res, next) => {
  try {
    // Verify ownership and get pending product
    const check = await query(
      `SELECT pp.*, s.admin_tg_user_id, s.store_name, s.tg_group_id,
              s.location_sub_city, s.verification_tier, s.verified_badge
       FROM pending_products pp
       JOIN stores s ON pp.store_id = s.store_id
       WHERE pp.pending_id = $1 AND s.admin_tg_user_id = $2`,
      [req.params.id, req.user.tg_user_id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Pending product not found' });
    }

    const pending = check.rows[0];
    if (pending.status !== 'completed') {
      return res.status(400).json({ error: 'Product must be completed before publishing' });
    }

    // Create the actual product
    const productResult = await query(
      `INSERT INTO products
       (store_id, title, description, price_etb, compare_price, stock_quantity,
        category, sub_category, tags, image_urls, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
       RETURNING *`,
      [pending.store_id, pending.title, req.body.description || pending.description,
       pending.price_etb, pending.compare_price, pending.stock_quantity || 1,
       req.body.category || pending.category, pending.sub_category,
       pending.tags, pending.image_urls]
    );
    const product = productResult.rows[0];

    // Link pending product to created product
    await query(
      `UPDATE pending_products SET
        product_id = $2, status = 'published', published_at = NOW()
       WHERE pending_id = $1`,
      [req.params.id, product.product_id]
    );

    // Broadcast to Telegram group if group is linked
    let tgMessageId = null;
    if (pending.tg_group_id) {
      try {
        const store = {
          store_name: pending.store_name,
          return_policy_type: null,
          location_sub_city: pending.location_sub_city,
          verified_badge: pending.verified_badge
        };
        tgMessageId = await tg.broadcastProduct(
          pending.tg_group_id, product, store,
          process.env.FRONTEND_URL || 'https://medebirr.vercel.app'
        );
        // Save the Telegram message ID
        await query('UPDATE products SET tg_message_id = $2 WHERE product_id = $1', [product.product_id, tgMessageId]);
      } catch (e) {
        console.warn('Failed to broadcast to Telegram group:', e.message);
      }
    }

    res.json({
      product,
      tg_message_id: tgMessageId,
      message: 'Product published' + (tgMessageId ? ' and broadcast to Telegram group' : '')
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/pending-products/:id
 * Discard a pending product
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const check = await query(
      `SELECT pp.pending_id, s.admin_tg_user_id
       FROM pending_products pp
       JOIN stores s ON pp.store_id = s.store_id
       WHERE pp.pending_id = $1 AND s.admin_tg_user_id = $2`,
      [req.params.id, req.user.tg_user_id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Pending product not found' });
    }

    await query(
      `UPDATE pending_products SET status = 'discarded' WHERE pending_id = $1`,
      [req.params.id]
    );

    res.json({ message: 'Pending product discarded' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
