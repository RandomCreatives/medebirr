/**
 * Receipt PDF Service
 * Generates professional PDF receipts with full order details
 */

const PDFDocument = require('pdfkit');
const { uploadImage } = require('./storage');

/**
 * Generate a PDF receipt for an order
 * @param {Object} params
 * @param {Object} params.order - Order record
 * @param {Array} params.items - Order items
 * @param {Object} params.buyer - Buyer user record
 * @param {Object} params.store - Store record
 * @param {Object} params.rider - Rider info (optional)
 * @param {Buffer} params.qrBuffer - QR code PNG buffer (optional)
 * @returns {Buffer} PDF buffer
 */
async function generateReceiptPDF({ order, items, buyer, store, rider, qrBuffer }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      bufferPages: true,
      info: {
        Title: `Receipt - ${order.order_ref}`,
        Author: 'Medebirr',
        Subject: 'Order Receipt'
      }
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header ──
    doc.fontSize(22).font('Helvetica-Bold').text('MEDEBIRR', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#666666')
       .text('GroupCommerce Marketplace', { align: 'center' });
    doc.moveDown(0.5);

    // Divider
    doc.strokeColor('#FCCD04').lineWidth(2)
       .moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.8);

    // ── Order Reference ──
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000')
       .text(`Order ${order.order_ref}`, { align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor('#888888')
       .text(`Placed: ${new Date(order.created_at).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })}`, { align: 'center' });
    doc.moveDown(1);

    // ── Status Badge ──
    const statusColors = {
      pending: '#F59E0B', confirmed: '#3B82F6', dispatched: '#8B5CF6',
      delivered: '#10B981', cancelled: '#EF4444'
    };
    const status = (order.order_status || 'pending').toUpperCase();
    doc.roundedRect(200, doc.y, 155, 24, 4)
       .fill(statusColors[order.order_status] || '#666666');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF')
       .text(status, 200, doc.y - 18, { width: 155, align: 'center' });
    doc.moveDown(1.5);

    // ── Product Items ──
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
       .text('Products');
    doc.moveDown(0.3);

    const itemRows = (items || []).map(item => [
      item.title || 'Item',
      `x${item.quantity || 1}`,
      `Br ${Number(item.subtotal_etb || item.price_etb || 0).toLocaleString()}`
    ]);

    // Table header
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#888888');
    doc.text('ITEM', 40, doc.y, { width: 280 });
    doc.text('QTY', 320, doc.y, { width: 60 });
    doc.text('AMOUNT', 480, doc.y, { width: 80, align: 'right' });
    doc.moveDown(0.3);
    doc.strokeColor('#E5E7EB').lineWidth(0.5)
       .moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.3);

    // Item rows
    doc.fontSize(9).font('Helvetica').fillColor('#333333');
    for (const row of itemRows) {
      doc.text(row[0], 40, doc.y, { width: 280 });
      doc.text(row[1], 320, doc.y, { width: 60 });
      doc.text(row[2], 480, doc.y, { width: 80, align: 'right' });
      doc.moveDown(0.4);
    }
    doc.moveDown(0.5);

    // ── Totals ──
    doc.strokeColor('#E5E7EB').lineWidth(0.5)
       .moveTo(350, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.3);

    const addLine = (label, value, bold = false) => {
      doc.fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#333333');
      doc.text(label, 370, doc.y, { width: 130 });
      doc.text(value, 500, doc.y, { width: 55, align: 'right' });
      doc.moveDown(0.3);
    };

    addLine('Subtotal', `Br ${Number(order.subtotal_etb || 0).toLocaleString()}`);
    addLine('Delivery Fee', `Br ${Number(order.delivery_fee_etb || 0).toLocaleString()}`);
    doc.strokeColor('#FCCD04').lineWidth(1)
       .moveTo(370, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.2);
    addLine('TOTAL', `Br ${Number(order.total_etb || 0).toLocaleString()}`, true);
    doc.moveDown(0.8);

    // ── Payment Info ──
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Payment');
    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica').fillColor('#333333');
    doc.text(`Method: ${(order.payment_method || 'cash').toUpperCase()}`);
    doc.text(`Status: ${(order.payment_status || 'pending').toUpperCase()}`);
    if (order.transaction_code) doc.text(`Transaction Code: ${order.transaction_code}`);
    else if (order.payment_tx_ref) doc.text(`Transaction: ${order.payment_tx_ref}`);
    const deliveryMethod = order.delivery_method === 'pickup' ? 'Collect from Store' : 'Delivery to Address';
    doc.text(`Delivery: ${deliveryMethod}`);
    doc.moveDown(0.8);

    // ── Buyer Info ──
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Buyer');
    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica').fillColor('#333333');
    doc.text(`Name: ${buyer?.first_name || ''} ${buyer?.last_name || ''}`.trim());
    if (buyer?.username) doc.text(`Username: @${buyer.username}`);
    const addr = typeof order.delivery_address === 'string'
      ? JSON.parse(order.delivery_address) : (order.delivery_address || {});
    if (addr.phone) doc.text(`Phone: ${addr.phone}`);
    const addrStr = [addr.sub_city, addr.woreda, addr.house_number, addr.landmark].filter(Boolean).join(', ');
    if (addrStr) doc.text(`Address: ${addrStr}`);
    doc.moveDown(0.8);

    // ── Seller Info ──
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Seller');
    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica').fillColor('#333333');
    doc.text(`Store: ${store?.store_name || 'N/A'}`);
    if (store?.location_sub_city) doc.text(`Location: ${store.location_sub_city}`);
    if (store?.business_phone) doc.text(`Phone: ${store.business_phone}`);
    doc.moveDown(0.8);

    // ── Rider Info ──
    if (rider?.rider_name) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Delivery Rider');
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').fillColor('#333333');
      doc.text(`Name: ${rider.rider_name}`);
      doc.text(`Phone: ${rider.rider_phone || 'N/A'}`);
      doc.moveDown(0.8);
    }

    // ── QR Code ──
    if (qrBuffer) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
         .text('Scan to Verify Delivery', { align: 'center' });
      doc.moveDown(0.3);
      doc.image(qrBuffer, 220, doc.y, { width: 120, height: 120 });
      doc.moveDown(1);
    }

    // ── Footer ──
    doc.strokeColor('#FCCD04').lineWidth(2)
       .moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').fillColor('#999999')
       .text('This receipt was generated by Medebirr (medebirr.vercel.app)', { align: 'center' })
       .text('For support, contact us via Telegram @medebirrbot', { align: 'center' });

    doc.end();
  });
}

/**
 * Generate and upload receipt PDF to Supabase Storage
 * @returns {string} Public URL of the uploaded PDF
 */
async function generateAndUploadReceipt({ order, items, buyer, store, rider, qrBuffer }) {
  const pdfBuffer = await generateReceiptPDF({ order, items, buyer, store, rider, qrBuffer });
  const filePath = `receipts/${order.order_id}/${Date.now()}.pdf`;
  const url = await uploadImage(pdfBuffer, filePath, 'application/pdf');
  return url;
}

module.exports = { generateReceiptPDF, generateAndUploadReceipt };
