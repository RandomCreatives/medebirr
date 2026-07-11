const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

/**
 * POST /api/v1/social/share
 * Track a product share — auto-issue coupon if threshold reached
 */
router.post('/share', requireAuth, [
  body('product_id').isUUID(),
  body('shared_to').optional().isString(),
  body('platform').optional().isIn(['telegram', 'whatsapp', 'copy', 'other'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { product_id, shared_to, platform } = req.body;
    const tgUserId = req.user.tg_user_id;

    // Record the share
    await query(
      `INSERT INTO product_shares (product_id, tg_user_id, shared_to, platform)
       VALUES ($1, $2, $3, $4)`,
      [product_id, shared_to || null, tgUserId, platform || 'telegram']
    );

    // Get store_id from the product and check coupon policy
    const prodResult = await query(
      'SELECT p.store_id, s.telegram_notifs FROM products p JOIN stores s ON p.store_id = s.store_id WHERE p.product_id = $1',
      [product_id]
    );
    if (prodResult.rows.length === 0) return res.status(404).json({ error: 'Product not found' });

    const storeId = prodResult.rows[0].store_id;

    const policyResult = await query(
      'SELECT * FROM coupon_policies WHERE store_id = $1',
      [storeId]
    );
    const policy = policyResult.rows[0];
    let couponIssued = false;

    if (policy && policy.share_coupon_active) {
      // Count total shares by this user for any product in this store
      const shareCountResult = await query(
        `SELECT COUNT(*) AS cnt FROM product_shares ps
         JOIN products p ON ps.product_id = p.product_id
         WHERE p.store_id = $1 AND ps.tg_user_id = $2`,
        [storeId, tgUserId]
      );
      const shareCount = parseInt(shareCountResult.rows[0].cnt);

      if (shareCount >= policy.share_required) {
        // Issue a coupon
        const code = 'SHR' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const validUntil = new Date(Date.now() + policy.coupon_validity_days * 86400000).toISOString();

        // Check if user already has an active coupon for this store
        const existing = await query(
          `SELECT coupon_id FROM coupons
           WHERE store_id = $1 AND tg_user_id = $2 AND status = 'active' AND valid_until > NOW()`,
          [storeId, tgUserId]
        );

        if (existing.rows.length === 0) {
          await query(
            `INSERT INTO coupons (store_id, tg_user_id, code, discount_percent, valid_until)
             VALUES ($1, $2, $3, $4, $5)`,
            [storeId, tgUserId, code, policy.share_discount, validUntil]
          );
          couponIssued = true;
        }
      }
    }

    res.json({ shared: true, coupon_issued: couponIssued });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/social/coupons
 * Get current user's active coupons
 */
router.get('/coupons', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.*, s.store_name
       FROM coupons c
       JOIN stores s ON c.store_id = s.store_id
       WHERE c.tg_user_id = $1 AND c.status = 'active' AND c.valid_until > NOW()
       ORDER BY c.valid_until ASC`,
      [req.user.tg_user_id]
    );
    res.json({ coupons: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/social/coupons/history
 * Get all user's coupons (including used/expired)
 */
router.get('/coupons/history', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.*, s.store_name
       FROM coupons c
       JOIN stores s ON c.store_id = s.store_id
       WHERE c.tg_user_id = $1
       ORDER BY c.created_at DESC LIMIT 50`,
      [req.user.tg_user_id]
    );
    res.json({ coupons: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/social/group-buy
 * Create a group buy session
 */
router.post('/group-buy', requireAuth, [
  body('product_id').isUUID()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { product_id } = req.body;
    const tgUserId = req.user.tg_user_id;

    // Get product and store policy
    const prodResult = await query('SELECT store_id FROM products WHERE product_id = $1 AND is_published = TRUE', [product_id]);
    if (prodResult.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const storeId = prodResult.rows[0].store_id;

    const policyResult = await query('SELECT * FROM coupon_policies WHERE store_id = $1', [storeId]);
    const policy = policyResult.rows[0];
    if (!policy || !policy.group_buy_active) return res.status(400).json({ error: 'Group buying not available for this store' });

    // Check if user already has an open group buy for this product
    const existing = await query(
      `SELECT * FROM group_buys
       WHERE product_id = $1 AND creator_tg_user_id = $2 AND status = 'open' AND expires_at > NOW()`,
      [product_id, tgUserId]
    );
    if (existing.rows.length > 0) return res.json({ group_buy: existing.rows[0] });

    const expiresAt = new Date(Date.now() + 48 * 3600000).toISOString(); // 48h expiry

    const result = await query(
      `INSERT INTO group_buys (product_id, store_id, creator_tg_user_id, min_members, discount_percent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [product_id, storeId, tgUserId, policy.group_min_members, policy.group_discount, expiresAt]
    );

    // Auto-join creator as first member
    await query(
      'INSERT INTO group_buy_members (group_buy_id, tg_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [result.rows[0].group_buy_id, tgUserId]
    );

    res.status(201).json({ group_buy: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/social/group-buy/:id
 * Get group buy details with members
 */
router.get('/group-buy/:id', async (req, res, next) => {
  try {
    const [gbResult, membersResult] = await Promise.all([
      query(
        `SELECT gb.*, p.title AS product_title, p.price_etb, p.image_urls, s.store_name, s.store_slug
         FROM group_buys gb
         JOIN products p ON gb.product_id = p.product_id
         JOIN stores s ON gb.store_id = s.store_id
         WHERE gb.group_buy_id = $1`,
        [req.params.id]
      ),
      query(
        `SELECT gm.*, u.first_name, u.last_name, u.username
         FROM group_buy_members gm
         JOIN users u ON gm.tg_user_id = u.tg_user_id
         WHERE gm.group_buy_id = $1
         ORDER BY gm.joined_at ASC`,
        [req.params.id]
      )
    ]);
    if (gbResult.rows.length === 0) return res.status(404).json({ error: 'Group buy not found' });
    res.json({ group_buy: gbResult.rows[0], members: membersResult.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/social/group-buy/:id/join
 * Join a group buy session
 */
router.post('/group-buy/:id/join', requireAuth, async (req, res, next) => {
  try {
    const tgUserId = req.user.tg_user_id;
    const gbResult = await query(
      'SELECT * FROM group_buys WHERE group_buy_id = $1 AND status = \'open\' AND expires_at > NOW()',
      [req.params.id]
    );
    if (gbResult.rows.length === 0) return res.status(404).json({ error: 'Group buy not found or expired' });
    const gb = gbResult.rows[0];

    // Check if already a member
    const memberCheck = await query(
      'SELECT member_id FROM group_buy_members WHERE group_buy_id = $1 AND tg_user_id = $2',
      [req.params.id, tgUserId]
    );
    if (memberCheck.rows.length > 0) return res.json({ already_joined: true });

    // Check if group is full
    const countResult = await query(
      'SELECT COUNT(*) AS cnt FROM group_buy_members WHERE group_buy_id = $1',
      [req.params.id]
    );
    const currentCount = parseInt(countResult.rows[0].cnt);
    if (currentCount >= gb.min_members) return res.status(400).json({ error: 'Group is already full' });

    await query(
      'INSERT INTO group_buy_members (group_buy_id, tg_user_id) VALUES ($1, $2)',
      [req.params.id, tgUserId]
    );

    // Check if group is now fulfilled
    const newCount = currentCount + 1;
    let fulfilled = false;
    if (newCount >= gb.min_members) {
      await query("UPDATE group_buys SET status = 'fulfilled' WHERE group_buy_id = $1", [req.params.id]);
      fulfilled = true;

      // Issue coupons to all members
      const members = await query(
        'SELECT tg_user_id FROM group_buy_members WHERE group_buy_id = $1',
        [req.params.id]
      );
      for (const row of members.rows) {
        const code = 'GRP' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const validUntil = new Date(Date.now() + 7 * 86400000).toISOString();
        const existing = await query(
          `SELECT coupon_id FROM coupons
           WHERE store_id = $1 AND tg_user_id = $2 AND status = 'active' AND valid_until > NOW()`,
          [gb.store_id, row.tg_user_id]
        );
        if (existing.rows.length === 0) {
          await query(
            `INSERT INTO coupons (store_id, tg_user_id, code, discount_percent, valid_until)
             VALUES ($1, $2, $3, $4, $5)`,
            [gb.store_id, row.tg_user_id, code, gb.discount_percent, validUntil]
          );
        }
      }
    }

    res.json({ joined: true, fulfilled, current_count: newCount, min_members: gb.min_members });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/social/group-buys/active
 * Get active group buys for a product
 */
router.get('/group-buys/active', async (req, res, next) => {
  try {
    const { product_id } = req.query;
    let conditions = ["gb.status = 'open'", 'gb.expires_at > NOW()'];
    const params = [];
    if (product_id) {
      params.push(product_id);
      conditions.push(`gb.product_id = $${params.length}`);
    }
    params.push(50);
    const result = await query(
      `SELECT gb.*, COUNT(gm.member_id) AS member_count,
              p.title AS product_title, p.price_etb, p.image_urls,
              s.store_name, s.store_slug
       FROM group_buys gb
       JOIN products p ON gb.product_id = p.product_id
       JOIN stores s ON gb.store_id = s.store_id
       LEFT JOIN group_buy_members gm ON gb.group_buy_id = gm.group_buy_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY gb.group_buy_id, p.title, p.price_etb, p.image_urls, s.store_name, s.store_slug
       ORDER BY gb.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json({ group_buys: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/social/conversations
 * Get user's conversations (as buyer or seller)
 */
router.get('/conversations', requireAuth, async (req, res, next) => {
  try {
    const tgUserId = req.user.tg_user_id;
    const result = await query(
      `SELECT c.*,
              (SELECT message_text FROM messages WHERE conv_id = c.conv_id ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM messages WHERE conv_id = c.conv_id AND sender_tg_user_id != $1 AND is_read = FALSE) AS unread_count,
              CASE WHEN c.buyer_tg_user_id = $1 THEN s.store_name ELSE u.first_name || ' ' || COALESCE(u.last_name, '') END AS other_party_name,
              p.title AS product_title
       FROM conversations c
       JOIN stores s ON c.store_id = s.store_id
       JOIN users u ON c.buyer_tg_user_id = u.tg_user_id
       LEFT JOIN products p ON c.product_id = p.product_id
       WHERE c.buyer_tg_user_id = $1
          OR s.admin_tg_user_id = $1
       ORDER BY c.last_message_at DESC`,
      [tgUserId]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/social/conversations
 * Start a new conversation
 */
router.post('/conversations', requireAuth, [
  body('store_id').isUUID(),
  body('message').notEmpty().isString(),
  body('product_id').optional().isUUID()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { store_id, message, product_id } = req.body;
    const tgUserId = req.user.tg_user_id;

    // Upsert conversation
    const convResult = await query(
      `INSERT INTO conversations (store_id, buyer_tg_user_id, product_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (store_id, buyer_tg_user_id, product_id)
       DO UPDATE SET last_message_at = NOW()
       RETURNING conv_id`,
      [store_id, tgUserId, product_id || null]
    );
    const convId = convResult.rows[0].conv_id;

    // Insert message
    const msgResult = await query(
      `INSERT INTO messages (conv_id, sender_tg_user_id, message_text)
       VALUES ($1, $2, $3) RETURNING *`,
      [convId, tgUserId, message]
    );

    // Update last_message_at
    await query('UPDATE conversations SET last_message_at = NOW() WHERE conv_id = $1', [convId]);

    res.status(201).json({ conversation_id: convId, message: msgResult.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/social/conversations/:id/messages
 * Get messages in a conversation
 */
router.get('/conversations/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const tgUserId = req.user.tg_user_id;
    // Verify user is part of this conversation
    const convResult = await query(
      `SELECT c.*, s.admin_tg_user_id
       FROM conversations c
       JOIN stores s ON c.store_id = s.store_id
       WHERE c.conv_id = $1`,
      [req.params.id]
    );
    if (convResult.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const conv = convResult.rows[0];
    if (conv.buyer_tg_user_id !== tgUserId && conv.admin_tg_user_id !== tgUserId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Mark messages as read
    await query(
      'UPDATE messages SET is_read = TRUE WHERE conv_id = $1 AND sender_tg_user_id != $2 AND is_read = FALSE',
      [req.params.id, tgUserId]
    );

    const result = await query(
      'SELECT * FROM messages WHERE conv_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ messages: result.rows, conversation: conv });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/social/conversations/:id/messages
 * Send a message in a conversation
 */
router.post('/conversations/:id/messages', requireAuth, [
  body('message').notEmpty().isString()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const tgUserId = req.user.tg_user_id;

    const convResult = await query(
      `SELECT c.*, s.admin_tg_user_id
       FROM conversations c
       JOIN stores s ON c.store_id = s.store_id
       WHERE c.conv_id = $1`,
      [req.params.id]
    );
    if (convResult.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const conv = convResult.rows[0];
    if (conv.buyer_tg_user_id !== tgUserId && conv.admin_tg_user_id !== tgUserId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await query(
      'INSERT INTO messages (conv_id, sender_tg_user_id, message_text) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, tgUserId, req.body.message]
    );

    await query('UPDATE conversations SET last_message_at = NOW() WHERE conv_id = $1', [req.params.id]);

    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/stores/:storeId/coupon-policy
 * Get coupon/group-buy policy for a store
 */
router.get('/stores/:storeId/coupon-policy', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM coupon_policies WHERE store_id = $1',
      [req.params.storeId]
    );
    if (result.rows.length === 0) {
      return res.json({ policy: {
        share_required: 3, share_discount: 5.00, share_coupon_active: false,
        group_min_members: 3, group_discount: 10.00, group_buy_active: false,
        coupon_validity_days: 7
      }});
    }
    res.json({ policy: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/stores/:storeId/coupon-policy
 * Update coupon/group-buy policy (seller only)
 */
const { requireSellerOf } = require('../middleware/auth');
router.put('/stores/:storeId/coupon-policy', requireAuth, requireSellerOf('storeId'), async (req, res, next) => {
  try {
    const {
      share_required, share_discount, share_coupon_active,
      group_min_members, group_discount, group_buy_active,
      coupon_validity_days
    } = req.body;

    const result = await query(
      `INSERT INTO coupon_policies (store_id, share_required, share_discount, share_coupon_active,
        group_min_members, group_discount, group_buy_active, coupon_validity_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (store_id)
       DO UPDATE SET
         share_required = COALESCE($2, coupon_policies.share_required),
         share_discount = COALESCE($3, coupon_policies.share_discount),
         share_coupon_active = COALESCE($4, coupon_policies.share_coupon_active),
         group_min_members = COALESCE($5, coupon_policies.group_min_members),
         group_discount = COALESCE($6, coupon_policies.group_discount),
         group_buy_active = COALESCE($7, coupon_policies.group_buy_active),
         coupon_validity_days = COALESCE($8, coupon_policies.coupon_validity_days),
         updated_at = NOW()
       RETURNING *`,
      [req.params.storeId, share_required, share_discount, share_coupon_active,
       group_min_members, group_discount, group_buy_active, coupon_validity_days]
    );
    res.json({ policy: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
