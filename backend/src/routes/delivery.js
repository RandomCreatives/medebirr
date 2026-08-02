/**
 * Delivery Verification routes
 * QR code display, scanning, dual-confirmation, return, settlement
 *
 * AUTHORIZATION MODEL (every route):
 *   - 'buyer' side  → only the order's buyer_tg_user_id
 *   - 'rider' side  → the store owner (admin_tg_user_id). There is no rider
 *                     account entity yet; in practice the seller's device (or
 *                     their rider using it) performs the rider-side scan.
 *   - anyone else   → 403
 * Before this was enforced, any authenticated user could fetch any order's
 * QR token and self-sign both sides of the delivery handshake.
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');
const tg = require('../services/telegram');
const qrService = require('../services/qrcode');
const receiptService = require('../services/receipt');
const { withinRadius } = require('../utils/geo');
const inventory = require('../services/inventory');
const ordersDal = require('../dal/orders');

const router = express.Router();

const MAX_SCAN_ATTEMPTS = 5;
const MAX_OTP_ATTEMPTS = 10;

/**
 * Resolve the caller's relationship to the order.
 * @returns {{isBuyer: boolean, isSeller: boolean}}
 */
function orderParties(order, tgUserId) {
  return {
    isBuyer: order.buyer_tg_user_id === tgUserId,
    isSeller: order.admin_tg_user_id === tgUserId
  };
}

/**
 * GET /api/v1/delivery/:orderId/qr
 * Get QR code data URL for an order (buyer or seller only).
 */
