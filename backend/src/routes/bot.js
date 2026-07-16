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

    // ── Handle inline queries (Inline Search Bot) ──
    if (update.inline_query) {
      await handleInlineQuery(update.inline_query);
      res.status(200).json({ ok: true });
      return;
    }

    const msg = update.message || update.channel_post;
    if (!msg) {
      res.status(200).json({ ok: true });
      return;
    }

    // 🔹 Handle /start deep links (e.g. /start verify_order_<id>) 🔹
    if (msg.text?.startsWith('/start')) {
      const m = msg.text.match(/\/start\s+verify_order_(.+)/);
      if (m) {
        await handleVerifyStart(m[1].trim(), msg.from?.id);
        res.status(200).json({ ok: true });
        return;
      }
      await tg.tgCall('sendMessage', {
        chat_id: msg.from?.id,
        text: `👋 *Medebirr Bot*\n\nI help you verify payments and manage your shop.\n\n• To verify a payment, open your order in the Medebirr app and tap "Upload Receipt to Verification Bot".\n• Sellers: use /register_shop to open the Seller Studio.`,
        parse_mode: 'MarkdownV2'
      });
      res.status(200).json({ ok: true });
      return;
    }

    // 🔹 Handle buyer payment-proof text while awaiting receipt 🔹
    if (msg.text && !msg.text.startsWith('/') && msg.from?.id) {
      const pending = await getPendingVerification(msg.from.id);
      if (pending) {
        await query(
          `UPDATE payment_verifications SET transaction_note = $1, updated_at = NOW() WHERE verification_id = $2`,
          [msg.text.trim(), pending.verification_id]
        );
        await tg.tgCall('sendMessage', {
          chat_id: msg.from.id,
          text: `📝 Got it. Now send the payment *screenshot* so we can forward it to the seller for confirmation.`,
          parse_mode: 'MarkdownV2'
        });
        res.status(200).json({ ok: true });
        return;
      }
    }

    // 🔹 Handle /register_shop command 🔹
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

    // ── Handle photo messages ──
    if (msg.photo && msg.photo.length > 0) {
      // Private-chat receipt for payment verification takes priority
      if (msg.from?.id) {
        const pending = await getPendingVerification(msg.from.id);
        if (pending) {
          await handleReceiptPhoto(msg, pending);
          res.status(200).json({ ok: true });
          return;
        }
      }
      // Otherwise treat as group product detection
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
 * Inline Search Bot (@medebirrbot <query> in any chat)
 * Searches published products across verified stores and returns
 * article cards with a "Buy Now" Mini-App deep link (no new bot token needed).
 */
async function handleInlineQuery(inlineQuery, botToken) {
  try {
    const q = (inlineQuery.query || '').trim();
    const baseUrl = process.env.FRONTEND_URL || 'https://medebirr.vercel.app';

    if (!q) {
      await tg.tgCall('answerInlineQuery', {
        inline_query_id: inlineQuery.id,
        results: [{
          type: 'article',
          id: 'help',
          title: '🔍 Search Medebirr products',
          description: 'Type a product name after @medebirrbot to find items from Ethiopian shops.',
          input_message_content: {
            message_text: '🔍 Search Medebirr: type a product name after @medebirrbot in any chat to find items from Ethiopian shops.'
          }
        }],
        cache_time: 5
      }, botToken);
      return;
    }

    const like = `%${q}%`;
    const result = await query(
      `SELECT p.product_id, p.title, p.price_etb, p.image_urls,
              s.store_name, s.store_code
       FROM products p
       JOIN stores s ON p.store_id = s.store_id
       WHERE p.is_published = TRUE AND s.status = 'verified'
         AND (p.title ILIKE $1 OR p.description ILIKE $1 OR s.store_name ILIKE $1)
       ORDER BY p.order_count DESC, p.created_at DESC
       LIMIT 20`,
      [like]
    );

    const results = result.rows.map((p) => {
      const price = Number(p.price_etb || 0).toLocaleString();
      const thumb = Array.isArray(p.image_urls)
        ? p.image_urls.find((u) => typeof u === 'string' && /^https?:\/\//.test(u))
        : null;
      return {
        type: 'article',
        id: String(p.product_id),
        title: `${p.title || 'Product'} — Br ${price}`,
        description: `🏪 ${p.store_name || 'Medebirr shop'}`,
        thumb_url: thumb || undefined,
        input_message_content: {
          message_text: `🛒 ${p.title || 'Product'}\n💰 Br ${price}\n🏪 ${p.store_name || 'Medebirr shop'}\n\nTap "Buy Now" to open it in Medebirr.`
        },
        reply_markup: {
          inline_keyboard: [[
            { text: '🛒 Buy Now', web_app: { url: `${baseUrl}?start=product_${p.product_id}` } }
          ]]
        }
      };
    });

    await tg.tgCall('answerInlineQuery', {
      inline_query_id: inlineQuery.id,
      results,
      cache_time: 30,
      is_personal: true
    }, botToken);
  } catch (err) {
    console.error('Inline query error:', err.message);
    try {
      await tg.tgCall('answerInlineQuery', { inline_query_id: inlineQuery.id, results: [], cache_time: 5 }, botToken);
    } catch (_) {}
  }
}

/**
 * Dedicated Scraper Bot (Medeb_Scrapperbot) — DM-based draft creation.
 * A seller DMs a photo + caption; we resolve their store by admin_tg_user_id
 * and create a pending product draft (same pipeline as group detection).
 */
async function handleScraperMessage(msg, botToken) {
  const fromId = msg.from?.id;
  if (!fromId) return;

  if (msg.text?.startsWith('/start')) {
    await tg.tgCall('sendMessage', {
      chat_id: fromId,
      text: '🤖 *Medebirr Scraper Bot*\n\nSend me a 📸 *photo* with a *caption* containing a price to create a product draft\\.\n\nExample caption:\n`Wireless Earbuds`\n`1500 Br`',
      parse_mode: 'MarkdownV2'
    }, botToken);
    return;
  }

  const caption = msg.caption || '';
  const hasCommand = /\/(sell|newproduct)/i.test(caption);
  const hasPrice = /\d[\d,\.]*\s*(birr|br|etb|k)\b/i.test(caption);
  const isPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;

  if (!isPhoto && !hasCommand) return; // ignore unrelated text

  // Resolve the seller's store by their Telegram user id
  const storeResult = await query(
    `SELECT store_id, store_name, admin_tg_user_id, auto_detect_products, verification_tier
     FROM stores WHERE admin_tg_user_id = $1`,
    [fromId]
  );
  if (storeResult.rows.length === 0) {
    await tg.tgCall('sendMessage', {
      chat_id: fromId,
      text: '⚠️ No store is linked to this Telegram account\\. Register your shop via @medebirrbot first, then try again\\.',
      parse_mode: 'MarkdownV2'
    }, botToken);
    return;
  }
  const store = storeResult.rows[0];

  const shouldCreate = hasCommand || (store.auto_detect_products && hasPrice) || (isPhoto && hasPrice);
  if (!shouldCreate) {
    await tg.tgCall('sendMessage', {
      chat_id: fromId,
      text: '📸 Send a photo with a caption that includes a price \\(e\\.g\\. "Shoes\\n1500 Br"\\) to create a draft\\.',
      parse_mode: 'MarkdownV2'
    }, botToken);
    return;
  }

  const rateCheck = await tg.checkProductRateLimit(store.store_id);
  if (!rateCheck.allowed) {
    await tg.tgCall('sendMessage', {
      chat_id: fromId,
      text: `⏱ Rate limit reached\\. You can create up to 8 products per hour\\. Try again in ${rateCheck.resetInMinutes} minutes\\.`,
      parse_mode: 'MarkdownV2'
    }, botToken);
    return;
  }

  const { title, price } = tg.parseCaptionForProduct(caption);
  const pendingId = crypto.randomUUID();

  let imageUrls = [];
  if (isPhoto) {
    try {
      imageUrls = await tg.downloadProductImages(msg.photo, store.store_id, pendingId, botToken);
    } catch (err) {
      console.error('Scraper image download failed:', err.message);
    }
  }

  try {
    const result = await query(
      `INSERT INTO pending_products
       (pending_id, store_id, tg_group_id, tg_message_id, title, price_etb, image_urls, caption, auto_detected)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [pendingId, store.store_id, null, msg.message_id, title, price, imageUrls, caption, !hasCommand]
    );
    const pending = result.rows[0];

    // Notify the seller via the MAIN bot (which they've already started) with a "Complete Listing" button
    await tg.notifySellerNewProduct(store.admin_tg_user_id, pending, store);

    await tg.tgCall('sendMessage', {
      chat_id: fromId,
      text: `✅ Draft created for *${store.store_name}*\\! Open the Medebirr app to complete & publish it\\.`,
      parse_mode: 'MarkdownV2'
    }, botToken);
  } catch (err) {
    console.error('Scraper failed to create pending product:', err.message);
    await tg.tgCall('sendMessage', {
      chat_id: fromId,
      text: '⚠️ Failed to process this product\\. Please try again or contact support\\.',
      parse_mode: 'MarkdownV2'
    }, botToken);
  }
}

/**
 * Handle incoming photo messages — detect products and create pending products
 */
async function handlePhotoMessage(msg) {
  const chatId = msg.chat?.id;
  const caption = msg.caption || '';
  const hasCommand = /\/(sell|newproduct)/i.test(caption);
  const hasPrice = /\d[\d,\.]*\s*(birr|br|etb|k)\b/i.test(caption);

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
    // Payment verification: seller confirms a buyer's receipt
    if (data?.startsWith('confirm_pay_')) {
      await handleConfirmPayment(data.replace('confirm_pay_', ''), callbackQuery);
      return;
    }
    // Payment verification: seller rejects a buyer's receipt
    if (data?.startsWith('reject_pay_')) {
      await handleRejectPayment(data.replace('reject_pay_', ''), callbackQuery);
      return;
    }

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
    const payload = { url: webhookUrl, allowed_updates: ['message', 'channel_post', 'callback_query', 'inline_query', 'my_chat_member'] };
    if (process.env.TELEGRAM_WEBHOOK_SECRET) payload.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
    const result = await tg.tgCall('setWebhook', payload);
    res.json({ ok: result.ok, description: result.description, url: webhookUrl });
  } catch (err) {
    next(err);
  }
});

/**
 * Set webhooks for ALL three bots (main + scraper + search) in one call.
 * Each bot gets its own webhook path and appropriate allowed_updates.
 */
router.post('/set-webhook-all', requireAuth, async (req, res, next) => {
  try {
    const base = process.env.APP_URL;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const out = {};

    const bots = [
      { token: process.env.TELEGRAM_BOT_TOKEN, path: '/api/v1/bot/webhook', updates: ['message', 'channel_post', 'callback_query', 'inline_query', 'my_chat_member'] },
      { token: process.env.SCRAPER_BOT_TOKEN, path: '/api/v1/bot/scraper/webhook', updates: ['message', 'channel_post', 'callback_query', 'my_chat_member'] },
      { token: process.env.SEARCH_BOT_TOKEN, path: '/api/v1/bot/search/webhook', updates: ['inline_query'] }
    ];

    for (const b of bots) {
      if (!b.token) { out[b.path] = { skipped: 'no token' }; continue; }
      const payload = { url: `${base}${b.path}`, allowed_updates: b.updates };
      if (secret) payload.secret_token = secret;
      const r = await tg.tgCall('setWebhook', payload, b.token);
      out[b.path] = { ok: r.ok, description: r.description };
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

/**
 * Webhook for the dedicated Scraper Bot (Medeb_Scrapperbot) — DM-based drafts.
 */
router.post('/scraper/webhook', async (req, res) => {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
      return res.status(403).json({ error: 'Invalid secret token' });
    }
    const update = req.body;
    const token = process.env.SCRAPER_BOT_TOKEN;
    if (!token) return res.status(200).json({ ok: true });
    if (update.message) {
      await handleScraperMessage(update.message, token);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Scraper webhook error:', err.message);
    res.status(200).json({ ok: true });
  }
});

/**
 * Webhook for the dedicated Inline Search Bot (Medeb_Searchbot).
 */
router.post('/search/webhook', async (req, res) => {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
      return res.status(403).json({ error: 'Invalid secret token' });
    }
    const update = req.body;
    const token = process.env.SEARCH_BOT_TOKEN;
    if (!token) return res.status(200).json({ ok: true });

    if (update.inline_query) {
      await handleInlineQuery(update.inline_query, token);
    } else if (update.message?.text?.startsWith('/start')) {
      await tg.tgCall('sendMessage', {
        chat_id: update.message.from?.id,
        text: '🔎 *Medebirr Search Bot*\n\nType `@Medeb_Searchbot` followed by a product name in *any* chat to search Ethiopian shops\\.',
        parse_mode: 'MarkdownV2'
      }, token);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Search webhook error:', err.message);
    res.status(200).json({ ok: true });
  }
});

/**
 * Payment Verification Bot helpers (hybrid: seller confirms)
 */

async function getPendingVerification(buyerTgId) {
  const r = await query(
    `SELECT * FROM payment_verifications
     WHERE buyer_tg_user_id = $1 AND status = 'awaiting_receipt'
     ORDER BY created_at DESC LIMIT 1`,
    [buyerTgId]
  );
  return r.rows[0] || null;
}

/**
 * Buyer opened the deep link t.me/medebirrbot?start=verify_order_<id>
 */
async function handleVerifyStart(orderId, buyerTgId) {
  const res = await query(
    `SELECT o.*, s.store_name, s.admin_tg_user_id
     FROM orders o JOIN stores s ON o.store_id = s.store_id
     WHERE o.order_id = $1 AND o.buyer_tg_user_id = $2`,
    [orderId, buyerTgId]
  );
  if (res.rows.length === 0) {
    await tg.tgCall('sendMessage', {
      chat_id: buyerTgId,
      text: '⚠️ We couldn\'t find that order, or it doesn\'t belong to you.'
    });
    return;
  }
  const order = res.rows[0];
  if (order.payment_status === 'paid') {
    await tg.tgCall('sendMessage', {
      chat_id: buyerTgId,
      text: `✅ Order *${order.order_ref}* is already paid.`,
      parse_mode: 'MarkdownV2'
    });
    return;
  }
  await query(
    `INSERT INTO payment_verifications (order_id, buyer_tg_user_id, status)
     VALUES ($1, $2, 'awaiting_receipt')`,
    [orderId, buyerTgId]
  );
  await tg.tgCall('sendMessage', {
    chat_id: buyerTgId,
    text: `📤 *Payment Verification*\n\nOrder *${order.order_ref}* — Br ${Number(order.total_etb).toLocaleString()}\n\nPlease send your Telebirr/CBE payment screenshot here. We'll forward it to *${order.store_name}* for confirmation.\n\nYou can also type the Transaction ID as a message.`,
    parse_mode: 'MarkdownV2'
  });
}

/**
 * Buyer sent a receipt screenshot while a verification is pending.
 * Forward it to the seller with confirm/reject buttons.
 */
async function handleReceiptPhoto(msg, pending) {
  const orderRes = await query(
    `SELECT o.*, s.store_name, s.admin_tg_user_id
     FROM orders o JOIN stores s ON o.store_id = s.store_id
     WHERE o.order_id = $1`,
    [pending.order_id]
  );
  if (orderRes.rows.length === 0) return;
  const order = orderRes.rows[0];
  const fileId = msg.photo[msg.photo.length - 1].file_id; // largest size

  // Best-effort OCR: extract TX ref + amount to assist the seller's confirm.
  let ocr = { tx_ref: null, amount: null, text: '' };
  try {
    const buf = await tg.downloadTelegramFileBuffer(fileId);
    const ocrService = require('../services/ocr');
    ocr = await ocrService.recognize(buf);
  } catch (e) {
    console.warn('OCR skipped for receipt:', e.message);
  }

  await query(
    `UPDATE payment_verifications
     SET photo_file_id = $1, transaction_note = COALESCE($2, transaction_note),
         ocr_tx_ref = $3, ocr_amount = $4, ocr_text = $5,
         status = 'pending_seller_confirm', updated_at = NOW()
     WHERE verification_id = $6`,
    [fileId, msg.caption || null, ocr.tx_ref, ocr.amount, ocr.text, pending.verification_id]
  );

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Confirm Payment', callback_data: `confirm_pay_${pending.order_id}` },
      { text: '❌ Reject', callback_data: `reject_pay_${pending.order_id}` }
    ]]
  };
  const extracted = ocr.tx_ref
    ? `\n\n🔎 *Detected:* TX \`${ocr.tx_ref}\`${ocr.amount ? ` · Br ${Number(ocr.amount).toLocaleString()}` : ''}`
    : '';
  const caption = `💳 *Payment proof received*\n\nOrder *${order.order_ref}* — Br ${Number(order.total_etb).toLocaleString()}\nMethod: ${order.payment_method.toUpperCase()}${extracted}\n\nReview the screenshot and confirm receipt.`;

  try {
    await tg.tgCall('sendPhoto', {
      chat_id: order.admin_tg_user_id,
      photo: fileId,
      caption,
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard
    });
  } catch (e) {
    await tg.tgCall('sendMessage', {
      chat_id: order.admin_tg_user_id,
      text: caption,
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard
    });
  }

  await tg.tgCall('sendMessage', {
    chat_id: pending.buyer_tg_user_id,
    text: `✅ Receipt sent! *${order.store_name}* will confirm your payment shortly.`,
    parse_mode: 'MarkdownV2'
  });
}

