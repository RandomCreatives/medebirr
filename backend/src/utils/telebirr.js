/**
 * Telebirr (Ethio Telecom SuperApp API) signing helpers.
 *
 * Single implementation shared by payment initiation and the webhook handler
 * so the signing scheme can never drift between the two. Verification uses a
 * timing-safe comparison — never `===` on hex strings.
 */

const crypto = require('crypto');

/**
 * Build the sign string: sorted key=value pairs joined with '&', plus the
 * app secret as a trailing `key=` pair.
 * @param {object} payload - payload WITHOUT the `sign` field
 * @param {string} secret  - TELEBIRR_APP_SECRET
 */
function buildSignString(payload, secret) {
  return Object.keys(payload)
    .sort()
    .map(k => `${k}=${payload[k]}`)
    .join('&') + `&key=${secret}`;
}

/**
 * Sign a payload (SHA-256, uppercase hex).
 * @returns {string} the signature to put in `payload.sign`
 */
function sign(payload, secret) {
  return crypto.createHash('sha256').update(buildSignString(payload, secret)).digest('hex').toUpperCase();
}

/**
 * Verify a webhook/initiate payload's `sign` field (timing-safe).
 * Does NOT mutate the input (the old handler did `delete payload.sign`).
 * @param {object} payload - full payload INCLUDING `sign`
 * @returns {boolean}
 */
function verifySignature(payload, secret) {
  if (!payload || typeof payload !== 'object' || !secret) return false;
  const { sign: received, ...rest } = payload;
  if (!received || typeof received !== 'string') return false;
  const expected = sign(rest, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(received.toUpperCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Compare two money amounts with a small epsilon (Telebirr sends strings
 * like "1500.00"; orders store DECIMAL).
 */
function amountsMatch(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (!isFinite(x) || !isFinite(y)) return false;
  return Math.abs(x - y) < 0.01;
}

module.exports = { buildSignString, sign, verifySignature, amountsMatch };