router.get('/:orderId/qr', requireAuth, async (req, res, next) => {
  try {
    const result = await ordersDal.getById(req.params.orderId);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = result.rows[0];
    const { isBuyer, isSeller } = orderParties(order, req.user.tg_user_id);
    if (!isBuyer && !isSeller) return res.status(403).json({ error: 'Not authorized for this order' });

    if (!order.qr_data) {
      return res.status(400).json({ error: 'QR code not yet generated for this order' });
    }

    // Both parties may display the QR at handover (buyer presents it to the
    // rider; the seller-side device may also present it for the buyer to
    // scan). The scan routes — not token secrecy — enforce which side each
    // party can sign, so sharing the payload with both is safe.
    const flags = {
      order_ref: order.order_ref,
      verified_by_rider: order.qr_verified_by_rider,
      verified_by_buyer: order.qr_verified_by_buyer,
      scan_attempts: order.qr_scan_attempts
    };

    const qrUrl = await qrService.generateQRDataURL(order.qr_data);
    res.json({ ...flags, qr_url: qrUrl, qr_data: order.qr_data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/delivery/:orderId/scan
 * Submit a QR scan result (rider scans buyer's QR, or buyer scans rider's QR)
 * Body: { scanned_data: {...decoded QR JSON...}, scanner_role: 'rider'|'buyer' }
 */
router.post('/:orderId/scan', requireAuth, async (req, res, next) => {
  try {
    const { scanned_data, scanner_role } = req.body;
    if (!scanned_data || !scanner_role) {
      return res.status(400).json({ error: 'scanned_data and scanner_role are required' });
    }
    if (!['rider', 'buyer'].includes(scanner_role)) {
      return res.status(400).json({ error: 'scanner_role must be rider or buyer' });
    }

    const result = await ordersDal.getById(req.params.orderId);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = result.rows[0];

    // Party check: buyer-side scans only by the buyer, rider-side only by the seller
    const { isBuyer, isSeller } = orderParties(order, req.user.tg_user_id);
    if (scanner_role === 'buyer' && !isBuyer) {
      return res.status(403).json({ error: 'Only the buyer can confirm the buyer side' });
    }
    if (scanner_role === 'rider' && !isSeller) {
      return res.status(403).json({ error: 'Only the seller (or their rider) can confirm the rider side' });
    }

    // Check if already fully verified
    if (order.qr_verified_by_rider && order.qr_verified_by_buyer) {
      return res.json({ success: true, message: 'Delivery already confirmed by both parties', already_confirmed: true });
    }

    // Validate QR data
    const validation = qrService.validateQRData(scanned_data, order);
    const attemptNumber = (order.qr_scan_attempts || 0) + 1;

    // Log the verification attempt
    await ordersDal.logVerificationAttempt(
      req.params.orderId, scanner_role, req.user.tg_user_id,
      scanner_role === 'rider' ? 'buyer' : 'rider',
      validation.orderRef || null, validation.valid, attemptNumber
    );

    // Update attempt count
    await ordersDal.setField(req.params.orderId, 'qr_scan_attempts', attemptNumber);

    if (!validation.valid) {
      if (attemptNumber >= MAX_SCAN_ATTEMPTS) {
        await ordersDal.updateStatus(req.params.orderId, 'cancelled', {
          return_initiated_at: new Date(),
          return_reason: 'QR verification failed after ' + attemptNumber + ' attempts',
          cancelled_at: new Date()
        });

        await inventory.releaseReservedStock(req.params.orderId);
        await notifyReturnInitiated(order);

        return res.json({
          success: false,
          max_attempts: true,
          message: 'Maximum scan attempts reached. Return initiated automatically.',
          attempt: attemptNumber
        });
      }

      return res.json({
        success: false,
        message: validation.message,
        attempt: attemptNumber,
        remaining: MAX_SCAN_ATTEMPTS - attemptNumber
      });
    }

    // Scan successful — update verification flag
    if (scanner_role === 'rider') {
      await ordersDal.setField(req.params.orderId, 'qr_verified_by_rider', true);
    } else {
      await ordersDal.setField(req.params.orderId, 'qr_verified_by_buyer', true);
    }

    const bothVerified = (scanner_role === 'rider' && order.qr_verified_by_buyer) ||
                         (scanner_role === 'buyer' && order.qr_verified_by_rider);

    let deliveryComplete = false;
    if (bothVerified) {
      await ordersDal.updateStatus(req.params.orderId, 'delivered', {
        delivered_at: new Date(),
        buyer_confirmed_at: new Date()
      });

      await inventory.completeDelivery(req.params.orderId, order.total_etb, order.store_id);
      deliveryComplete = true;
      await notifyDeliveryComplete(order);
    }

    res.json({
      success: true,
      message: validation.message,
      verified_by: scanner_role,
      both_verified: bothVerified || deliveryComplete,
      delivery_complete: deliveryComplete,
      product: validation.product,
      price: validation.price,
      attempt: attemptNumber
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/delivery/:orderId/verify-otp
 * Seller/rider verifies the handover via the buyer's 4-digit delivery OTP.
 * Body: { otp, rider_latitude, rider_longitude }
 */
router.post('/:orderId/verify-otp', requireAuth, async (req, res, next) => {
  try {
    const { otp, rider_latitude, rider_longitude } = req.body || {};
    if (!otp) return res.status(400).json({ error: 'otp is required' });

    const result = await ordersDal.getById(req.params.orderId);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = result.rows[0];

    // Only the seller (or their rider operating the seller's side) verifies OTPs
    const { isSeller } = orderParties(order, req.user.tg_user_id);
    if (!isSeller) {
      return res.status(403).json({ error: 'Only the seller can verify the delivery code' });
    }

    if (!order.delivery_otp) {
      return res.status(400).json({ success: false, message: 'No delivery code set for this order' });
    }

    // Brute-force guard: the 4-digit code space (10k) is small, so cap guesses
    if ((order.qr_scan_attempts || 0) >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ success: false, locked: true, message: 'Too many failed attempts. Use QR scan or settle manually.' });
    }

    if (String(otp).trim() !== String(order.delivery_otp)) {
      const attempts = (order.qr_scan_attempts || 0) + 1;
      await ordersDal.setField(req.params.orderId, 'qr_scan_attempts', attempts);
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery code',
        attempt: attempts,
        remaining: Math.max(0, MAX_OTP_ATTEMPTS - attempts)
      });
    }

    const radius = Number(process.env.GEOFENCE_RADIUS_METERS || 200);
    if (!withinRadius(order.delivery_latitude, order.delivery_longitude, rider_latitude, rider_longitude, radius)) {
      return res.status(403).json({
        success: false,
        geofence: true,
        message: `Rider is outside the allowed delivery area. Move within ${radius}m of the buyer to confirm.`
      });
    }

    const alreadyRider = order.qr_verified_by_rider;
    await query(
      `UPDATE orders SET
         qr_verified_by_rider = TRUE,
         rider_latitude = $1,
         rider_longitude = $2,
         updated_at = NOW()
       WHERE order_id = $3`,
      [rider_latitude != null ? Number(rider_latitude) : order.rider_latitude,
       rider_longitude != null ? Number(rider_longitude) : order.rider_longitude,
       req.params.orderId]
    );

    let deliveryComplete = false;
    if (order.qr_verified_by_buyer) {
      await ordersDal.updateStatus(req.params.orderId, 'delivered', {
        delivered_at: new Date(),
        buyer_confirmed_at: new Date()
      });
      await inventory.completeDelivery(req.params.orderId, order.total_etb, order.store_id);
      deliveryComplete = true;
      await notifyDeliveryComplete(order);
    }

    res.json({
      success: true,
      message: 'Delivery code verified',
      rider_verified: true,
      already_verified: alreadyRider,
      delivery_complete: deliveryComplete
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/delivery/:orderId/verify-code
 * Manual fallback when camera scanning is unavailable.
 * Body: { code, scanner_role }
 */
router.post('/:orderId/verify-code', requireAuth, async (req, res, next) => {
  try {
    const { code, scanner_role } = req.body || {};
    if (!code) return res.status(400).json({ success: false, message: 'Delivery code is required' });
    if (!['rider', 'buyer'].includes(scanner_role)) {
      return res.status(400).json({ success: false, message: 'scanner_role must be rider or buyer' });
    }

    const result = await ordersDal.getById(req.params.orderId);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = result.rows[0];

    // Party check (same mapping as /scan)
    const { isBuyer, isSeller } = orderParties(order, req.user.tg_user_id);
    if (scanner_role === 'buyer' && !isBuyer) {
      return res.status(403).json({ success: false, message: 'Only the buyer can confirm the buyer side' });
    }
    if (scanner_role === 'rider' && !isSeller) {
      return res.status(403).json({ success: false, message: 'Only the seller (or their rider) can confirm the rider side' });
    }

    if (order.qr_verified_by_rider && order.qr_verified_by_buyer) {
      return res.json({ success: true, already_confirmed: true, message: 'Delivery already confirmed by both parties' });
    }
    if (!order.delivery_otp) {
      return res.status(400).json({ success: false, message: 'No delivery code set for this order' });
    }

    // Brute-force guard (shared counter with verify-otp)
    if ((order.qr_scan_attempts || 0) >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ success: false, locked: true, message: 'Too many failed attempts. Use QR scan or settle manually.' });
    }

    if (String(code).trim() !== String(order.delivery_otp)) {
      const attempts = (order.qr_scan_attempts || 0) + 1;
      await ordersDal.setField(req.params.orderId, 'qr_scan_attempts', attempts);
      return res.json({
        success: false,
        message: 'Invalid delivery code',
        attempt: attempts,
        remaining: Math.max(0, MAX_OTP_ATTEMPTS - attempts)
      });
    }

    if (scanner_role === 'rider') {
      await ordersDal.setField(req.params.orderId, 'qr_verified_by_rider', true);
    } else {
      await ordersDal.setField(req.params.orderId, 'qr_verified_by_buyer', true);
    }

    const bothVerified = (scanner_role === 'rider' && order.qr_verified_by_buyer) ||
                         (scanner_role === 'buyer' && order.qr_verified_by_rider);

    let deliveryComplete = false;
    if (bothVerified) {
      await ordersDal.updateStatus(req.params.orderId, 'delivered', {
        delivered_at: new Date(),
        buyer_confirmed_at: new Date()
      });
      await inventory.completeDelivery(req.params.orderId, order.total_etb, order.store_id);
      deliveryComplete = true;
      await notifyDeliveryComplete(order);
    }

    res.json({
      success: true,
      verified_by: scanner_role,
      both_verified: bothVerified || deliveryComplete,
      delivery_complete: deliveryComplete,
      message: 'Delivery code verified'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/delivery/:orderId/settle
 * Seller manual settlement (resolves in person without QR)
 */
router.post('/:orderId/settle', requireAuth, async (req, res, next) => {
  try {
    const result = await ordersDal.getById(req.params.orderId);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = result.rows[0];
    if (order.admin_tg_user_id !== req.user.tg_user_id) {
      return res.status(403).json({ error: 'Only the store owner can settle this order' });
    }
    if (order.order_status === 'delivered') {
      return res.json({ message: 'Order already delivered' });
    }
    if (order.order_status !== 'dispatched' && order.order_status !== 'cancelled') {
      return res.status(400).json({ error: 'Can only settle dispatched or return-pending orders' });
    }

    await ordersDal.updateStatus(req.params.orderId, 'delivered', {
      delivered_at: new Date(),
      settled_at: new Date(),
      buyer_confirmed_at: new Date()
    });

    await inventory.completeDelivery(req.params.orderId, order.total_etb, order.store_id);

    try {
      await tg.sendSafeMessage(order.buyer_tg_user_id,
        `✅ *Order Settled*\n\nOrder *${order.order_ref}* has been settled by the seller.\nThank you for your purchase!`);
    } catch (_) {}

    if (order.rider_name) {
      try {
        const riderResult = await query(
          'SELECT tg_user_id FROM users WHERE username = $1 OR first_name = $2',
          [order.rider_name, order.rider_name]
        );
        if (riderResult.rows.length > 0) {
          await tg.sendSafeMessage(riderResult.rows[0].tg_user_id,
            `✅ *Order Settled*\n\nOrder *${order.order_ref}* has been settled by the seller.\nNo return needed.`);
        }
      } catch (_) {}
    }

    try {
      const notif = require('../services/notifications');
      const storeRes = await query('SELECT telebirr_account_name, cbe_account_name FROM stores WHERE store_id = $1', [order.store_id]);
      const method = storeRes.rows[0]
        ? (storeRes.rows[0].telebirr_account_name || storeRes.rows[0].cbe_account_name || 'your payout account')
        : 'your payout account';
      await notif.notifyPayout(order.store_id, order.total_etb, method);
    } catch (_) {}

    res.json({ message: 'Order settled successfully', order_id: order.order_id });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/delivery/:orderId/receipt
 * Get/download PDF receipt for an order (buyer or seller only — receipts
 * contain the buyer's name, phone and delivery address).
 */
router.get('/:orderId/receipt', requireAuth, async (req, res, next) => {
  try {
    const result = await ordersDal.getById(req.params.orderId);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = result.rows[0];
    const { isBuyer, isSeller } = orderParties(order, req.user.tg_user_id);
    if (!isBuyer && !isSeller) return res.status(403).json({ error: 'Not authorized for this order' });

    if (order.receipt_pdf_url) {
      return res.json({ receipt_url: order.receipt_pdf_url, cached: true });
    }

    const buyerResult = await query(
      'SELECT first_name, last_name, username FROM users WHERE tg_user_id = $1',
      [order.buyer_tg_user_id]
    );

    const itemsResult = await query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [req.params.orderId]
    );

    let qrBuffer = null;
    if (order.qr_data) {
      qrBuffer = await qrService.generateQRBuffer(order.qr_data);
    }

    const pdfUrl = await receiptService.generateAndUploadReceipt({
      order,
      items: itemsResult.rows,
      buyer: buyerResult.rows[0] || null,
      store: { store_name: order.store_name, location_sub_city: order.location_sub_city, business_phone: order.business_phone },
      rider: order.rider_name ? { rider_name: order.rider_name, rider_phone: order.rider_phone } : null,
      qrBuffer
    });

    if (pdfUrl && !pdfUrl.startsWith('data:')) {
      await ordersDal.setField(req.params.orderId, 'receipt_pdf_url', pdfUrl);
    }

    res.json({ receipt_url: pdfUrl, cached: false });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/delivery/:orderId/return
 * Initiate return (buyer or seller of this order)
 */
router.post('/:orderId/return', requireAuth, async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    const result = await ordersDal.getById(req.params.orderId);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = result.rows[0];
    const { isBuyer, isSeller } = orderParties(order, req.user.tg_user_id);
    if (!isBuyer && !isSeller) return res.status(403).json({ error: 'Not authorized for this order' });

    if (!['dispatched', 'confirmed'].includes(order.order_status)) {
      return res.status(400).json({ error: 'Order cannot be returned in current status' });
    }

    await ordersDal.updateStatus(req.params.orderId, 'cancelled', {
      return_initiated_at: new Date(),
      return_reason: reason || 'Return initiated',
      cancelled_at: new Date()
    });

    await inventory.releaseReservedStock(req.params.orderId);
    await notifyReturnInitiated(order);

    res.json({ message: 'Return initiated', order_id: order.order_id });
  } catch (err) {
    next(err);
  }
});

async function notifyReturnInitiated(order) {
  try {
    await tg.sendSafeMessage(order.buyer_tg_user_id,
      `❌ *Return Initiated*\n\nOrder *${order.order_ref}* could not be verified.\nA return has been initiated. Your refund will be processed.`);
  } catch (_) {}

  try {
    await tg.sendSafeMessage(order.admin_tg_user_id,
      `📦 *Return Initiated*\n\nOrder *${order.order_ref}* failed verification.\nThe product will be returned to you.\n\nIf resolved in person, click "Settled" in your Seller Studio.`);
  } catch (_) {}
}

async function notifyDeliveryComplete(order) {
  try {
    await tg.sendSafeMessage(order.buyer_tg_user_id,
      `✅ *Delivery Confirmed!*\n\nOrder *${order.order_ref}* has been delivered successfully.\nThank you for shopping with Medebirr!`);
  } catch (_) {}

  try {
    await tg.sendSafeMessage(order.admin_tg_user_id,
      `✅ *Delivery Confirmed!*\n\nOrder *${order.order_ref}* has been delivered and confirmed by both parties.`);
  } catch (_) {}
}

module.exports = router;
