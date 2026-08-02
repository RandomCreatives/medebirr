const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');
const qrService = require('../services/qrcode');
const receiptService = require('../services/receipt');
const inventory = require('../services/inventory');
const { retryOnDeadlock } = require('../utils/retry');
const telebirr = require('../utils/telebirr');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * Generate QR code and PDF receipt for a confirmed order
 */
async function generateQRAndReceipt(orderId) {
  const orderResult = await query(
    `SELECT o.*, s.store_name, s.location_sub_city, s.business_phone, s.admin_tg_user_id
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
  const qrData = qrService.buildQRData(order, buyerResult.rows[0], { store_name: order.store_name }, token);

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

    await tgService.sendDocument(
      order.buyer_tg_user_id, pdfBuffer,
      `Medebirr-Receipt-${order.order_ref}.pdf`,
      `📄 Your receipt for order ${order.order_ref}`
    );

    await tgService.sendDocument(
      order.admin_tg_user_id, pdfBuffer,
      `Medebirr-Receipt-${order.order_ref}.pdf`,
      `📄 Receipt for order ${order.order_ref}`
    );
  } catch (e) {
    logger.warn({ err: e.message }, 'PDF Telegram delivery failed');
  }
}

/**
 * Notify the seller (Telegram DM with Confirm/Reject buttons) that a buyer
 * has submitted a manual payment for verification. The order is NOT paid
 * until the seller presses Confirm (bot callback) — that is the only path
 * that reaches markOrderPaid besides the signed Telebirr webhook.
 */
async function notifySellerPaymentPending(order, txNote, hasProof) {
  try {
    const tgService = require('../services/telegram');
    if (!order.admin_tg_user_id) return;
    const proofLine = hasProof
      ? '\n📎 The buyer attached a payment screenshot in the app.'
      : '\n⚠️ No screenshot attached — check your account before confirming.';
    await tgService.tgCall('sendMessage', {
      chat_id: order.admin_tg_user_id,
      text:
        `💳 <b>Payment verification requested</b>\n\n` +
        `Order <b>${escapeHtmlTg(order.order_ref)}</b> — Br ${Number(order.total_etb).toLocaleString()}\n` +
        `Method: ${escapeHtmlTg(String(order.payment_method || '').toUpperCase())}\n` +
        (txNote ? `TX code: <code>${escapeHtmlTg(txNote)}</code>\n` : 'TX code: (not provided)\n') +
        proofLine +
        `\n\nConfirm only if the funds actually arrived.`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Confirm Payment', callback_data: `confirm_pay_${order.order_id}` },
          { text: '❌ Reject', callback_data: `reject_pay_${order.order_id}` }
        ]]
      }
    });
  } catch (e) {
    logger.warn({ err: e.message }, 'Seller payment-verification DM failed');
  }
}

function escapeHtmlTg(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Shared seller-side verification helpers for the order/buyer lookup used by
 * notifyNewOrder-style notifications after payment confirmation.
 */
async function notifyPartiesOrderPaid(order, orderId) {
  // Notify buyer
  try {
    const notif = require('../services/notifications');
    await notif.notifyOrderStatus(order, 'confirmed');
  } catch (_) {}

  // Notify seller (in-app feed + Telegram DM)
  try {
    const notif = require('../services/notifications');
    const fullOrder = await query(
      'SELECT o.*, u.first_name, u.last_name, u.username FROM orders o JOIN users u ON o.buyer_tg_user_id = u.tg_user_id WHERE o.order_id = $1',
      [orderId]
    );
    if (fullOrder.rows[0]) await notif.notifyNewOrder({ store_id: fullOrder.rows[0].store_id }, fullOrder.rows[0], fullOrder.rows[0]);
  } catch (_) {}
}

/**
 * POST /api/v1/payments/telebirr/initiate
 * Initiate a direct Telebirr payment to seller's merchant code
 */
router.post('/telebirr/initiate', requireAuth, async (req, res, next) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'order_id required' });

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

    // Idempotency: reuse an open initiation (< 30 min old) instead of placing
    // a second Telebirr order for the same medebirr order.
    const recentTx = await query(
      `SELECT gateway_tx_ref, gateway_response, created_at FROM payment_transactions
       WHERE order_id = $1 AND gateway = 'telebirr' AND status = 'initiated'
         AND created_at > NOW() - INTERVAL '30 minutes'
       ORDER BY created_at DESC LIMIT 1`,
      [order_id]
    );
    if (recentTx.rows.length > 0 && order.payment_tx_ref === recentTx.rows[0].gateway_tx_ref) {
      const prev = recentTx.rows[0];
      let toPayUrl = null;
      let rawRequest = null;
      try {
        const gr = typeof prev.gateway_response === 'string' ? JSON.parse(prev.gateway_response) : prev.gateway_response;
        toPayUrl = gr?.toPayUrl || null;
        rawRequest = gr?.rawRequest || null;
      } catch (_) {}
      return res.json({ success: true, txRef: prev.gateway_tx_ref, toPayUrl, rawRequest, reused: true });
    }

    const txRef = `TBX-${order.telebirr_merchant_id}-${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = require('crypto').randomBytes(8).toString('hex');

    // Build Telebirr payload (Ethio Telecom SuperApp API format)
    const telebirrPayload = {
      appId: process.env.TELEBIRR_APP_ID,
      merchantCode: order.telebirr_merchant_id, // Direct to seller
      nonce,
      notifyUrl: `${process.env.APP_URL}/api/v1/payments/telebirr/webhook`,
      outTradeNo: txRef,
      returnApp: process.env.TELEGRAM_BOT_USERNAME,
      returnUrl: `${process.env.FRONTEND_URL}/?startapp=order_${order_id}`,
      shortCode: order.telebirr_merchant_id,
      subject: `Order ${order.order_ref} - ${order.store_name}`,
      timeoutExpress: '30',
      timestamp,
      totalAmount: Number(order.total_etb).toFixed(2),
      tradeType: '0'
    };
    telebirrPayload.sign = telebirr.sign(telebirrPayload, process.env.TELEBIRR_APP_SECRET);

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
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    if (telebirrResponse.data.code === '200') {
      // Persist the payment URL so re-initiation can reuse it
      await query(
        `UPDATE payment_transactions SET gateway_response = $1 WHERE gateway_tx_ref = $2`,
        [JSON.stringify({ toPayUrl: telebirrResponse.data.data?.toPayUrl || null, rawRequest: telebirrResponse.data.data?.rawRequest || null }), txRef]
      );
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
 * Telebirr payment notification (webhook from Ethio Telecom).
 *
 * SECURITY: the signature is ALWAYS verified when TELEBIRR_APP_SECRET is set.
 * There is deliberately no test/bypass switch here — a flag that disables
 * signature checks on a payment endpoint will eventually be left on.
 */
router.post('/telebirr/webhook', retryOnDeadlock(async (req, res, next) => {
  try {
    const payload = req.body || {};
    const secret = process.env.TELEBIRR_APP_SECRET;

    if (!secret) {
      // Without a secret we cannot verify anything. Accepting anyway would
      // let anyone forge payments; reject loudly instead.
      logger.error('TELEBIRR_APP_SECRET not configured — rejecting webhook');
      return res.status(503).json({ code: 'FAIL', msg: 'Webhook not configured' });
    }
    if (!telebirr.verifySignature(payload, secret)) {
      logger.warn({ outTradeNo: payload.outTradeNo }, 'Telebirr webhook signature mismatch');
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

    // Guard: skip if order is already paid (prevents double stock deduction)
    const orderCheck = await query(
      'SELECT payment_status, total_etb FROM orders WHERE order_id = $1',
      [tx.order_id]
    );
    if (orderCheck.rows.length > 0 && orderCheck.rows[0].payment_status === 'paid') {
      return res.json({ code: 'SUCCESS', msg: 'Already processed' });
    }

    // Amount integrity: the paid amount must match the order total.
    if (payload.totalAmount != null && orderCheck.rows.length > 0 &&
        !telebirr.amountsMatch(payload.totalAmount, orderCheck.rows[0].total_etb)) {
      logger.warn({ outTradeNo, paid: payload.totalAmount, expected: orderCheck.rows[0].total_etb },
        'Telebirr webhook amount mismatch — rejecting');
      return res.status(400).json({ code: 'FAIL', msg: 'Amount mismatch' });
    }

    if (tradeStatus === 'SUCCESS' || tradeStatus === '0') {
      // Mark transaction complete
      await query(
        `UPDATE payment_transactions SET
          status = 'completed', gateway_response = $1, webhook_verified = TRUE, settled_at = NOW()
         WHERE gateway_tx_ref = $2`,
        [JSON.stringify(payload), outTradeNo]
      );

      // Idempotency: skip if already paid
      const orderStatus = await query('SELECT payment_status FROM orders WHERE order_id = $1', [tx.order_id]);
      if (orderStatus.rows[0].payment_status === 'paid') {
        logger.info({ orderId: tx.order_id }, 'Stock already deducted, skipping');
        res.json({ code: 'SUCCESS', msg: 'Already processed' });
      } else {
        // Mark order paid
        await query(
          `UPDATE orders SET
            payment_status = 'paid', order_status = 'confirmed',
            telebirr_tx_id = $1, updated_at = NOW()
           WHERE order_id = $2`,
          [transactionNo, tx.order_id]
        );

        // Actual stock deduction (remove reservation, reduce actual stock)
        await inventory.deductStock(tx.order_id);

        logger.info({ orderId: tx.order_id, transactionNo }, 'Telebirr payment confirmed');

        // Generate QR code + PDF receipt for the confirmed order
        try { await generateQRAndReceipt(tx.order_id); } catch (e) { logger.warn({ err: e.message }, 'QR/Receipt generation failed'); }

        // Notify seller via Telegram bot (private DM, not group)
        try {
          const tgService = require('../services/telegram');
          const orderFull = await query(
            `SELECT o.*, s.tg_group_id, s.admin_tg_user_id, s.location_sub_city, u.first_name, u.last_name, u.username
             FROM orders o JOIN stores s ON o.store_id = s.store_id JOIN users u ON o.buyer_tg_user_id = u.tg_user_id
             WHERE o.order_id = $1`,
            [tx.order_id]
          );
          const items = await query('SELECT * FROM order_items WHERE order_id = $1', [tx.order_id]);
          const ord = orderFull.rows[0];
          if (ord) {
            if (ord.admin_tg_user_id) {
              await tgService.notifySellerNewOrder(ord.admin_tg_user_id, ord, ord, items.rows);
            } else if (ord.tg_group_id) {
              logger.warn({ orderRef: ord.order_ref }, 'Privacy: routing order notification to group');
              const sanitizedBuyer = { first_name: 'Buyer', last_name: '', username: '' };
              const sanitizedOrd = { ...ord, delivery_address: JSON.stringify({ sub_city: ord.location_sub_city || 'Addis Ababa', phone: 'REDACTED (View in Seller Studio)' }) };
              await tgService.notifySellerNewOrder(ord.tg_group_id, sanitizedOrd, sanitizedBuyer, items.rows);
            }
          }
        } catch (e) { logger.warn({ err: e.message }, 'Seller notification failed'); }

        // Notify buyer + seller feeds
        try {
          const notif = require('../services/notifications');
          const buyerOrder = await query('SELECT * FROM orders WHERE order_id = $1', [tx.order_id]);
          await notif.notifyOrderStatus(buyerOrder.rows[0], 'confirmed');
        } catch (_) {}
        try {
          const notif = require('../services/notifications');
          const fullOrder = await query(
            'SELECT o.*, u.first_name, u.last_name, u.username FROM orders o JOIN users u ON o.buyer_tg_user_id = u.tg_user_id WHERE o.order_id = $1',
            [tx.order_id]
          );
          if (fullOrder.rows[0]) await notif.notifyNewOrder({ store_id: fullOrder.rows[0].store_id }, fullOrder.rows[0], fullOrder.rows[0]);
        } catch (_) {}
      }
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
      await inventory.releaseReservedStock(tx.order_id);
    }

    res.json({ code: 'SUCCESS', msg: 'OK' });
  } catch (err) {
    logger.error({ err: err.message }, 'Telebirr webhook error');
    res.status(500).json({ code: 'FAIL', msg: err.message });
  }
}));

/**
 * POST /api/v1/payments/cash/confirm
 * SELLER-side: attest that cash was collected for a cash-on-delivery order.
 *
 * This used to let the *buyer* mark their own order paid at checkout time —
 * which made "payment_status" meaningless for COD. Cash orders are now
 * created confirmed/unpaid, and flip to paid when delivery completes
 * (inventory.completeDelivery) or when the seller attests collection here.
 */
router.post('/cash/confirm', requireAuth, async (req, res, next) => {
  try {
    const { order_id } = req.body;
    const orderResult = await query(
      `SELECT o.*, s.admin_tg_user_id
       FROM orders o JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1 AND o.payment_method = 'cash'`,
      [order_id]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Cash order not found' });
    const order = orderResult.rows[0];

    if (order.admin_tg_user_id !== req.user.tg_user_id) {
      return res.status(403).json({ error: 'Only the seller can confirm cash collection' });
    }
    if (order.payment_status === 'paid') {
      return res.json({ message: 'Order already marked paid' });
    }
    if (order.order_status === 'cancelled') {
      return res.status(400).json({ error: 'Order is cancelled' });
    }

    await markCashCollected(order);
    res.json({ message: 'Cash collection recorded.' });
  } catch (err) {
    next(err);
  }
});

/**
 * Mark a cash order paid with an accompanying ledger row. Idempotent.
 * Used by the seller cash/confirm route and by inventory.completeDelivery
 * when a COD order is delivered.
 */
async function markCashCollected(order) {
  // Only the call that actually flips payment_status writes the ledger row —
  // concurrent duplicates are serialized by the row lock inside the UPDATE.
  const flipped = await query(
    `UPDATE orders SET payment_status = 'paid', updated_at = NOW()
     WHERE order_id = $1 AND payment_status != 'paid'
     RETURNING order_id`,
    [order.order_id]
  );
  if (flipped.rows.length === 0) return;
  await query(
    `INSERT INTO payment_transactions (order_id, gateway, gateway_tx_ref, amount_etb, status, settled_at)
     VALUES ($1, 'cash', $2, $3, 'completed', NOW())
     ON CONFLICT DO NOTHING`,
    [order.order_id, `CASH-${order.order_id}`, order.total_etb]
  );
}

/**
 * POST /api/v1/payments/confirm-tx
 * Buyer submits a transaction code (optionally with a screenshot) after
 * paying via Telebirr/M-Pesa/CBE directly to the seller.
 *
 * SECURITY MODEL: this records the claim and forwards it to the seller for
 * verification — it does NOT mark the order paid. Payment is only marked
 * paid by (a) the seller pressing Confirm in the bot, or (b) the signed
 * Telebirr webhook. Order status stays 'pending' and stock stays reserved
 * until then.
 */
router.post('/confirm-tx', requireAuth, async (req, res, next) => {
  try {
    const { order_id, transaction_code, payment_proof } = req.body;
    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }
    const txCode = transaction_code ? String(transaction_code).trim().slice(0, 100) : null;
    if (!txCode && !payment_proof) {
      return res.status(400).json({ error: 'Provide a transaction code or payment proof' });
    }

    const orderResult = await query(
      `SELECT o.*, s.telebirr_merchant_id, s.cbe_account_number, s.store_name, s.admin_tg_user_id
       FROM orders o JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1 AND o.buyer_tg_user_id = $2`,
      [order_id, req.user.tg_user_id]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orderResult.rows[0];
    if (!['telebirr', 'mpesa', 'cbe'].includes(order.payment_method)) {
      return res.status(400).json({ error: 'This order does not use a manual payment method' });
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    // Record the claim: move to 'verifying' (idempotent — re-submits update)
    await query(
      `UPDATE orders SET
         payment_status = 'verifying', transaction_code = COALESCE($1, transaction_code),
         payment_proof = COALESCE($2, payment_proof), updated_at = NOW()
       WHERE order_id = $3 AND payment_status != 'paid'`,
      [txCode, payment_proof ? JSON.stringify(payment_proof) : null, order_id]
    );

    // Open (or refresh) a seller-verification ticket the bot callbacks act on
    const existing = await query(
      `SELECT verification_id FROM payment_verifications
       WHERE order_id = $1 AND status IN ('awaiting_receipt', 'pending_seller_confirm')
       ORDER BY created_at DESC LIMIT 1`,
      [order_id]
    );
    if (existing.rows.length > 0) {
      await query(
        `UPDATE payment_verifications SET
           transaction_note = COALESCE($1, transaction_note),
           status = 'pending_seller_confirm', updated_at = NOW()
         WHERE verification_id = $2`,
        [txCode, existing.rows[0].verification_id]
      );
    } else {
      await query(
        `INSERT INTO payment_verifications (order_id, buyer_tg_user_id, status, transaction_note)
         VALUES ($1, $2, 'pending_seller_confirm', $3)`,
        [order_id, req.user.tg_user_id, txCode]
      );
    }

    // DM the seller with Confirm/Reject buttons (bot.js handles the callback)
    await notifySellerPaymentPending(order, txCode, !!payment_proof);

    res.json({
      message: 'Payment submitted for seller verification. Your order is confirmed once the seller verifies it.',
      order_id,
      payment_status: 'verifying'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Mark an order as paid + confirmed and run all side effects
 * (payment record, stock deduction, QR/receipt, buyer + seller notifications).
 *
 * Callers: the seller-confirm bot callback (bot.js) and any future route that
 * has independently verified the funds. Never call from a buyer-only path.
 *
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

  // Skip if already deducted in a previous payment attempt
  const orderStatus = await query('SELECT payment_status FROM orders WHERE order_id = $1', [orderId]);
  if (orderStatus.rows[0].payment_status !== 'paid') {
    await query(
      `UPDATE orders SET payment_status = 'paid', order_status = 'confirmed',
        transaction_code = $1, payment_proof = COALESCE($2, payment_proof), updated_at = NOW()
       WHERE order_id = $3`,
      [txRef, paymentProof ? JSON.stringify(paymentProof) : null, orderId]
    );
    await inventory.deductStock(orderId);
  } else {
    logger.info({ orderId }, 'Payment already processed, skipping');
  }

  try { await generateQRAndReceipt(orderId); } catch (e) { logger.warn({ err: e.message }, 'QR/Receipt failed'); }

  try {
    const tgService = require('../services/telegram');
    if (order.admin_tg_user_id) {
      // HTML parse mode via sendSafeMessage — a buyer-supplied tx code full of
      // MarkdownV2 specials would otherwise break message delivery entirely.
      await tgService.sendSafeMessage(order.admin_tg_user_id,
        `💰 *Payment Confirmed!*\n\nOrder *${order.order_ref}* — Br ${Number(order.total_etb).toLocaleString()}\n` +
        `Method: ${String(gateway).toUpperCase()}\nTransaction Code: \`${transactionCode || txRef}\`\n\nPlease prepare for dispatch.`);
    }
  } catch (_) {}

  await notifyPartiesOrderPaid(order, orderId);
}

module.exports = router;
// Expose helpers so the bot can confirm payments without re-implementing logic.
router.markOrderPaid = markOrderPaid;
router.markCashCollected = markCashCollected;
