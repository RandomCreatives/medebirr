const crypto = require('crypto');

/**
 * Generate a cryptographically random numeric OTP.
 * @param {number} digits - number of digits (default 4)
 * @returns {string} zero-padded OTP, e.g. "8492"
 */
function generateOTP(digits = 4) {
  const max = Math.pow(10, digits);
  return crypto.randomInt(0, max).toString().padStart(digits, '0');
}

module.exports = { generateOTP };
