const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');
const qrService = require('../services/qrcode');
const receiptService = require('../services/receipt');

const router = express.Router();

/**
 * Generate QR code and PDF receipt for a confirmed order
 */
async function generateQRAndReceipt(orderId) {
  const orderResult = await query(
    `SELECT o.*, s.store_name, s.location_sub_city, s.business_phone
     FROM orders o JOIN stores s ON o.store_id = s.store_id
     WHERE o.order_id = $1`,
    [orderId]
  );
  if (orderResult.rows.length === 0) return;
  const order = orderResult.rows[0];

  // Skip if QR already generated
  if (order.qr_data) return;

  // Get buyer
  const buyerResult = await query(
    'SELECT first_name, last_name, username FROM users WHERE tg_user_id = $1',
    [order.buyer_tg_user_id]
  );

  // Generate QR token + data
  const token = qrService.generateToken();
  const qrData = qrService.buildQRData(order, buyerResult.rows[0], { store_name: order.store_name });

  await query(
    'UPDATE orders SET qr_token = $1, qr_data = $2, updated_at = NOW() WHERE order_id = $3',
    [token, JSON.stringify(qrData), orderId]
  );

  // Generate PDF receipt
  const items = await query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
  const qrBuffer = await qrService.generateQRBuffer(qrData);
  const pdfUrl = await receiptService.generateAndUploadReceipt({
    order: { ...order, qr_data: qrData },
    items: items.rows,
    buyer: buyerResult.rows[0] || null,
    store: { store_name: order.store_name, location_sub_city: order.location_sub_city, business_phone: order.business_phone },
    rider: null,
    qrBuffer
  });

  await query('UPDATE orders SET receipt_pdf_url = $1 WHERE order_id = $2', [pdfUrl, orderId]);

  // Send PDF receipt via Telegram to buyer and seller
  try {
    const tgService = require('../services/telegram');
    let pdfBuffer;
    if (pdfUrl && pdfUrl.startsWith('data:')) {
      const base64 = pdfUrl.split(',')[1];
      pdfBuffer = Buffer.from(base64, 'base64');
    } else {
      const pdfResp = await axios.get(pdfUrl, { responseType: 'arraybuffer', timeout: 15000 });
      pdfBuffer = Buffer.from(pdfResp.data);
    }

    // Send to buyer
    await tgService.sendDocument(
      order.buyer_tg_user_id, pdfBuffer,
      `Medebirr-Receipt-${order.order_ref}.pdf`,
      `📄 Your receipt for order ${order.order_ref}`
    );

    // Send to seller
    await tgService.sendDocument(
      order.admin_tg_user_id, pdfBuffer,
      `Medebirr-Receipt-${order.order_ref}.pdf`,
      `📄 Receipt for order ${order.order_ref}`
    );
  } catch (e) {
    console.warn('PDF Telegram delivery failed:', e.message);
  }
}

/**
 * POST /api/v1/payments/telebirr/initiate
 * Initiate a direct Telebirr payment to seller's merchant code
 */
