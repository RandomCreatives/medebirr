/**
 * Delivery Verification routes
 * QR code display, scanning, dual-confirmation, return, settlement
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db');
const tg = require('../services/telegram');
const qrService = require('../services/qrcode');
const receiptService = require('../services/receipt');
const { withinRadius } = require('../utils/geo');
const inventory = require('../services/inventory');

const router = express.Router();

const MAX_SCAN_ATTEMPTS = 5;

/**
 * GET /api/v1/delivery/:orderId/qr
 * Get QR code data URL for an order (buyer or rider)
 */
router.get('/:orderId/qr', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT o.*, s.store_name
       FROM orders o
       JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1`,
      [req.params.orderId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = result.rows[0];
    if (!order.qr_data) {
      return res.status(400).json({ error: 'QR code not yet generated for this order' });
    }

    const qrUrl = await qrService.generateQRDataURL(order.qr_data);
    res.json({
      qr_url: qrUrl,
      qr_data: order.qr_data,
      order_ref: order.order_ref,
      verified_by_rider: order.qr_verified_by_rider,
      verified_by_buyer: order.qr_verified_by_buyer,
      scan_attempts: order.qr_scan_attempts
    });
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

    const result = await query(
      `SELECT o.*, s.store_name, s.admin_tg_user_id
       FROM orders o
       JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1`,
      [req.params.orderId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = result.rows[0];

    // Check if already fully verified
    if (order.qr_verified_by_rider && order.qr_verified_by_buyer) {
      return res.json({ success: true, message: 'Delivery already confirmed by both parties', already_confirmed: true });
    }

    // Validate QR data
    const validation = qrService.validateQRData(scanned_data, order);
    const attemptNumber = (order.qr_scan_attempts || 0) + 1;

    // Log the verification attempt
    await query(
      `INSERT INTO delivery_verifications
       (order_id, scanner_role, scanner_tg_id, scanned_role, scanned_order_ref, success, attempt_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.params.orderId, scanner_role, req.user.tg_user_id,
       scanner_role === 'rider' ? 'buyer' : 'rider',
       validation.orderRef || null, validation.valid, attemptNumber]
    );

    // Update attempt count
    await query(
      'UPDATE orders SET qr_scan_attempts = $1 WHERE order_id = $2',
      [attemptNumber, req.params.orderId]
    );

    if (!validation.valid) {
      // Check if max attempts exceeded
      if (attemptNumber >= MAX_SCAN_ATTEMPTS) {
        // Auto-initiate return
        await query(
          `UPDATE orders SET
            order_status = 'cancelled',
            return_initiated_at = NOW(),
            return_reason = 'QR verification failed after ' || $1 || ' attempts',
            cancelled_at = NOW(),
            updated_at = NOW()
           WHERE order_id = $2`,
          [attemptNumber, req.params.orderId]
        );

        // Release reserved stock
        await inventory.releaseReservedStock(req.params.orderId);

        // Notify all parties
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
      await query('UPDATE orders SET qr_verified_by_rider = TRUE, updated_at = NOW() WHERE order_id = $1', [req.params.orderId]);
    } else {
      await query('UPDATE orders SET qr_verified_by_buyer = TRUE, updated_at = NOW() WHERE order_id = $1', [req.params.orderId]);
    }

    // Check if both have now verified
    const bothVerified = (scanner_role === 'rider' && order.qr_verified_by_buyer) ||
                         (scanner_role === 'buyer' && order.qr_verified_by_rider);

    let deliveryComplete = false;
    if (bothVerified) {
      // Both parties confirmed — complete delivery
      await query(
        `UPDATE orders SET
          order_status = 'delivered',
          delivered_at = NOW(),
          buyer_confirmed_at = NOW(),
          updated_at = NOW()
         WHERE order_id = $1`,
        [req.params.orderId]
      );

      await inventory.completeDelivery(req.params.orderId, order.total_etb, order.store_id);

      deliveryComplete = true;

      // Send delivery confirmation to all parties
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
 * Rider verifies the handover via the buyer's 4-digit delivery OTP.
 * Optional geofence: if both the buyer's pinned location and the rider's
 * current location are present, the OTP is rejected when the rider is
 * outside GEOFENCE_RADIUS_METERS (default 200m).
 * Body: { otp, rider_latitude, rider_longitude }
 */
router.post('/:orderId/verify-otp', requireAuth, async (req, res, next) => {
  try {
    const { otp, rider_latitude, rider_longitude } = req.body || {};
    if (!otp) return res.status(400).json({ error: 'otp is required' });

    const result = await query(
      `SELECT o.*, s.admin_tg_user_id, s.store_name
       FROM orders o JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1`,
      [req.params.orderId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = result.rows[0];

    if (!order.delivery_otp) {
      return res.status(400).json({ success: false, message: 'No delivery code set for this order' });
    }
    if (String(otp).trim() !== String(order.delivery_otp)) {
      return res.status(400).json({ success: false, message: 'Invalid delivery code' });
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
      await query(
        `UPDATE orders SET
           order_status = 'delivered',
           delivered_at = NOW(),
           buyer_confirmed_at = NOW(),
           updated_at = NOW()
         WHERE order_id = $1`,
        [req.params.orderId]
      );
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
 * Manual fallback when camera scanning is unavailable (no camera permission,
 * weak light, etc). The scanning party enters the order's 4-digit delivery
 * code shown on the other party's QR screen. Records the matching
 * verification flag for the scanner role — symmetric to QR scanning.
 * Body: { code, scanner_role }
 */
router.post('/:orderId/verify-code', requireAuth, async (req, res, next) => {
  try {
    const { code, scanner_role } = req.body || {};
    if (!code) return res.status(400).json({ success: false, message: 'Delivery code is required' });
    if (!['rider', 'buyer'].includes(scanner_role)) {
      return res.status(400).json({ success: false, message: 'scanner_role must be rider or buyer' });
    }

    const result = await query(
      `SELECT o.*, s.store_name, s.admin_tg_user_id
       FROM orders o JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1`,
      [req.params.orderId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = result.rows[0];

    if (order.qr_verified_by_rider && order.qr_verified_by_buyer) {
      return res.json({ success: true, already_confirmed: true, message: 'Delivery already confirmed by both parties' });
    }
    if (!order.delivery_otp) {
      return res.status(400).json({ success: false, message: 'No delivery code set for this order' });
    }
    if (String(code).trim() !== String(order.delivery_otp)) {
      const attempts = (order.qr_scan_attempts || 0) + 1;
      await query('UPDATE orders SET qr_scan_attempts = $1 WHERE order_id = $2', [attempts, req.params.orderId]);
      return res.json({
        success: false,
        message: 'Invalid delivery code',
        attempt: attempts,
        remaining: Math.max(0, 5 - attempts)
      });
    }

    if (scanner_role === 'rider') {
      await query('UPDATE orders SET qr_verified_by_rider = TRUE, updated_at = NOW() WHERE order_id = $1', [req.params.orderId]);
    } else {
      await query('UPDATE orders SET qr_verified_by_buyer = TRUE, updated_at = NOW() WHERE order_id = $1', [req.params.orderId]);
    }

    const bothVerified = (scanner_role === 'rider' && order.qr_verified_by_buyer) ||
                         (scanner_role === 'buyer' && order.qr_verified_by_rider);

    let deliveryComplete = false;
    if (bothVerified) {
      await query(
        `UPDATE orders SET order_status = 'delivered', delivered_at = NOW(),
         buyer_confirmed_at = NOW(), updated_at = NOW() WHERE order_id = $1`,
        [req.params.orderId]
      );
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
    const result = await query(
      `SELECT o.*, s.admin_tg_user_id
       FROM orders o
       JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1`,
      [req.params.orderId]
    );
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

    // Mark as delivered via settlement
    await query(
      `UPDATE orders SET
        order_status = 'delivered',
        delivered_at = NOW(),
        settled_at = NOW(),
        buyer_confirmed_at = NOW(),
        updated_at = NOW()
       WHERE order_id = $1`,
      [req.params.orderId]
    );

    // Update store stats + release reserved stock + update order counts
    await inventory.completeDelivery(req.params.orderId, order.total_etb, order.store_id);

    // Notify buyer
    try {
      await tg.tgCall('sendMessage', {
        chat_id: order.buyer_tg_user_id,
        text: `✅ *Order Settled*\n\nOrder *${order.order_ref}* has been settled by the seller.\nThank you for your purchase!`,
        parse_mode: 'MarkdownV2'
      });
    } catch (_) {}

    // Notify rider if assigned
    if (order.rider_name) {
      try {
        const riderResult = await query(
          'SELECT tg_user_id FROM users WHERE username = $1 OR first_name = $2',
          [order.rider_name, order.rider_name]
        );
        if (riderResult.rows.length > 0) {
          await tg.tgCall('sendMessage', {
            chat_id: riderResult.rows[0].tg_user_id,
            text: `✅ *Order Settled*\n\nOrder *${order.order_ref}* has been settled by the seller.\nNo return needed.`,
            parse_mode: 'MarkdownV2'
          });
        }
      } catch (_) {}
    }

    // Notify seller of the payout (funds released on settlement)
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
 * Get/download PDF receipt for an order
 */
router.get('/:orderId/receipt', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT o.*, s.store_name, s.location_sub_city, s.business_phone,
              s.admin_tg_user_id, s.verification_tier
       FROM orders o
       JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1`,
      [req.params.orderId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = result.rows[0];

    // Return cached PDF if available
    if (order.receipt_pdf_url) {
      return res.json({ receipt_url: order.receipt_pdf_url, cached: true });
    }

    // Get buyer info
    const buyerResult = await query(
      'SELECT first_name, last_name, username FROM users WHERE tg_user_id = $1',
      [order.buyer_tg_user_id]
    );

    // Get order items
    const itemsResult = await query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [req.params.orderId]
    );

    // Generate QR buffer
    let qrBuffer = null;
    if (order.qr_data) {
      qrBuffer = await qrService.generateQRBuffer(order.qr_data);
    }

    // Generate PDF
    const pdfUrl = await receiptService.generateAndUploadReceipt({
      order,
      items: itemsResult.rows,
      buyer: buyerResult.rows[0] || null,
      store: { store_name: order.store_name, location_sub_city: order.location_sub_city, business_phone: order.business_phone },
      rider: order.rider_name ? { rider_name: order.rider_name, rider_phone: order.rider_phone } : null,
      qrBuffer
    });

    // Cache Supabase URLs (skip huge data URLs)
    if (pdfUrl && !pdfUrl.startsWith('data:')) {
      await query('UPDATE orders SET receipt_pdf_url = $1 WHERE order_id = $2', [pdfUrl, req.params.orderId]);
    }

    res.json({ receipt_url: pdfUrl, cached: false });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/delivery/:orderId/return
 * Initiate return (manual or triggered by system)
 */
router.post('/:orderId/return', requireAuth, async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    const result = await query(
      `SELECT o.*, s.admin_tg_user_id, s.store_name
       FROM orders o
       JOIN stores s ON o.store_id = s.store_id
       WHERE o.order_id = $1`,
      [req.params.orderId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = result.rows[0];
    if (!['dispatched', 'confirmed'].includes(order.order_status)) {
      return res.status(400).json({ error: 'Order cannot be returned in current status' });
    }

    // Mark as returned/cancelled
    await query(
      `UPDATE orders SET
        order_status = 'cancelled',
        return_initiated_at = NOW(),
        return_reason = $1,
        cancelled_at = NOW(),
        updated_at = NOW()
       WHERE order_id = $2`,
      [reason || 'Return initiated', req.params.orderId]
    );

    // Release reserved stock
    await inventory.releaseReservedStock(req.params.orderId);

    // Notify parties
    await notifyReturnInitiated(order);

    res.json({ message: 'Return initiated', order_id: order.order_id });
  } catch (err) {
    next(err);
  }
});

/**
 * Notify all parties when return is initiated
 */
async function notifyReturnInitiated(order) {
  // Notify buyer
  try {
    await tg.tgCall('sendMessage', {
      chat_id: order.buyer_tg_user_id,
      text: `❌ *Return Initiated*\n\nOrder *${order.order_ref}* could not be verified.\nA return has been initiated. Your refund will be processed.`,
      parse_mode: 'MarkdownV2'
    });
  } catch (_) {}

  // Notify seller
  try {
    await tg.tgCall('sendMessage', {
      chat_id: order.admin_tg_user_id,
      text: `📦 *Return Initiated*\n\nOrder *${order.order_ref}* failed verification.\nThe product will be returned to you.\n\nIf resolved in person, click "Settled" in your Seller Studio.`,
      parse_mode: 'MarkdownV2'
    });
  } catch (_) {}
}

/**
 * Notify all parties when delivery is complete
 */
async function notifyDeliveryComplete(order) {
  // Notify buyer
  try {
    await tg.tgCall('sendMessage', {
      chat_id: order.buyer_tg_user_id,
      text: `✅ *Delivery Confirmed!*\n\nOrder *${order.order_ref}* has been delivered successfully.\nThank you for shopping with Medebirr!`,
      parse_mode: 'MarkdownV2'
    });
  } catch (_) {}

  // Notify seller
  try {
    await tg.tgCall('sendMessage', {
      chat_id: order.admin_tg_user_id,
      text: `✅ *Delivery Confirmed!*\n\nOrder *${order.order_ref}* has been delivered and confirmed by both parties.`,
      parse_mode: 'MarkdownV2'
    });
  } catch (_) {}
}

module.exports = router;
