/**
 * Telegram Bot Service
 * Handles all bot → Telegram API interactions:
 * - Verifying bot is admin of a group/channel
 * - Broadcasting product cards to seller groups
 * - Sending order notifications to sellers
 * - Sending dispatch alerts to buyers
 */

const axios = require('axios');
const { downloadAndUpload } = require('./storage');
const crypto = require('crypto');

const TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'medebirrbot';

/**
 * Call Telegram Bot API
 */
async function tgCall(method, params = {}) {
  try {
    const res = await axios.post(`${TG_API}/${method}`, params, { timeout: 10000 });
    return res.data;
  } catch (err) {
    const msg = err.response?.data?.description || err.message;
    throw new Error(`Telegram API error (${method}): ${msg}`);
  }
}

/**
 * Resolve a @username or invite link to a numeric chat_id
 * Works for public groups/channels via getChat
 */
async function resolveChatId(usernameOrLink) {
  // Strip https://t.me/ prefix if present
  let identifier = usernameOrLink.trim();
  identifier = identifier.replace(/^https?:\/\/t\.me\//i, '');
  identifier = identifier.replace(/^@/, '');
  // Add @ back for getChat
  const result = await tgCall('getChat', { chat_id: `@${identifier}` });
  if (!result.ok) throw new Error('Could not find that group. Make sure it is a public group or channel.');
  return { chatId: result.result.id, title: result.result.title, type: result.result.type };
}

/**
 * Check if @medebirrbot is an admin of the given chat
 */
async function checkBotIsAdmin(chatId) {
  const result = await tgCall('getChatMember', {
    chat_id: chatId,
    user_id: await getBotId()
  });
  if (!result.ok) return { isAdmin: false, status: 'unknown' };
  const status = result.result?.status;
  const isAdmin = status === 'administrator' || status === 'creator';
  return { isAdmin, status };
}

// Cache bot ID to avoid repeated API calls
let _botId = null;
async function getBotId() {
  if (_botId) return _botId;
  const result = await tgCall('getMe');
  _botId = result.result.id;
  return _botId;
}

/**
 * Broadcast a new product card to the seller's Telegram group/channel
 * Returns the message_id of the sent message
 */
async function broadcastProduct(chatId, product, store, appUrl) {
  const baseUrl = appUrl || process.env.FRONTEND_URL || 'https://medebirr.vercel.app';
  const productUrl = `${baseUrl}?product=${product.product_id}`;

  // Build caption
  const policyEmoji = {
    '7_day_free': '🔄 7-Day Free Return',
    '3_day_warranty': '🛡️ 3-Day Warranty',
    'size_exchange': '📏 Size Exchange',
    'fresh_guarantee': '✅ Freshness Guarantee',
    'no_return': '📦 Final Sale'
  };
  const policy = policyEmoji[store.return_policy_type] || '📦 Store Policy';

  const caption = [
    `🔥 *NEW DROP: ${escapeMd(product.title)}*`,
    ``,
    `💰 Price: *Br ${Number(product.price_etb).toLocaleString()}*`,
    product.stock_quantity <= 10 ? `📦 Only ${product.stock_quantity} units left\\!` : `📦 In Stock`,
    `${policy}`,
    ``,
    `🏪 ${escapeMd(store.store_name)}`,
    `📍 ${escapeMd(store.location_sub_city || 'Addis Ababa')}`,
    ``,
    `👇 Tap below to buy securely inside Medebirr:`
  ].join('\n');

  // Inline keyboard with Buy Now button (opens Mini App)
  const replyMarkup = {
    inline_keyboard: [[
      {
        text: '🛒 Buy Now on Medebirr',
        url: productUrl
      }
    ]]
  };

  let result;
  // If product has an image URL, send as photo; otherwise send as text
  if (product.image_urls && product.image_urls.length > 0) {
    result = await tgCall('sendPhoto', {
      chat_id: chatId,
      photo: product.image_urls[0],
      caption,
      parse_mode: 'MarkdownV2',
      reply_markup: replyMarkup
    });
  } else {
    result = await tgCall('sendMessage', {
      chat_id: chatId,
      text: caption,
      parse_mode: 'MarkdownV2',
      reply_markup: replyMarkup,
      disable_web_page_preview: true
    });
  }

  if (!result.ok) throw new Error('Failed to send product to group');
  return result.result.message_id;
}

/**
 * Send order notification to seller's management channel
 */
async function notifySellerNewOrder(chatId, order, buyer, items) {
  const itemList = items.map(i => `• ${i.title} x${i.quantity} — Br ${Number(i.subtotal_etb).toLocaleString()}`).join('\n');
  const addr = typeof order.delivery_address === 'string'
    ? JSON.parse(order.delivery_address)
    : order.delivery_address;
  const addrStr = [addr.sub_city, addr.woreda, addr.house_number].filter(Boolean).join(', ');

  const text = [
    `📦 *NEW PAID ORDER \\#${escapeMd(order.order_ref)}*`,
    ``,
    `👤 Buyer: ${escapeMd(buyer.first_name)} ${escapeMd(buyer.last_name || '')} ${buyer.username ? `\\(@${escapeMd(buyer.username)}\\)` : ''}`,
    `📱 Phone: ${escapeMd(addr.phone || 'N/A')}`,
    `📍 Deliver to: ${escapeMd(addrStr)}`,
    ``,
    `🛒 *Items:*`,
    itemList,
    ``,
    `💰 *Total Received: Br ${Number(order.total_etb).toLocaleString()}* \\(Telebirr Verified\\)`,
    ``,
    `👇 Assign a rider in the Seller Studio:`
  ].join('\n');

  const baseUrl = process.env.FRONTEND_URL || 'https://medebirr.vercel.app';
  await tgCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        { text: '🛵 Assign Rider in Studio', url: `${baseUrl}?tab=dispatch` }
      ]]
    }
  });
}

