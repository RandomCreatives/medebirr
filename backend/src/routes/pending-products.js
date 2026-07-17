/**
 * Pending Products routes
 *
 * Telegram (group / scraper bot) posts create draft "pending products" in the
 * `pending_products` table. Sellers finish them in the Seller Studio and
 * publish them as real products. The frontend (Api.pending.*) depends on the
 * four endpoints below — they were previously missing, leaving the
 * "From Telegram" flow broken.
 */

const express = require('express');
const { requireAuth, requireSellerOf } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

/**
 * GET /api/v1/pending-products/store/:storeId
 * List a store's pending products (status pending or completed, not published/discarded).
 */
router.get('/store/:storeId', requireAuth, requireSellerOf('storeId'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM pending_products
       WHERE store_id = $1 AND status IN ('pending', 'completed')
       ORDER BY detected_at DESC`,
      [req.params.storeId]
    );
    res.json({ pending_products: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/pending-products/:id/complete
 * Seller fills in the remaining required fields (story/specs/materials, etc.).
 * Stores them on the draft and flips status to 'completed'.
 */
router.put('/:id/complete', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title, description, category, sub_category, price_etb, compare_price,
      stock_quantity, tags, image_urls
    } = req.body;

    const ownership = await query(
      `SELECT pp.* FROM pending_products pp
       JOIN stores s ON pp.store_id = s.store_id
       WHERE pp.pending_id = $1 AND s.admin_tg_user_id = $2`,
      [id, req.user.tg_user_id]
    );
    if (ownership.rows.length === 0) return res.status(404).json({ error: 'Pending product not found' });

    // NOTE: pending_products only stores the columns below. Rich product fields
    // (product_story / specifications / materials / etc.) are passed at publish
    // time (see POST /publish) and inserted directly into the products table.
    const result = await query(
      `UPDATE pending_products SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         category = COALESCE($3, category),
         sub_category = COALESCE($4, sub_category),
         price_etb = COALESCE($5, price_etb),
         compare_price = COALESCE($6, compare_price),
         stock_quantity = COALESCE($7, stock_quantity),
         tags = COALESCE($8, tags),
         image_urls = COALESCE($9, image_urls),
         status = 'completed',
         completed_at = NOW()
       WHERE pending_id = $10
       RETURNING *`,
      [title, description, category, sub_category, price_etb, compare_price,
       stock_quantity, tags, image_urls, id]
    );

    res.json({ pending_product: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pending-products/:id/publish
 * Convert the completed draft into a real published product and broadcast to
 * the store's Telegram group if linked.
 *
 * The draft (pending_products) only holds core fields. Seller-entered rich
 * detail (product_story / specifications / materials / shipping / duty /
 * return / sku / variants) may be supplied in the request body and is inserted
 * straight into the products table. Story/specs/materials fall back to the
 * description so they satisfy the products table's NOT-empty requirement.
 */
router.post('/:id/publish', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const ownership = await query(
      `SELECT pp.*, s.admin_tg_user_id, s.store_id
       FROM pending_products pp
       JOIN stores s ON pp.store_id = s.store_id
       WHERE pp.pending_id = $1 AND s.admin_tg_user_id = $2`,
      [id, req.user.tg_user_id]
    );
    if (ownership.rows.length === 0) return res.status(404).json({ error: 'Pending product not found' });
    const pending = ownership.rows[0];

    if (!pending.title || pending.price_etb == null || !pending.category) {
      return res.status(422).json({ error: 'Please complete the product details before publishing' });
    }

    const story = body.product_story || pending.description || '';
    const specs = body.specifications || pending.description || '';
    const materials = body.materials || '';

    const result = await query(
      `INSERT INTO products (
         store_id, title, description, price_etb, compare_price, sku,
         stock_quantity, category, sub_category, tags, image_urls, variants,
         is_published, is_featured, product_story, specifications, materials,
         shipping_info, duty_info, return_info
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,FALSE,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [pending.store_id, pending.title, pending.description || null, pending.price_etb,
       pending.compare_price || null, body.sku || null, pending.stock_quantity || 0,
       pending.category, pending.sub_category || null, pending.tags || [], pending.image_urls || [],
       JSON.stringify(body.variants || []), story, specs, materials,
       body.shipping_info || null, body.duty_info || null, body.return_info || null]
    );
    const product = result.rows[0];

    // Link draft to the published product and mark published
    await query(
      `UPDATE pending_products SET status = 'published', product_id = $1, published_at = NOW()
       WHERE pending_id = $2`,
      [product.product_id, id]
    );

    // Broadcast to the store's Telegram group if linked
    let telegramWarning = null;
    try {
      const tgService = require('../services/telegram');
      const storeData = await query(
        `SELECT s.*, sp.return_policy_type FROM stores s
         LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
         WHERE s.store_id = $1`,
        [pending.store_id]
      );
      const store = storeData.rows[0];
      if (store?.tg_group_id) {
        const msgId = await tgService.broadcastProduct(store.tg_group_id, product, store);
        if (msgId) {
          query('UPDATE products SET tg_message_id = $1 WHERE product_id = $2', [msgId, product.product_id]).catch(() => {});
        }
      }
    } catch (e) {
      telegramWarning = 'Product published but Telegram broadcast failed. Make sure the bot is admin in your group.';
    }

    res.status(201).json({ product, telegram_warning: telegramWarning });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/pending-products/:id
 * Discard a pending product (also reachable via Telegram "discard" button).
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE pending_products SET status = 'discarded'
       WHERE pending_id = $1
         AND store_id IN (SELECT store_id FROM stores WHERE admin_tg_user_id = $2)
       RETURNING pending_id`,
      [req.params.id, req.user.tg_user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pending product not found' });
    res.json({ message: 'Pending product discarded' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
