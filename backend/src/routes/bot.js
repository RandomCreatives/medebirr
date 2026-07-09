/**
 * Bot integration routes
 * - Verify bot is admin of a group
 * - Telegram webhook for incoming messages
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');
const tg = require('../services/telegram');

const router = express.Router();

/**
 * POST /api/v1/bot/verify-group
 * Verify that @medebirrbot is an admin of the given group/channel
 * and link it to the seller's store
 */
router.post('/verify-group', requireAuth, async (req, res, next) => {
  try {
    const { group_username, store_id } = req.body;
    if (!group_username || !store_id) {
      return res.status(400).json({ error: 'group_username and store_id are required' });
    }

    // Confirm seller owns this store
    const storeResult = await query(
      'SELECT * FROM stores WHERE store_id = $1 AND admin_tg_user_id = $2',
      [store_id, req.user.tg_user_id]
    );
    if (storeResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized for this store' });
    }
    const store = storeResult.rows[0];

    // Resolve the group username to a chat_id
    let chatInfo;
    try {
      chatInfo = await tg.resolveChatId(group_username);
    } catch (err) {
      return res.status(400).json({
        error: 'Could not find that group',
        detail: err.message,
        hint: 'Make sure your group/channel is public and the username is correct (e.g. @MyShopGroup)'
      });
    }

    // Check bot admin status
    const { isAdmin, status } = await tg.checkBotIsAdmin(chatInfo.chatId);

    if (!isAdmin) {
      return res.status(400).json({
        verified: false,
        error: `@${process.env.TELEGRAM_BOT_USERNAME} is not an admin of "${chatInfo.title}"`,
        status,
        hint: `Open your group → Admins → Add Admin → search @${process.env.TELEGRAM_BOT_USERNAME} → give "Post Messages" permission`,
        chatTitle: chatInfo.title,
        chatId: chatInfo.chatId
      });
    }

    // Link group to store
    const cleanUsername = group_username.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
    await query(
      `UPDATE stores SET
        tg_group_id = $1,
        tg_channel_username = $2,
        updated_at = NOW()
       WHERE store_id = $3`,
      [chatInfo.chatId, cleanUsername, store_id]
    );

    // Send welcome message to the group
    try {
      await tg.sendWelcomeMessage(
        chatInfo.chatId,
        store.store_name,
        process.env.TELEGRAM_BOT_USERNAME
      );
    } catch (e) {
      // Non-fatal — bot might not have permission to send messages yet
      console.warn('Could not send welcome message:', e.message);
    }

    res.json({
      verified: true,
      chatId: chatInfo.chatId,
      chatTitle: chatInfo.title,
      chatType: chatInfo.type,
      message: `✅ @${process.env.TELEGRAM_BOT_USERNAME} is confirmed as admin of "${chatInfo.title}". Products published in Seller Studio will now auto-post to this group.`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/bot/group-status/:storeId
 * Check current group link status for a store
 */
router.get('/group-status/:storeId', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT store_id, store_name, tg_group_id, tg_channel_username FROM stores WHERE store_id = $1 AND admin_tg_user_id = $2',
      [req.params.storeId, req.user.tg_user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Store not found' });

    const store = result.rows[0];
    if (!store.tg_group_id) {
      return res.json({ linked: false, store_name: store.store_name });
    }

    // Re-verify admin status live
    let isAdmin = false;
    try {
      const check = await tg.checkBotIsAdmin(store.tg_group_id);
      isAdmin = check.isAdmin;
    } catch (e) {
      isAdmin = false;
    }

    res.json({
      linked: true,
      isAdmin,
      chatId: store.tg_group_id,
      username: store.tg_channel_username,
      store_name: store.store_name
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/bot/webhook
 * Telegram webhook — receives incoming messages from groups
 * Handles /list_products and /register_shop commands
 */
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    const msg = update.message || update.channel_post;

    if (msg?.text?.startsWith('/register_shop')) {
      // Seller sent /register_shop in their group — send them a private setup link
      const chatId = msg.from?.id;
      if (chatId) {
        const baseUrl = process.env.FRONTEND_URL || 'https://medebirr.vercel.app';
        await tg.tgCall('sendMessage', {
          chat_id: chatId,
          text: `🏪 *Register your shop on Medebirr*\n\nTap the button below to open the Seller Studio and register your store\\. It takes less than 2 minutes\\.`,
          parse_mode: 'MarkdownV2',
          reply_markup: {
            inline_keyboard: [[
              { text: '🏬 Open Seller Studio', url: baseUrl }
            ]]
          }
        });
      }
    }

    // Always respond 200 so Telegram doesn't retry
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(200).json({ ok: true }); // Always 200 to Telegram
  }
});

/**
 * POST /api/v1/bot/set-webhook
 * Register our webhook URL with Telegram (call once after deployment)
 */
router.post('/set-webhook', requireAuth, async (req, res, next) => {
  try {
    const webhookUrl = `${process.env.APP_URL}/api/v1/bot/webhook`;
    const result = await tg.tgCall('setWebhook', { url: webhookUrl });
    res.json({ ok: result.ok, description: result.description, url: webhookUrl });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