/**
 * Notify buyer that rider has been assigned
 */
async function notifyBuyerRiderAssigned(buyerTgId, order, riderName, riderPhone) {
  const text = [
    `🛵 *Your Rider is on the Way\\!*`,
    ``,
    `Order: *${escapeMd(order.order_ref)}*`,
    `Rider: ${escapeMd(riderName)}`,
    `📞 ${escapeMd(riderPhone)}`,
    ``,
    `You can call your rider directly using the number above\\.`,
    `When the item arrives, confirm delivery in the Medebirr app to start your warranty period\\.`
  ].join('\n');

  const baseUrl = process.env.FRONTEND_URL || 'https://medebirr.vercel.app';
  await tgCall('sendMessage', {
    chat_id: buyerTgId,
    text,
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Confirm Delivery', url: baseUrl }
      ]]
    }
  });
}

/**
 * Send welcome message when bot is added as admin
 */
async function sendWelcomeMessage(chatId, storeName, botUsername) {
  const text = [
    `🎉 *${escapeMd(storeName)} is now connected to Medebirr\\!*`,
    ``,
    `I'm @${escapeMd(botUsername)}, your automated marketplace assistant\\.`,
    ``,
    `✅ What I'll do for you:`,
    `• Post new products automatically when you publish in the Seller Studio`,
    `• Alert you instantly when a buyer places a paid order`,
    `• Send dispatch cards with buyer address and phone`,
    ``,
    `🚀 Open Seller Studio to start publishing your products:`
  ].join('\n');

  const baseUrl = process.env.FRONTEND_URL || 'https://medebirr.vercel.app';
  await tgCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        { text: '🏬 Open Seller Studio', url: baseUrl }
      ]]
    }
  });
}

/**
 * Send a document (PDF) via Telegram
 * @param {number} chatId - Telegram chat ID
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} filename - File name
 * @param {string} caption - Optional caption
 */
async function sendDocument(chatId, fileBuffer, filename, caption = '') {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('document', fileBuffer, { filename });
  if (caption) form.append('caption', caption);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const res = await axios.post(
    `https://api.telegram.org/bot${botToken}/sendDocument`,
    form,
    { headers: form.getHeaders(), timeout: 30000, maxContentLength: 20 * 1024 * 1024 }
  );
  return res.data;
}

/**
 * Escape special characters for MarkdownV2
 */
function escapeMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/**
 * Download images from a Telegram message and upload to Supabase Storage
 * @param {Array} photoArray - Telegram photo array (multiple sizes)
 * @param {string} storeId - Store UUID for path
 * @param {string} pendingId - Pending product UUID for path
 * @returns {Array<string>} Public URLs of downloaded images
 */
async function downloadProductImages(photoArray, storeId, pendingId) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not set');

  const urls = [];
  // Take up to 5 images (Telegram sends multiple sizes per photo, pick the largest = last)
  const uniquePhotos = [];
  const seenFileIds = new Set();
  for (const p of photoArray) {
    // Each "photo" in the array is a different size of the SAME image
    // Telegram sends: [{file_id: "small"}, {file_id: "medium"}, {file_id: "large"}]
    // We want the largest (last one) for each unique image
    // But if multiple photos are sent, we get multiple arrays
    // Actually, message.photo IS the array of sizes for ONE image
    // To detect multiple images, we'd need media_group_id — but that's complex
    // For now, each message has one photo array = one image, pick the largest
  }

  // Pick the largest size (last element)
  const largestPhoto = photoArray[photoArray.length - 1];
  if (!largestPhoto?.file_id) return urls;

  try {
    // Get file info from Telegram
    const fileInfo = await tgCall('getFile', { file_id: largestPhoto.file_id });
    if (!fileInfo.ok) return urls;

    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

    // Determine content type from file path
    const ext = filePath.split('.').pop()?.toLowerCase() || 'jpg';
    const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    // Download from Telegram and upload to Supabase Storage
    const timestamp = Date.now();
    const storagePath = `${storeId}/${pendingId}/${timestamp}_0.${ext}`;
    const publicUrl = await downloadAndUpload(fileUrl, storagePath, contentType);
    urls.push(publicUrl);
  } catch (err) {
    console.error('Failed to download product image:', err.message);
  }

  return urls;
}

