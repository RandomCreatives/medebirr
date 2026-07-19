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
 * Build QR data payload from order.
 * Embedded, self-contained order info so the QR is meaningful even when
 * scanned by a generic reader (shows buyer, seller, items, date, amount,
 * shop) — and carries a unique verification token `v` per purchase.
 */
function buildQRData(order, buyer, store, token) {
  const items = Array.isArray(order.order_items)
    ? order.order_items
    : (typeof order.order_items === 'string' ? JSON.parse(order.order_items || '[]') : []);
  const itemsSummary = items.length
    ? items.map(i => `${i.quantity || 1}x ${i.title}`).join(', ')
    : (order.title || 'Order');
  const created = order.created_at ? new Date(order.created_at) : new Date();
  const buyerName = buyer ? `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() : 'Buyer';
  return {
    brand: 'MEDEBIRR',
    tagline: 'Your Free Ecommerce',
    oid: order.order_id,
    ref: order.order_ref,
    v: token || order.qr_token || generateToken(),
    t: created.getTime(),
    date: created.toISOString(),
    date_human: created.toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa', dateStyle: 'medium', timeStyle: 'short' }) + ' EAT',
    buyer: buyerName,
    buyer_phone: buyer?.phone || order.buyer_phone || null,
    seller: store?.store_name || order.store_name || 'Store',
    shop: store?.store_name || order.store_name || 'Store',
    items: itemsSummary,
    amount: Number(order.total_etb || 0),
    currency: 'ETB'
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
    message: 'QR code verified successfully',
    details: {
      brand: scanned.brand,
      tagline: scanned.tagline,
      buyer: scanned.buyer,
      buyer_phone: scanned.buyer_phone,
      seller: scanned.seller,
      shop: scanned.shop,
      items: scanned.items,
      amount: scanned.amount,
      currency: scanned.currency,
      date: scanned.date,
      date_human: scanned.date_human
    }
  };
}

module.exports = {
  generateToken,
  buildQRData,
  generateQRBuffer,
  generateQRDataURL,
  validateQRData
};
