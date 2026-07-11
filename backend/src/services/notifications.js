const { query } = require('../db');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_SEND = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

async function notifyOrderStatus(order, newStatus, extra = {}) {
  try {
    const buyerTgId = order.buyer_tg_user_id;
    if (!buyerTgId) return;

    const storeResult = await query(
      'SELECT telegram_notifs FROM stores WHERE store_id = $1',
      [order.store_id]
    );
    if (storeResult.rows.length === 0) return;
    if (storeResult.rows[0].telegram_notifs === false) return;

    let message;
    const storeName = extra.store_name || '';
    const total = Number(order.total_etb).toLocaleString();
    const orderRef = order.order_ref;

    switch (newStatus) {
      case 'pending':
        message = `🛒 Order Placed!\n\nOrder: ${orderRef}\nStore: ${storeName}\nTotal: Br ${total}\nStatus: Pending payment confirmation`;
        break;
      case 'confirmed':
        message = `✅ Payment Confirmed!\n\nOrder: ${orderRef}\nStore: ${storeName}\nTotal: Br ${total}\nYour order is now being processed.`;
        break;
      case 'dispatched':
        message = `🛵 Order Dispatched!\n\nOrder: ${orderRef}\nRider: ${extra.rider_name}\nPhone: ${extra.rider_phone}\nYour order is on its way!`;
        break;
      case 'delivered':
        message = `🎉 Order Delivered!\n\nOrder: ${orderRef}\nThanks for shopping at ${storeName}!\nEnjoy your purchase.`;
        break;
      case 'cancelled':
        message = `❌ Order Cancelled\n\nOrder: ${orderRef}\nTotal: Br ${total}\nIf you paid, refund will be processed by the seller.`;
        break;
      default:
        return;
    }

    const axios = require('axios');
    await axios.post(TG_SEND, {
      chat_id: buyerTgId,
      text: message,
      parse_mode: 'HTML'
    }, { timeout: 10000 });
  } catch (err) {
    console.error('notifyOrderStatus error:', err.message);
  }
}

module.exports = { notifyOrderStatus };
