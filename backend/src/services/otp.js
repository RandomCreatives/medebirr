const crypto = require('crypto');
const { query } = require('../db');
const tg = require('./telegram');

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 min
const MAX_SENDS_PER_WINDOW = 3;

function generateCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, OTP_LENGTH);
}

/**
 * Check rate limit: max 3 send attempts per phone per 5 min window
 */
async function checkRateLimit(phone) {
  const result = await query(
    `SELECT COUNT(*) AS count FROM verification_codes
     WHERE phone = $1 AND created_at > NOW() - INTERVAL '5 minutes'`,
    [phone]
  );
  return parseInt(result.rows[0].count) < MAX_SENDS_PER_WINDOW;
}

/**
 * Send OTP to user's Telegram chat and store in DB
 */
async function sendOtp(tgUserId, phone) {
  const allowed = await checkRateLimit(phone);
  if (!allowed) {
    return { success: false, error: 'Too many requests. Try again in 5 minutes.' };
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate any previous unused codes for this phone+user
  await query(
    `UPDATE verification_codes SET used = TRUE
     WHERE tg_user_id = $1 AND phone = $2 AND used = FALSE`,
    [tgUserId, phone]
  );

  // Store new code
  await query(
    `INSERT INTO verification_codes (tg_user_id, phone, code, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tgUserId, phone, code, expiresAt]
  );

  // Send via Telegram bot
  const text = `🔐 *Medebirr Verification*\n\nYour code: \`${code}\`\n\nEnter this code in the app to verify your phone number. It expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you didn't request this, ignore this message.`;

  try {
    await tg.tgCall('sendMessage', {
      chat_id: tgUserId,
      text,
      parse_mode: 'Markdown'
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to send via Telegram. Make sure you started @medebirrbot.' };
  }
}

/**
 * Verify OTP code for a phone number.
 *
 * Attempt counting looks up the latest ACTIVE code for (user, phone) —
 * NOT the code value itself. (The old query matched on `code = $3`, so a
 * wrong guess never touched a row and `attempts` could never increment,
 * leaving the 16.7M-code space brute-forceable except by rate limit.)
 */
async function verifyOtp(tgUserId, phone, code) {
  if (!code || code.length !== OTP_LENGTH) {
    return { success: false, error: 'Invalid code format' };
  }

  const result = await query(
    `SELECT id, code, attempts FROM verification_codes
     WHERE tg_user_id = $1 AND phone = $2
       AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [tgUserId, phone]
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Invalid or expired code' };
  }

  const row = result.rows[0];
  if (row.attempts >= MAX_ATTEMPTS) {
    await query('UPDATE verification_codes SET used = TRUE WHERE id = $1', [row.id]);
    return { success: false, error: 'Too many failed attempts. Request a new code.' };
  }

  if (row.code !== String(code).toUpperCase()) {
    // Wrong guess — burn one of the MAX_ATTEMPTS tries
    await query('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      await query('UPDATE verification_codes SET used = TRUE WHERE id = $1', [row.id]);
      return { success: false, error: 'Too many failed attempts. Request a new code.' };
    }
    return { success: false, error: `Invalid code. ${MAX_ATTEMPTS - row.attempts - 1} attempt(s) left.` };
  }

  // Mark code as used and update user
  await query('UPDATE verification_codes SET used = TRUE WHERE id = $1', [row.id]);
  await query('UPDATE users SET phone_verified = TRUE, phone = $1 WHERE tg_user_id = $2', [phone, tgUserId]);

  return { success: true };
}

module.exports = { sendOtp, verifyOtp, generateCode };