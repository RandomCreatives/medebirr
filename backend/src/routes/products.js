const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth, requireSellerOf } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

/**
 * GET /api/v1/products
 * Public product discovery with faceted filtering
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      search, category, sub_city, store_id,
      min_price, max_price, return_policy,
      sort = 'featured', page = 1, limit = 20
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [];
    const conditions = ['p.is_published = TRUE', "s.status = 'verified'"];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.title ILIKE $${params.length} OR p.description ILIKE $${params.length} OR s.store_name ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      conditions.push(`p.category = $${params.length}`);
    }
    if (store_id) {
      params.push(store_id);
      conditions.push(`p.store_id = $${params.length}`);
    }
    if (sub_city) {
      params.push(sub_city);
      conditions.push(`s.location_sub_city = $${params.length}`);
    }
    if (min_price) {
      params.push(min_price);
      conditions.push(`p.price_etb >= $${params.length}`);
    }
    if (max_price) {
      params.push(max_price);
      conditions.push(`p.price_etb <= $${params.length}`);
    }
    if (return_policy) {
      params.push(return_policy);
      conditions.push(`sp.return_policy_type = $${params.length}`);
    }

    const orderMap = {
      featured: 'p.is_featured DESC, p.order_count DESC',
      newest: 'p.created_at DESC',
      price_asc: 'p.price_etb ASC',
      price_desc: 'p.price_etb DESC',
      rating: 'p.rating DESC, p.rating_count DESC',
      popular: 'p.order_count DESC'
    };
    const orderBy = orderMap[sort] || orderMap.featured;

    params.push(limit, offset);

    const result = await query(
      `SELECT p.product_id, p.title, p.price_etb, p.compare_price, p.stock_quantity,
              p.category, p.image_urls, p.rating, p.rating_count, p.order_count,
              p.is_featured, p.variants,
              s.store_id, s.store_name, s.store_slug, s.location_sub_city,
              s.verified_badge, s.rating AS store_rating,
              sp.return_policy_type, sp.addis_delivery_fee,
              sp.cash_on_delivery, sp.telebirr_enabled
       FROM products p
       JOIN stores s ON p.store_id = s.store_id
       LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Count query for pagination
    const countResult = await query(
      `SELECT COUNT(*) FROM products p
       JOIN stores s ON p.store_id = s.store_id
       LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
       WHERE ${conditions.join(' AND ')}`,
      params.slice(0, -2)
    );

    res.json({
      products: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/products/:productId
 * Single product detail
 */
