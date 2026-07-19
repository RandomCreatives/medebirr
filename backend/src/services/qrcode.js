/**
 * QR Code Service
 * Generates QR codes with embedded order data for delivery verification
 */

const QRCode = require('qrcode');
const crypto = require('crypto');

/**
 * Generate a verification token for order integrity
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Build QR data payload from order
 * Contains embedded order info — works offline, no URL resolution needed
 */
function buildQRData(order, buyer, store, token) {
  return {
    oid: order.order_id,
    ref: order.order_ref,
    p: order.order_items?.[0]?.title || order.title || 'Order',
    pr: Number(order.total_etb),
    b: buyer ? `${buyer.first_name} ${buyer.last_name || ''}`.trim() : 'Buyer',
    s: store?.store_name || 'Store',
    t: Date.now(),
    v: token || order.qr_token || generateToken()
  };
}

/**
 * Generate QR code as PNG buffer from order data
 * @param {Object} order - Order with qr_data
 * @returns {Buffer} PNG buffer
 */
async function generateQRBuffer(qrData) {
  const payload = JSON.stringify(qrData);
  const buffer = await QRCode.toBuffer(payload, {
    type: 'png',
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    },
    errorCorrectionLevel: 'M'
  });
  return buffer;
}

/**
 * Generate QR code as data URL (for inline display in frontend)
 * @param {Object} qrData - The QR data object
 * @returns {string} data:image/png;base64,...
 */
async function generateQRDataURL(qrData) {
  const payload = JSON.stringify(qrData);
  return QRCode.toDataURL(payload, {
    width: 300,
    margin: 2,
    errorCorrectionLevel: 'M'
  });
}

/**
 * Validate scanned QR data against stored order
 * @param {Object} scanned - Decoded QR data from scan
 * @param {Object} order - Order from database
 * @returns {Object} { valid, orderRef, message }
 */
function validateQRData(scanned, order) {
  if (!scanned || !scanned.oid || !scanned.v) {
    return { valid: false, message: 'Invalid QR code data' };
  }

  if (scanned.oid !== order.order_id) {
    return { valid: false, message: 'QR code does not match this order' };
  }

  if (scanned.v !== order.qr_token) {
    return { valid: false, message: 'QR verification failed — possible tampering' };
  }

  if (scanned.ref !== order.order_ref) {
    return { valid: false, message: 'Order reference mismatch' };
  }

  return {
    valid: true,
    orderRef: scanned.ref,
    product: scanned.p,
    price: scanned.pr,
    buyer: scanned.b,
    seller: scanned.s,
    message: 'QR code verified successfully'
  };
}

module.exports = {
  generateToken,
  buildQRData,
  generateQRBuffer,
  generateQRDataURL,
  validateQRData
};