/**
 * Seller tapped "Confirm Payment" on a forwarded receipt.
 */
async function handleConfirmPayment(orderId, callbackQuery) {
  const orderRes = await query(
    `SELECT o.*, s.store_name, s.admin_tg_user_id
     FROM orders o JOIN stores s ON o.store_id = s.store_id
     WHERE o.order_id = $1`,
    [orderId]
  );
  if (orderRes.rows.length === 0) {
    await tg.tgCall('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Order not found' });
    return;
  }
  const order = orderRes.rows[0];
  if (order.payment_status === 'paid') {
    await tg.tgCall('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Already paid' });
    return;
  }

  const vRes = await query(
    `SELECT transaction_note, ocr_tx_ref, ocr_amount FROM payment_verifications WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  );
  const vRow = vRes.rows[0] || {};
  const txNote = vRow.transaction_note || vRow.ocr_tx_ref || '';

  const paymentProof = {
    source: 'screenshot_ocr',
    tx_ref: vRow.ocr_tx_ref || null,
    amount: vRow.ocr_amount || null,
    verified_at: new Date().toISOString()
  };

  const payments = require('./payments');
  await payments.markOrderPaid(order, txNote, paymentProof);

  await query(
    `UPDATE payment_verifications SET status = 'confirmed', updated_at = NOW() WHERE order_id = $1`,
    [orderId]
  );

  const msg = callbackQuery.message;
  if (msg?.chat?.id && msg?.message_id) {
    await tg.tgCall('editMessageText', {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: `✅ *Payment Confirmed!*\n\nOrder *${order.order_ref}* marked paid. Prepare for dispatch.`,
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: [] }
    });
  }
  await tg.tgCall('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Payment confirmed ✅' });
}

/**
 * Seller tapped "Reject" on a forwarded receipt.
 */
async function handleRejectPayment(orderId, callbackQuery) {
  await query(
    `UPDATE payment_verifications SET status = 'rejected', updated_at = NOW() WHERE order_id = $1`,
    [orderId]
  );
  const msg = callbackQuery.message;
  if (msg?.chat?.id && msg?.message_id) {
    await tg.tgCall('editMessageText', {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: `❌ Payment rejected. The buyer will be asked to resend.`,
      reply_markup: { inline_keyboard: [] }
    });
  }
  await tg.tgCall('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Payment rejected' });

  const o = await query('SELECT buyer_tg_user_id, order_ref FROM orders WHERE order_id = $1', [orderId]);
  if (o.rows[0]) {
    await tg.tgCall('sendMessage', {
      chat_id: o.rows[0].buyer_tg_user_id,
      text: `❌ Your payment for *${o.rows[0].order_ref}* was not confirmed by the seller. Please check the transaction and resend the screenshot, or contact the seller.`,
      parse_mode: 'MarkdownV2'
    });
  }
}

module.exports = router;
