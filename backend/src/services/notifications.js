const { query } = require('../db');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_SEND = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

// Insert a notification row for a user. Safe to call anywhere — failures are
// swallowed so they never break the surrounding order/payment flow.
async function insert(tgUserId, type, title, body, data = {}) {
  if (!tgUserId) return;
  try {
    await query(
      `INSERT INTO notifications (tg_user_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [tgUserId, type, title, body, data]
    );
  } catch (err) {
    console.error('insertNotification error:', err.message);
  }
}

// Persist + (optionally) Telegram-DM a buyer order status change.
async function notifyOrderStatus(order, newStatus, extra = {}) {
  try {
    const buyerTgId = order.buyer_tg_user_id;
    if (!buyerTgId) return;

    const storeResult = await query(
      'SELECT store_name, admin_tg_user_id, telegram_notifs FROM stores WHERE store_id = $1',
      [order.store_id]
    );
    if (storeResult.rows.length === 0) return;
    const store = storeResult.rows[0];

    const storeName = store.store_name || extra.store_name || '';
    const total = Number(order.total_etb || 0).toLocaleString();
    const orderRef = order.order_ref;

    let title, body, type;
    switch (newStatus) {
      case 'pending':
        type = 'order_placed';
        title = 'Order Placed';
        body = `Order ${orderRef} at ${storeName} — Br ${total}. Awaiting payment confirmation.`;
        break;
      case 'confirmed':
        type = 'order_paid';
        title = 'Payment Confirmed';
        body = `Payment for ${orderRef} (Br ${total}) confirmed. Your order is being prepared.`;
        break;
      case 'dispatched':
        type = 'order_dispatched';
        title = 'Order Dispatched';
        body = `Order ${orderRef} is on its way!${extra.rider_name ? ` Rider: ${extra.rider_name} (${extra.rider_phone || 'n/a'}).` : ''}`;
        break;
      case 'delivered':
        type = 'order_delivered';
        title = 'Order Delivered';
        body = `Order ${orderRef} delivered. Thanks for shopping at ${storeName}!`;
        break;
      case 'cancelled':
        type = 'order_cancelled';
        title = 'Order Cancelled';
        body = `Order ${orderRef} (Br ${total}) was cancelled.${order.payment_status === 'paid' ? ' Refund will be processed by the seller.' : ''}`;
        break;
      default:
        return;
    }

    await insert(buyerTgId, type, title, body, { order_id: order.order_id, order_ref: orderRef, store_id: order.store_id });

    // Telegram DM to buyer (respects store preference)
    if (store.telegram_notifs !== false) {
      try {
        const axios = require('axios');
        await axios.post(TG_SEND, { chat_id: buyerTgId, text: `🔔 *${title}*\n\n${body}`, parse_mode: 'Markdown' }, { timeout: 10000 });
      } catch (_) {}
    }
  } catch (err) {
    console.error('notifyOrderStatus error:', err.message);
  }
}

// Persist + Telegram-DM a *seller* about a new order (or other store events).
async function notifySeller(storeId, type, title, body, data = {}) {
  try {
    const res = await query(
      'SELECT admin_tg_user_id, store_name, telegram_notifs FROM stores WHERE store_id = $1',
      [storeId]
    );
    if (res.rows.length === 0) return;
    const store = res.rows[0];
    const sellerTgId = store.admin_tg_user_id;
    if (!sellerTgId) return;

    await insert(sellerTgId, type, title, body, { store_id: storeId, ...data });

    if (store.telegram_notifs !== false) {
      try {
        const axios = require('axios');
        await axios.post(TG_SEND, { chat_id: sellerTgId, text: `🔔 *${title}*\n\n${body}`, parse_mode: 'Markdown' }, { timeout: 10000 });
      } catch (_) {}
    }
  } catch (err) {
    console.error('notifySeller error:', err.message);
  }
}

// Convenience wrappers used by routes
async function notifyNewOrder(store, order, buyer) {
  const name = [buyer?.first_name, buyer?.last_name].filter(Boolean).join(' ') || '@' + (buyer?.username || 'buyer');
  return notifySeller(
    store.store_id,
    'new_order',
    'New Order Received',
    `Order ${order.order_ref} from ${name} — Br ${Number(order.total_etb || 0).toLocaleString()}.`,
    { order_id: order.order_id, order_ref: order.order_ref }
  );
}

async function notifyCouponRedeemed(storeId, orderRef, code) {
  return notifySeller(
    storeId,
    'coupon',
    'Coupon Applied',
    `A customer used coupon ${code} on order ${orderRef}.`,
    { order_ref: orderRef }
  );
}

async function notifyPayout(storeId, amount, method) {
  return notifySeller(
    storeId,
    'payout',
    'Payout Processed',
    `Br ${Number(amount || 0).toLocaleString()} sent via ${method || 'payout'}.`,
    { amount }
  );
}

module.exports = {
  insert,
  notifyOrderStatus,
  notifySeller,
  notifyNewOrder,
  notifyCouponRedeemed,
  notifyPayout
};
