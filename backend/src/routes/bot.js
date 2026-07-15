/**
 * Bot integration routes
 * - Verify bot is admin of a group
 * - Telegram webhook for incoming messages
 * - Product detection from group posts
 * - Callback query handling
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');
const tg = require('../services/telegram');
const crypto = require('crypto');

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

    // ── One group per shop enforcement
    const existingLink = await query(
      'SELECT store_id, store_name FROM stores WHERE tg_group_id = $1 AND store_id != $2',
      [chatInfo.chatId, store_id]
    );
    if (existingLink.rows.length > 0) {
      return res.status(409).json({
        verified: false,
        error: `This Telegram group is already linked to "${existingLink.rows[0].store_name}"`,
        hint: 'Each Telegram group can only be connected to one Medebirr store.'
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
 * Telegram webhook — receives messages, photos, and callback queries
 */
router.post('/webhook', async (req, res) => {
  try {
    // Verify Telegram secret token to prevent fake updates
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    const provided = req.headers['x-telegram-bot-api-secret-token'];
    if (process.env.NODE_ENV === 'production' && !secretToken) {
      return res.status(500).json({ error: 'Webhook secret is not configured' });
    }
    if (secretToken && provided !== secretToken) {
      return res.status(403).json({ error: 'Invalid secret token' });
    }

    const update = req.body;

    // ── Handle callback queries (inline button presses) ──
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      res.status(200).json({ ok: true });
      return;
    }

    const msg = update.message || update.channel_post;
    if (!msg) {
      res.status(200).json({ ok: true });
      return;
    }

    // ── Handle /register_shop command ──
    if (msg.text?.startsWith('/register_shop')) {
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
      res.status(200).json({ ok: true });
      return;
    }

    // ── Handle /sell command without images ──
    if (msg.text?.startsWith('/sell') || msg.text?.startsWith('/newproduct')) {
      const chatId = msg.chat?.id;
      if (chatId) {
        await tg.tgCall('sendMessage', {
          chat_id: chatId,
          text: `📸 To create a product, please send a photo with your caption\\.\n\nUsage: Attach an image and write your product details in the caption\\.\n\nExample caption:\n` +
            `\\_\\_\\_Wireless Headphones\\_\\_\\_\n1500 Br\nGood quality, Bluetooth 5\\.0`,
          parse_mode: 'MarkdownV2',
          reply_to_message_id: msg.message_id
        });
      }
      res.status(200).json({ ok: true });
      return;
    }

    // ── Handle photo messages (product detection) ──
    if (msg.photo && msg.photo.length > 0) {
      await handlePhotoMessage(msg);
      res.status(200).json({ ok: true });
      return;
    }

    // Always respond 200 so Telegram doesn't retry
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(200).json({ ok: true }); // Always 200 to Telegram
  }
});

/**
 * Handle incoming photo messages — detect products and create pending products
 */
async function handlePhotoMessage(msg) {
  const chatId = msg.chat?.id;
  const caption = msg.caption || '';
  const hasCommand = /\/(sell|newproduct)/i.test(caption);
  const hasPrice = /\d[\d,\.]*\s*(Birr|Br|ETB)/i.test(caption);

  // Find the store linked to this group
  const storeResult = await query(
    `SELECT store_id, store_name, admin_tg_user_id, auto_detect_products, verification_tier
     FROM stores WHERE tg_group_id = $1`,
    [chatId]
  );

  if (storeResult.rows.length === 0) return; // Not a linked group
  const store = storeResult.rows[0];

  // Determine if this should trigger product creation
  const shouldCreate = hasCommand || (store.auto_detect_products && hasPrice);

  if (!shouldCreate) return; // Normal photo post, not a product

  // Check rate limit
  const rateCheck = await tg.checkProductRateLimit(store.store_id);
  if (!rateCheck.allowed) {
    await tg.tgCall('sendMessage', {
      chat_id: chatId,
      text: `⏱ Rate limit reached\\. You can create up to 8 products per hour\\. Try again in ${rateCheck.resetInMinutes} minutes\\.`,
      parse_mode: 'MarkdownV2',
      reply_to_message_id: msg.message_id
    });
    return;
  }

  // Parse caption for title and price
  const { title, price } = tg.parseCaptionForProduct(caption);

  // Create pending product ID first
  const pendingId = crypto.randomUUID();

  // Download images from Telegram to Supabase Storage
  let imageUrls = [];
  try {
    imageUrls = await tg.downloadProductImages(msg.photo, store.store_id, pendingId);
  } catch (err) {
    console.error('Image download failed:', err.message);
  }

  // Create pending product in database
  try {
    const result = await query(
      `INSERT INTO pending_products
       (pending_id, store_id, tg_group_id, tg_message_id, title, price_etb, image_urls, caption, auto_detected)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [pendingId, store.store_id, chatId, msg.message_id, title, price, imageUrls, caption, !hasCommand]
    );

    const pending = result.rows[0];

    // Notify seller via DM
    await tg.notifySellerNewProduct(store.admin_tg_user_id, pending, store);

    // Confirm in group (reply to the product post)
    await tg.tgCall('sendMessage', {
      chat_id: chatId,
      text: `✅ Product detected\\! Seller: complete listing in the Medebirr app to publish\\.`,
      parse_mode: 'MarkdownV2',
      reply_to_message_id: msg.message_id
    });
  } catch (err) {
    console.error('Failed to create pending product:', err.message);
    await tg.tgCall('sendMessage', {
      chat_id: chatId,
      text: `⚠️ Failed to process this product. Please try again or contact support\\.`,
      parse_mode: 'MarkdownV2',
      reply_to_message_id: msg.message_id
    });
  }
}

/**
 * Handle callback queries from inline buttons
 */
async function handleCallbackQuery(callbackQuery) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;

  try {
    // Discard pending product
    if (data?.startsWith('discard_pending_')) {
      const pendingId = data.replace('discard_pending_', '');
      await query(
        `UPDATE pending_products SET status = 'discarded' WHERE pending_id = $1`,
        [pendingId]
      );
      await tg.tgCall('answerCallbackQuery', {
        callback_query_id: callbackQuery.id,
        text: 'Product discarded'
      });
      if (chatId && messageId) {
        await tg.tgCall('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: '❌ Product discarded.',
          reply_markup: { inline_keyboard: [] }
        });
      }
      return;
    }

    // Acknowledge unknown callbacks
    await tg.tgCall('answerCallbackQuery', {
      callback_query_id: callbackQuery.id,
      text: 'Action processed'
    });
  } catch (err) {
    console.error('Callback query error:', err.message);
    await tg.tgCall('answerCallbackQuery', {
      callback_query_id: callbackQuery.id,
      text: 'Error processing action'
    }).catch(() => {});
  }
}

/**
 * POST /api/v1/bot/set-webhook
 * Register our webhook URL with Telegram (call once after deployment)
 */
router.post('/set-webhook', requireAuth, async (req, res, next) => {
  try {
    const webhookUrl = `${process.env.APP_URL}/api/v1/bot/webhook`;
    const payload = { url: webhookUrl, allowed_updates: ['message', 'channel_post', 'callback_query', 'my_chat_member'] };
    if (process.env.TELEGRAM_WEBHOOK_SECRET) payload.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
    const result = await tg.tgCall('setWebhook', payload);
    res.json({ ok: result.ok, description: result.description, url: webhookUrl });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
