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
        const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.orderId]);
        for (const item of items.rows) {
          await query(
            'UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - $1) WHERE product_id = $2',
            [item.quantity, item.product_id]
          );
        }

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

      // Update store stats
      await query(
        `UPDATE stores SET
          total_orders = total_orders + 1,
          total_revenue = total_revenue + $1,
          updated_at = NOW()
         WHERE store_id = $2`,
        [order.total_etb, order.store_id]
      );

      // Update product order counts
      const orderItems = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.orderId]);
      for (const item of orderItems.rows) {
        await query(
          'UPDATE products SET order_count = order_count + $1, stock_quantity = GREATEST(0, stock_quantity - $1) WHERE product_id = $2',
          [item.quantity, item.product_id]
        );
      }

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

    // Update store stats
    await query(
      `UPDATE stores SET
        total_orders = total_orders + 1,
        total_revenue = total_revenue + $1,
        updated_at = NOW()
       WHERE store_id = $2`,
      [order.total_etb, order.store_id]
    );

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

    // Cache the PDF URL
    await query('UPDATE orders SET receipt_pdf_url = $1 WHERE order_id = $2', [pdfUrl, req.params.orderId]);

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
    const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.orderId]);
    for (const item of items.rows) {
      await query(
        'UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - $1) WHERE product_id = $2',
        [item.quantity, item.product_id]
      );
    }

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
