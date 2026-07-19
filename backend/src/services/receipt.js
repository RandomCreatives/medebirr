/**
 * Receipt PDF Service
 * Generates clean, professional PDF receipts
 */

const PDFDocument = require('pdfkit');
const { uploadImage } = require('./storage');

/**
 * Generate a PDF receipt for an order
 * Layout: Header → Order Info → Buyer/Seller (2-col) → Payment → Items Table → Totals → QR → Footer
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

    const W = 515; // usable width (595 - 40*2)
    const LEFT = 40;

    // ── Header bar ──
    doc.rect(0, 0, 595, 72).fill('#111216');
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#FCCD04')
       .text('MEDEBIRR', LEFT, 22, { width: 300 });
    doc.fontSize(9).font('Helvetica').fillColor('#9DA3AE')
       .text('Ethiopia\'s Telegram Marketplace', LEFT, 46, { width: 300 });

    // Order ref + date (right side of header)
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#FCCD04')
       .text(order.order_ref, LEFT, 18, { width: W, align: 'right' });
    const orderDate = new Date(order.created_at).toLocaleString('en-ET', {
      timeZone: 'Africa/Addis_Ababa', dateStyle: 'medium', timeStyle: 'short'
    });
    doc.fontSize(9).font('Helvetica').fillColor('#9DA3AE')
       .text(orderDate + ' EAT', LEFT, 40, { width: W, align: 'right' });

    let y = 88;

    // ── Status badge ──
    const statusColors = {
      pending: '#F59E0B', confirmed: '#3B82F6', dispatched: '#8B5CF6',
      delivered: '#10B981', cancelled: '#EF4444'
    };
    const statusText = (order.order_status || 'pending').toUpperCase();
    const statusColor = statusColors[order.order_status] || '#666666';
    const statusW = doc.widthOfString(statusText) + 24;
    const statusX = LEFT + (W - statusW) / 2;
    doc.roundedRect(statusX, y, statusW, 20, 4).fill(statusColor);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF')
       .text(statusText, statusX, y + 5, { width: statusW, align: 'center' });
    y += 34;

    // ── Two-column: Buyer | Seller ──
    const colW = (W - 20) / 2;
    const col1X = LEFT;
    const col2X = LEFT + colW + 20;

    // Buyer box
    doc.roundedRect(col1X, y, colW, 80, 4).fill('#F8F9FA');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#999999')
       .text('BUYER', col1X + 12, y + 10);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111111')
       .text(`${buyer?.first_name || ''} ${buyer?.last_name || ''}`.trim() || 'N/A', col1X + 12, y + 24, { width: colW - 24 });
    doc.fontSize(9).font('Helvetica').fillColor('#555555');
    let buyerY = y + 40;
    const addr = typeof order.delivery_address === 'string'
      ? JSON.parse(order.delivery_address) : (order.delivery_address || {});
    if (buyer?.username) { doc.text(`@${buyer.username}`, col1X + 12, buyerY, { width: colW - 24 }); buyerY += 13; }
    if (addr.phone) { doc.text(addr.phone, col1X + 12, buyerY, { width: colW - 24 }); buyerY += 13; }
    const addrStr = [addr.sub_city, addr.woreda, addr.house_number, addr.landmark].filter(Boolean).join(', ');
    if (addrStr) { doc.text(addrStr, col1X + 12, buyerY, { width: colW - 24 }); }

    // Seller box
    doc.roundedRect(col2X, y, colW, 80, 4).fill('#F8F9FA');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#999999')
       .text('SELLER', col2X + 12, y + 10);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111111')
       .text(store?.store_name || 'N/A', col2X + 12, y + 24, { width: colW - 24 });
    doc.fontSize(9).font('Helvetica').fillColor('#555555');
    let sellerY = y + 40;
    if (store?.location_sub_city) { doc.text(store.location_sub_city + ', Addis Ababa', col2X + 12, sellerY, { width: colW - 24 }); sellerY += 13; }
    if (store?.business_phone) { doc.text(store.business_phone, col2X + 12, sellerY, { width: colW - 24 }); sellerY += 13; }
    const deliveryMethod = order.delivery_method === 'pickup' ? 'Store Pickup' : 'Home Delivery';
    doc.text(deliveryMethod, col2X + 12, sellerY, { width: colW - 24 });

    y += 94;

    // ── Payment info bar ──
    doc.roundedRect(LEFT, y, W, 36, 4).fill('#111216');
    const payMethod = (order.payment_method || 'cash').toUpperCase();
    const payStatus = (order.payment_status || 'pending').toUpperCase();
    const txCode = order.transaction_code || order.payment_tx_ref || '';
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#FCCD04')
       .text(`PAYMENT: ${payMethod}`, LEFT + 14, y + 11, { width: 180 });
    doc.fontSize(9).font('Helvetica-Bold')
       .text(payStatus, LEFT + 200, y + 11, { width: 100 });
    if (txCode) {
      doc.fontSize(8).font('Helvetica').fillColor('#9DA3AE')
         .text(`TX: ${txCode}`, LEFT + 320, y + 13, { width: 195, align: 'right' });
    }
    y += 50;

    // ── Payment proof (OCR'd screenshot) ──
    let proof = order.payment_proof;
    if (typeof proof === 'string') { try { proof = JSON.parse(proof); } catch (_) { proof = null; } }
    if (proof && (proof.tx_ref || proof.amount)) {
      doc.roundedRect(LEFT, y, W, 30, 4).fill('#ECFDF5');
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#065F46')
        .text('PAYMENT PROOF · verified from screenshot', LEFT + 12, y + 7);
      const proofParts = [];
      if (proof.tx_ref) proofParts.push(`TX: ${proof.tx_ref}`);
      if (proof.amount) proofParts.push(`Br ${Number(proof.amount).toLocaleString()}`);
      if (proofParts.length) {
        doc.fontSize(8).font('Helvetica').fillColor('#065F46')
          .text(proofParts.join('   ·   '), LEFT + 12, y + 18, { width: W - 24 });
      }
      y += 38;
    }

    // ── Items table ──
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111')
       .text('Order Items', LEFT, y);
    y += 18;

    // Table header
    doc.rect(LEFT, y, W, 22).fill('#F3F4F6');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#666666');
    doc.text('ITEM', LEFT + 10, y + 6, { width: 250 });
    doc.text('QTY', LEFT + 270, y + 6, { width: 50, align: 'center' });
    doc.text('UNIT PRICE', LEFT + 330, y + 6, { width: 80, align: 'right' });
    doc.text('TOTAL', LEFT + 430, y + 6, { width: 75, align: 'right' });
    y += 26;

    // Item rows
    for (let i = 0; i < (items || []).length; i++) {
      const item = items[i];
      const rowBg = i % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
      doc.rect(LEFT, y, W, 28).fill(rowBg);
      doc.fontSize(9).font('Helvetica').fillColor('#111111');
      doc.text(item.title || 'Item', LEFT + 10, y + 7, { width: 250 });
      doc.text(`x${item.quantity || 1}`, LEFT + 270, y + 7, { width: 50, align: 'center' });
      doc.fontSize(9).fillColor('#666666')
         .text(`Br ${Number(item.price_etb || 0).toLocaleString()}`, LEFT + 330, y + 7, { width: 80, align: 'right' });
      doc.font('Helvetica-Bold').fillColor('#111111')
         .text(`Br ${Number(item.subtotal_etb || 0).toLocaleString()}`, LEFT + 430, y + 7, { width: 75, align: 'right' });
      y += 28;
    }

    // ── Totals ──
    y += 8;
    const totX = LEFT + 300;
    const totW = W - 300;

    doc.strokeColor('#E5E7EB').lineWidth(0.5)
       .moveTo(totX, y).lineTo(LEFT + W, y).stroke();
    y += 8;

    const totLine = (label, value, bold = false) => {
      doc.fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor(bold ? '#111111' : '#666666')
         .text(label, totX, y, { width: totW - 80 });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor(bold ? '#D97706' : '#111111')
         .text(value, totX + totW - 80, y, { width: 80, align: 'right' });
      y += 18;
    };

    totLine('Subtotal', `Br ${Number(order.subtotal_etb || 0).toLocaleString()}`);
    totLine('Delivery Fee', `Br ${Number(order.delivery_fee_etb || 0).toLocaleString()}`);

    doc.strokeColor('#FCCD04').lineWidth(1.5)
       .moveTo(totX, y).lineTo(LEFT + W, y).stroke();
    y += 6;
    totLine('TOTAL', `Br ${Number(order.total_etb || 0).toLocaleString()}`, true);
    y += 8;

    // ── Rider info (if assigned) ──
    if (rider?.rider_name) {
      doc.roundedRect(LEFT, y, W, 40, 4).fill('#F5F3FF');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#7C3AED')
         .text('DELIVERY RIDER', LEFT + 12, y + 8);
      doc.fontSize(9).font('Helvetica').fillColor('#333333')
         .text(`${rider.rider_name}  ·  ${rider.rider_phone || 'N/A'}`, LEFT + 12, y + 22, { width: W - 24 });
      y += 50;
    }

    // ── QR Code ──
    if (qrBuffer) {
      y += 4;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#111111')
         .text('Scan to Verify Delivery', LEFT, y, { width: W, align: 'center' });
      y += 16;
      const qrSize = 100;
      const qrX = LEFT + (W - qrSize) / 2;
      doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
      y += qrSize + 8;
      doc.fontSize(7).font('Helvetica').fillColor('#777777')
         .text('Contains buyer, seller, items, amount & date · MEDEBIRR', LEFT, y, { width: W, align: 'center' });
      y += 14;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#FCCD04')
         .text('MEDEBIRR — Your Free Ecommerce', LEFT, y, { width: W, align: 'center' });
      y += 16;
    }

    // ── Return policy ──
    const policyLabels = {
      '7_day_free': '7-Day Free Return', '3_day_warranty': '3-Day Warranty',
      'size_exchange': 'Size Exchange', 'fresh_guarantee': 'Freshness Guarantee',
      'no_return': 'No Returns'
    };
    const policy = typeof order.policy_snapshot === 'string'
      ? JSON.parse(order.policy_snapshot) : (order.policy_snapshot || {});
    const policyText = policyLabels[policy?.return_policy_type] || 'Store Policy';

    if (policy?.return_policy_type && policy?.return_policy_type !== 'no_return') {
      doc.roundedRect(LEFT, y, W, 32, 4).fill('#F0FDF4');
      doc.fontSize(8).font('Helvetica').fillColor('#166534')
         .text(`${policyText}: ${policy.custom_policy_text || 'See store for details.'}`, LEFT + 12, y + 10, { width: W - 24 });
      y += 40;
    }

    // ── Footer ──
    y = Math.max(y, 760);
    doc.strokeColor('#E5E7EB').lineWidth(0.5)
       .moveTo(LEFT, y).lineTo(LEFT + W, y).stroke();
    y += 10;
    doc.fontSize(7).font('Helvetica').fillColor('#AAAAAA')
       .text('Generated by Medebirr (medebirr.vercel.app) · For support: @medebirrbot', LEFT, y, { width: W, align: 'center' });

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
  try {
    const url = await uploadImage(pdfBuffer, filePath, 'application/pdf');
    return url;
  } catch (uploadErr) {
    console.warn('Receipt storage upload failed, using inline data URL:', uploadErr.message);
    return `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
  }
}

module.exports = { generateReceiptPDF, generateAndUploadReceipt };