router.post('/telebirr/initiate', requireAuth, async (req, res, next) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'order_id required' });

    // Get order details
    const orderResult = await query(
      `SELECT o.*, s.telebirr_merchant_id, s.store_name
       FROM orders o JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1 AND o.buyer_tg_user_id = $2`,
      [order_id, req.user.tg_user_id]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];

    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order already paid' });
    }
    if (!order.telebirr_merchant_id) {
      return res.status(400).json({ error: 'Store Telebirr account not configured' });
    }

    const txRef = `TBX-${order.telebirr_merchant_id}-${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(8).toString('hex');

    // Build Telebirr payload (Ethio Telecom SuperApp API format)
    const telebirrPayload = {
      appId: process.env.TELEBIRR_APP_ID,
      merchantCode: order.telebirr_merchant_id, // Direct to seller
      nonce,
      notifyUrl: `${process.env.APP_URL}/api/v1/payments/telebirr/webhook`,
      outTradeNo: txRef,
      returnApp: process.env.TELEGRAM_BOT_USERNAME,
      returnUrl: `${process.env.FRONTEND_URL}/order-complete?order_id=${order_id}`,
      shortCode: order.telebirr_merchant_id,
      subject: `Order ${order.order_ref} - ${order.store_name}`,
      timeoutExpress: '30',
      timestamp,
      totalAmount: order.total_etb.toFixed(2),
      tradeType: '0'
    };

    // Sign the payload
    const signString = Object.keys(telebirrPayload)
      .sort()
      .map(k => `${k}=${telebirrPayload[k]}`)
      .join('&') + `&key=${process.env.TELEBIRR_APP_SECRET}`;

    telebirrPayload.sign = crypto.createHash('sha256').update(signString).digest('hex').toUpperCase();

    // Record initiation
    await query(
      `INSERT INTO payment_transactions (order_id, gateway, gateway_tx_ref, amount_etb, merchant_code, status)
       VALUES ($1, 'telebirr', $2, $3, $4, 'initiated')`,
      [order_id, txRef, order.total_etb, order.telebirr_merchant_id]
    );

    // Update order with tx_ref
    await query('UPDATE orders SET payment_tx_ref = $1 WHERE order_id = $2', [txRef, order_id]);

    // In development/demo, return mock payment URL
    if (process.env.NODE_ENV !== 'production') {
      return res.json({
        success: true,
        txRef,
        toPayUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/mock-payment?tx=${txRef}&amount=${order.total_etb}&merchant=${order.telebirr_merchant_id}&order=${order_id}`,
        rawRequest: Buffer.from(JSON.stringify(telebirrPayload)).toString('base64'),
        message: 'Demo mode: Use mock payment URL'
      });
    }

    // Production: call Telebirr API
    const telebirrResponse = await axios.post(
      `${process.env.TELEBIRR_BASE_URL}/placeOrder`,
      telebirrPayload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000, httpsAgent: false }
    );

    if (telebirrResponse.data.code === '200') {
      res.json({
        success: true,
        txRef,
        toPayUrl: telebirrResponse.data.data?.toPayUrl,
        rawRequest: telebirrResponse.data.data?.rawRequest
      });
    } else {
      throw new Error(`Telebirr error: ${telebirrResponse.data.msg}`);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/payments/telebirr/webhook
 * Telebirr payment notification (webhook from Ethio Telecom)
 */
router.post('/telebirr/webhook', async (req, res, next) => {
  try {
    const payload = req.body;
    const receivedSign = payload.sign;
    delete payload.sign;

    // Verify webhook signature
    const signString = Object.keys(payload)
      .sort()
      .map(k => `${k}=${payload[k]}`)
      .join('&') + `&key=${process.env.TELEBIRR_APP_SECRET}`;

    const expectedSign = crypto.createHash('sha256').update(signString).digest('hex').toUpperCase();

    const isTesting = process.env.NODE_ENV === 'test' || process.env.BYPASS_TELEGRAM_AUTH === 'true';
    if (!isTesting && receivedSign !== expectedSign) {
      console.warn('Telebirr webhook signature mismatch');
      return res.status(400).json({ code: 'FAIL', msg: 'Invalid signature' });
    }

    const { outTradeNo, transactionNo, tradeStatus } = payload;

    // Find transaction
    const txResult = await query(
      'SELECT * FROM payment_transactions WHERE gateway_tx_ref = $1',
      [outTradeNo]
    );
    if (txResult.rows.length === 0) {
      return res.json({ code: 'SUCCESS', msg: 'Unknown transaction' });
    }
    const tx = txResult.rows[0];

    if (tradeStatus === 'SUCCESS' || tradeStatus === '0') {
      // Mark transaction complete
      await query(
        `UPDATE payment_transactions SET
          status = 'completed', gateway_response = $1, webhook_verified = TRUE, settled_at = NOW()
         WHERE gateway_tx_ref = $2`,
        [JSON.stringify(payload), outTradeNo]
      );

      // Mark order paid
      await query(
        `UPDATE orders SET
          payment_status = 'paid', order_status = 'confirmed',
          telebirr_tx_id = $1, updated_at = NOW()
         WHERE order_id = $2`,
        [transactionNo, tx.order_id]
      );

      // Actual stock deduction (remove reservation, reduce actual stock)
      const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [tx.order_id]);
      for (const item of items.rows) {
        await query(
          `UPDATE products SET
            stock_quantity = GREATEST(0, stock_quantity - $1),
            reserved_stock = GREATEST(0, reserved_stock - $1)
           WHERE product_id = $2`,
          [item.quantity, item.product_id]
        );
      }

      console.log(`✅ Telebirr payment confirmed: Order ${tx.order_id}, TX: ${transactionNo}`);

      // Generate QR code + PDF receipt for the confirmed order
      try {
        await generateQRAndReceipt(tx.order_id);
      } catch (e) {
        console.warn('QR/Receipt generation failed:', e.message);
      }

      // Notify seller via Telegram bot (private DM, not group)
      try {
        const tgService = require('../services/telegram');
        const orderFull = await query(
          `SELECT o.*, s.tg_group_id, s.admin_tg_user_id, u.first_name, u.last_name, u.username
           FROM orders o
           JOIN stores s ON o.store_id = s.store_id
           JOIN users u ON o.buyer_tg_user_id = u.tg_user_id
           WHERE o.order_id = $1`,
          [tx.order_id]
        );
        const items = await query('SELECT * FROM order_items WHERE order_id = $1', [tx.order_id]);
        const ord = orderFull.rows[0];
        if (ord) {
          // ROUTE TO PRIVATE DM (Preferred)
          if (ord.admin_tg_user_id) {
            await tgService.notifySellerNewOrder(ord.admin_tg_user_id, ord, ord, items.rows);
          } else if (ord.tg_group_id) {
            // Safe fallback: send to group, but let's notify seller of privacy risk
            console.warn(`Privacy Warning: Routing order notification for #${ord.order_ref} to public group.`);
            const sanitizedBuyer = { first_name: 'Buyer', last_name: '', username: '' };
            const sanitizedOrd = {
              ...ord,
              delivery_address: JSON.stringify({
                sub_city: ord.location_sub_city || 'Addis Ababa',
                phone: 'REDACTED (View in Seller Studio)'
              })
            };
            await tgService.notifySellerNewOrder(ord.tg_group_id, sanitizedOrd, sanitizedBuyer, items.rows);
          }
        }
      } catch (e) {
        console.warn('Seller notification failed:', e.message);
      }

      // Notify buyer
      try {
        const notif = require('../services/notifications');
        const buyerOrder = await query('SELECT * FROM orders WHERE order_id = $1', [tx.order_id]);
        await notif.notifyOrderStatus(buyerOrder.rows[0], 'confirmed');
      } catch (_) {}
    } else {
      await query(
        `UPDATE payment_transactions SET status = 'failed', gateway_response = $1 WHERE gateway_tx_ref = $2`,
        [JSON.stringify(payload), outTradeNo]
      );
      await query(
        `UPDATE orders SET payment_status = 'failed', updated_at = NOW() WHERE order_id = $1`,
        [tx.order_id]
      );

      // Release reserved stock on failure
      const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [tx.order_id]);
      for (const item of items.rows) {
        await query(
          'UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - $1) WHERE product_id = $2',
          [item.quantity, item.product_id]
        );
      }
    }

    res.json({ code: 'SUCCESS', msg: 'OK' });
  } catch (err) {
    console.error('Telebirr webhook error:', err);
    res.json({ code: 'FAIL', msg: err.message });
  }
});

