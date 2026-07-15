/**
 * OCR Service (MVP — Tesseract.js, no external key)
 *
 * Reads a payment screenshot (Telebirr / CBE) and extracts the transaction
 * reference + amount. This is BEST-EFFORT: Ethiopian SMS/receipt formats vary,
 * so the result only *assists* the seller's manual confirmation — it never
 * auto-marks an order paid on its own.
 */

const Tesseract = require('tesseract.js');

// Transaction-reference patterns seen on Ethiopian receipts.
const TX_PATTERNS = [
  /\b(FT\d{6,})\b/i,                                  // CBE: FT26194204812
  /\b(TBX[-\d]{6,})\b/i,                              // Telebirr: TBX-891204-...
  /\b(TXN[-\d]{6,})\b/i,
  /\b(TID\s*[:#]?\s*[A-Z0-9\-]{5,})\b/i,
  /(?:transaction(?:\s*(?:id|ref|no|number))?|ref(?:\s*erence)?|tid)\s*[:#]?\s*([A-Z0-9\-]{5,})/i
];

// Amount patterns: "Br 1,500", "1500 ETB", "1,500.00 Birr"
const AMOUNT_PATTERNS = [
  /(?:br|etb|birr)\s*[:]?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:br|etb|birr)/i
];

function parseReceipt(text) {
  const safe = text || '';
  let tx_ref = null;
  for (const re of TX_PATTERNS) {
    const m = safe.match(re);
    if (m) { tx_ref = (m[1] || m[0]).trim(); break; }
  }
  let amount = null;
  for (const re of AMOUNT_PATTERNS) {
    const m = safe.match(re);
    if (m) { amount = Number(String(m[1]).replace(/,/g, '')); break; }
  }
  return { tx_ref, amount, text: safe };
}

/**
 * Run OCR on an image buffer.
 * @param {Buffer} buffer - image bytes
 * @returns {Promise<{tx_ref:string|null, amount:number|null, text:string, error?:string}>}
 */
async function recognize(buffer) {
  try {
    const { data } = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
    return parseReceipt(data.text);
  } catch (e) {
    console.warn('OCR failed:', e.message);
    return { tx_ref: null, amount: null, text: '', error: e.message };
  }
}

module.exports = { recognize, parseReceipt };
