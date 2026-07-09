/**
 * Telegram Bot Service
 * Handles all bot → Telegram API interactions:
 * - Verifying bot is admin of a group/channel
 * - Broadcasting product cards to seller groups
 * - Sending order notifications to sellers
 * - Sending dispatch alerts to buyers
 */

const axios = require('axios');

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
 * Escape special characters for MarkdownV2
 */
function escapeMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

module.exports = {
  tgCall,
  resolveChatId,
  checkBotIsAdmin,
  broadcastProduct,
  notifySellerNewOrder,
  notifyBuyerRiderAssigned,
  sendWelcomeMessage,
  getBotId
};