/**
 * POST /api/v1/payments/cash/confirm
 * Simulate cash on delivery confirmation (for demo)
 */
router.post('/cash/confirm', requireAuth, async (req, res, next) => {
  try {
    const { order_id } = req.body;
    const orderResult = await query(
      'SELECT * FROM orders WHERE order_id = $1 AND buyer_tg_user_id = $2 AND payment_method = $3',
      [order_id, req.user.tg_user_id, 'cash']
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Cash order not found' });

    await query(
      `INSERT INTO payment_transactions (order_id, gateway, gateway_tx_ref, amount_etb, status, settled_at)
       VALUES ($1, 'cash', $2, $3, 'completed', NOW())
       ON CONFLICT DO NOTHING`,
      [order_id, `CASH-${order_id}`, orderResult.rows[0].total_etb]
    );
    await query(
      `UPDATE orders SET payment_status = 'paid', order_status = 'confirmed', updated_at = NOW() WHERE order_id = $1`,
      [order_id]
    );

    const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [order_id]);
    for (const item of items.rows) {
      await query(
        `UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), reserved_stock = GREATEST(0, reserved_stock - $1) WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }

    // Generate QR + receipt for confirmed order
    try { await generateQRAndReceipt(order_id); } catch (e) { console.warn('QR/Receipt failed:', e.message); }

    // Notify seller via Telegram (private DM)
    try {
      const tgService = require('../services/telegram');
      const storeResult = await query('SELECT s.admin_tg_user_id FROM orders o JOIN stores s ON o.store_id = s.store_id WHERE o.order_id = $1', [order_id]);
      const sellerId = storeResult.rows[0]?.admin_tg_user_id;
      if (sellerId) {
        const ord = orderResult.rows[0];
        await tgService.tgCall('sendMessage', {
          chat_id: sellerId,
          text: `💵 *Cash Order Confirmed!*\n\nOrder *${ord.order_ref}* — Br ${Number(ord.total_etb).toLocaleString()}\nBuyer confirmed cash payment.\n\nPlease prepare for dispatch.`,
          parse_mode: 'MarkdownV2'
        });
      }
    } catch (_) {}

    // Notify buyer
    try {
      const notif = require('../services/notifications');
      await notif.notifyOrderStatus(orderResult.rows[0], 'confirmed');
    } catch (_) {}

    res.json({ message: 'Cash payment confirmed. Order confirmed.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/payments/confirm-tx
 * Buyer submits transaction code after paying via Telebirr/CBE directly to seller
 */
  router.post('/confirm-tx', requireAuth, async (req, res, next) => {
    try {
      const { order_id, transaction_code } = req.body;
      if (!order_id) {
        return res.status(400).json({ error: 'order_id is required' });
      }

      const orderResult = await query(
        `SELECT o.*, s.telebirr_merchant_id, s.cbe_account_number, s.store_name, s.admin_tg_user_id
         FROM orders o JOIN stores s ON o.store_id = s.store_id
         WHERE o.order_id = $1 AND o.buyer_tg_user_id = $2`,
        [order_id, req.user.tg_user_id]
      );
      if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

      const order = orderResult.rows[0];
      if (!['telebirr', 'cbe'].includes(order.payment_method)) {
        return res.status(400).json({ error: 'This order does not use a manual payment method' });
      }
      if (order.payment_status === 'paid') {
        return res.status(400).json({ error: 'Order is already paid' });
      }

      await markOrderPaid(order, transaction_code);

      res.json({ message: 'Payment confirmed with transaction code. Order confirmed.', order_id });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Mark an order as paid + confirmed and run all side effects
   * (payment record, stock deduction, QR/receipt, buyer + seller notifications).
   * Shared by the in-app confirm-tx route and the Payment Verification Bot.
   * @param {Object} order - order row joined with store fields (admin_tg_user_id, telebirr_merchant_id, cbe_account_number, store_name)
   * @param {string} [transactionCode] - optional transaction reference
   */
  async function markOrderPaid(order, transactionCode, paymentProof) {
    const orderId = order.order_id;
    const gateway = order.payment_method;
    const txRef = transactionCode || `TXN-${Date.now()}`;
    await query(
      `INSERT INTO payment_transactions (order_id, gateway, gateway_tx_ref, amount_etb, merchant_code, status)
       VALUES ($1, $2, $3, $4, $5, 'completed')
       ON CONFLICT DO NOTHING`,
      [orderId, gateway, txRef, order.total_etb,
       gateway === 'telebirr' ? order.telebirr_merchant_id : order.cbe_account_number]
    );

    await query(
      `UPDATE orders SET payment_status = 'paid', order_status = 'confirmed',
        transaction_code = $1, payment_tx_ref = $2, payment_proof = $3, updated_at = NOW()
       WHERE order_id = $4`,
      [txRef, txRef, paymentProof ? JSON.stringify(paymentProof) : null, orderId]
    );

    const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [orderId]);
    for (const item of items.rows) {
      await query(
        `UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1), reserved_stock = GREATEST(0, reserved_stock - $1) WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }

    try { await generateQRAndReceipt(orderId); } catch (e) { console.warn('QR/Receipt failed:', e.message); }

    try {
      const tgService = require('../services/telegram');
      if (order.admin_tg_user_id) {
        await tgService.tgCall('sendMessage', {
          chat_id: order.admin_tg_user_id,
          text: `💰 *Payment Received!*\n\nOrder *${order.order_ref}* — Br ${Number(order.total_etb).toLocaleString()}\nMethod: ${gateway.toUpperCase()}\nTransaction Code: \`${transactionCode || txRef}\`\n\nPlease prepare for dispatch.`,
          parse_mode: 'MarkdownV2'
        });
      }
    } catch (_) {}

    try {
      const notif = require('../services/notifications');
      await notif.notifyOrderStatus(order, 'confirmed');
    } catch (_) {}
  }

  module.exports = router;
  // Expose the helper so the bot can confirm payments without re-implementing logic.
  router.markOrderPaid = markOrderPaid;