/**
 * Parse a Telegram caption for product title and price
 * Looks for patterns like "1500 Br", "ETB 2500", "2,000 Birr"
 */
function parseCaptionForProduct(caption) {
  if (!caption) return { title: null, price: null };

  const lines = caption.split('\n').filter(l => l.trim());
  let title = null;
  let price = null;

  // First non-empty line is usually the title
  if (lines.length > 0) {
    title = lines[0].replace(/\/(sell|newproduct)/i, '').trim().slice(0, 100);
  }

  // Look for price pattern: number + (Birr|Br|ETB)
  const priceRegex = /(\d[\d,\.]*)\s*(Birr|Br|ETB)/i;
  for (const line of lines) {
    const match = line.match(priceRegex);
    if (match) {
      price = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  // If no price found, check standalone number on its own line
  if (price === null) {
    for (const line of lines) {
      const num = line.trim().replace(/,/g, '');
      if (/^\d+(\.\d{1,2})?$/.test(num) && parseInt(num) > 0) {
        price = parseFloat(num);
        break;
      }
    }
  }

  return { title: title || null, price };
}

/**
 * Check rate limit for product creation (max 8 per hour per store)
 */
async function checkProductRateLimit(storeId) {
  const { query } = require('../db');

  const result = await query(
    'SELECT products_created, window_start FROM product_rate_limits WHERE store_id = $1',
    [storeId]
  );

  const now = new Date();
  const limit = result.rows[0];

  // Reset if window expired (1 hour)
  if (!limit || (now - new Date(limit.window_start)) > 3600000) {
    await query(
      `INSERT INTO product_rate_limits (store_id, products_created, window_start)
       VALUES ($1, 1, NOW())
       ON CONFLICT (store_id) DO UPDATE SET products_created = 1, window_start = NOW()`,
      [storeId]
    );
    return { allowed: true, remaining: 7 };
  }

  // Check limit
  if (limit.products_created >= 8) {
    const resetIn = Math.ceil((3600000 - (now - new Date(limit.window_start))) / 60000);
    return { allowed: false, remaining: 0, resetInMinutes: resetIn };
  }

  // Increment
  await query(
    'UPDATE product_rate_limits SET products_created = products_created + 1 WHERE store_id = $1',
    [storeId]
  );
  return { allowed: true, remaining: 7 - limit.products_created };
}

/**
 * Notify seller about a new pending product via DM
 */
async function notifySellerNewProduct(tgUserId, pendingProduct, store) {
  const appUrl = process.env.FRONTEND_URL || 'https://medebirr.vercel.app';
  const deepLink = `${appUrl}?start=complete_${pendingProduct.pending_id}`;

  const priceStr = pendingProduct.price_etb ? `Br ${Number(pendingProduct.price_etb).toLocaleString()}` : 'No price set';
  const imageCount = pendingProduct.image_urls?.length || 0;

  await tgCall('sendMessage', {
    chat_id: tgUserId,
    text: [
      `📦 *New product detected from ${escapeMd(store.store_name)}\\!*`,
      ``,
      `📱 ${escapeMd(pendingProduct.title || 'Untitled')}`,
      `💰 ${escapeMd(priceStr)}`,
      imageCount > 0 ? `🖼 ${imageCount} image${imageCount > 1 ? 's' : ''}` : `⚠️ No images`,
      ``,
      `Complete the listing to publish it to your group\\.`
    ].join('\n'),
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Complete Listing', web_app: { url: deepLink } }],
        [{ text: '❌ Discard', callback_data: `discard_pending_${pendingProduct.pending_id}` }]
      ]
    }
  });
}

module.exports = {
  tgCall,
  resolveChatId,
  checkBotIsAdmin,
  broadcastProduct,
  notifySellerNewOrder,
  notifyBuyerRiderAssigned,
  sendWelcomeMessage,
  getBotId,
  downloadProductImages,
  parseCaptionForProduct,
  checkProductRateLimit,
  notifySellerNewProduct,
  sendDocument,
  escapeMd
};