router.get('/:productId', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT p.*, s.store_name, s.store_slug, s.location_sub_city, s.location_woreda,
              s.tg_channel_username, s.verified_badge, s.rating AS store_rating, s.total_orders,
              sp.return_policy_type, sp.custom_policy_text, sp.addis_delivery_fee,
              sp.regional_dispatch_fee, sp.zone_fee_matrix, sp.cash_on_delivery,
              sp.telebirr_enabled, sp.chapa_enabled, sp.free_delivery_threshold
       FROM products p
       JOIN stores s ON p.store_id = s.store_id
       LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
       WHERE p.product_id = $1 AND p.is_published = TRUE`,
      [req.params.productId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });

    // Increment view count
    query('UPDATE products SET view_count = view_count + 1 WHERE product_id = $1', [req.params.productId]);

    res.json({ product: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/products
 * Create product (seller only)
 */
router.post(
  '/',
  requireAuth,
  [
    body('store_id').notEmpty().isUUID(),
    body('title').trim().notEmpty().isLength({ min: 3, max: 255 }),
    body('price_etb').isFloat({ min: 0 }),
    body('stock_quantity').isInt({ min: 0 }),
    body('category').notEmpty()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      // Verify seller owns this store
      const storeCheck = await query(
        'SELECT store_id FROM stores WHERE store_id = $1 AND admin_tg_user_id = $2',
        [req.body.store_id, req.user.tg_user_id]
      );
      if (storeCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Not authorized for this store' });
      }

      const {
        store_id, title, description, price_etb, compare_price,
        sku, stock_quantity, category, sub_category, tags,
        image_urls, variants, is_published = false, is_featured = false
      } = req.body;

      const result = await query(
        `INSERT INTO products (
          store_id, title, description, price_etb, compare_price, sku,
          stock_quantity, category, sub_category, tags, image_urls, variants,
          is_published, is_featured
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *`,
        [store_id, title, description || null, price_etb, compare_price || null,
         sku || null, stock_quantity, category, sub_category || null,
         tags || [], image_urls || [], JSON.stringify(variants || []),
         is_published, is_featured]
      );

      // If published and store has a linked group, broadcast to Telegram
      if (is_published && storeCheck.rows[0]) {
        const tgService = require('../services/telegram');
        const storeData = await query(
          `SELECT s.*, sp.return_policy_type FROM stores s
           LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
           WHERE s.store_id = $1`,
          [store_id]
        );
        const store = storeData.rows[0];
        if (store?.tg_group_id) {
          tgService.broadcastProduct(store.tg_group_id, result.rows[0], store)
            .then(msgId => {
              if (msgId) query('UPDATE products SET tg_message_id = $1 WHERE product_id = $2',
                [msgId, result.rows[0].product_id]).catch(() => {});
            })
            .catch(e => console.warn('Telegram broadcast failed:', e.message));
        }
      }

      res.status(201).json({ product: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/v1/products/:productId
 * Update product
 */
router.put('/:productId', requireAuth, async (req, res, next) => {
  try {
    // Verify ownership
    const ownership = await query(
      `SELECT p.product_id FROM products p
       JOIN stores s ON p.store_id = s.store_id
       WHERE p.product_id = $1 AND s.admin_tg_user_id = $2`,
      [req.params.productId, req.user.tg_user_id]
    );
    if (ownership.rows.length === 0) return res.status(403).json({ error: 'Not authorized' });

    const {
      title, description, price_etb, compare_price, sku,
      stock_quantity, category, sub_category, tags,
      image_urls, variants, is_published, is_featured
    } = req.body;

    const result = await query(
      `UPDATE products SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        price_etb = COALESCE($3, price_etb),
        compare_price = COALESCE($4, compare_price),
        sku = COALESCE($5, sku),
        stock_quantity = COALESCE($6, stock_quantity),
        category = COALESCE($7, category),
        sub_category = COALESCE($8, sub_category),
        tags = COALESCE($9, tags),
        image_urls = COALESCE($10, image_urls),
        variants = COALESCE($11, variants),
        is_published = COALESCE($12, is_published),
        is_featured = COALESCE($13, is_featured),
        updated_at = NOW()
       WHERE product_id = $14
       RETURNING *`,
      [title, description, price_etb, compare_price, sku,
       stock_quantity, category, sub_category, tags,
       image_urls, variants ? JSON.stringify(variants) : null,
       is_published, is_featured, req.params.productId]
    );

    // If just published (is_published toggled to true), broadcast to Telegram group
    if (is_published === true) {
      const tgService = require('../services/telegram');
      const storeData = await query(
        `SELECT s.*, sp.return_policy_type FROM stores s
         LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
         WHERE s.store_id = (SELECT store_id FROM products WHERE product_id = $1)`,
        [req.params.productId]
      );
      const store = storeData.rows[0];
      if (store?.tg_group_id && result.rows[0]) {
        tgService.broadcastProduct(store.tg_group_id, result.rows[0], store)
          .then(msgId => {
            if (msgId) query('UPDATE products SET tg_message_id = $1 WHERE product_id = $2',
              [msgId, req.params.productId]).catch(() => {});
          })
          .catch(e => console.warn('Telegram broadcast failed:', e.message));
      }
    }

    res.json({ product: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/products/:productId
 */
router.delete('/:productId', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `DELETE FROM products p USING stores s
       WHERE p.product_id = $1 AND p.store_id = s.store_id AND s.admin_tg_user_id = $2
       RETURNING product_id`,
      [req.params.productId, req.user.tg_user_id]
    );
    if (result.rows.length === 0) return res.status(403).json({ error: 'Not authorized or not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
