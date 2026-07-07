const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

/**
 * Verify Telegram WebApp initData HMAC-SHA256 signature
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyTelegramInitData(initData, botToken) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return { valid: false, error: 'Missing hash' };

    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return { valid: false, error: 'Hash mismatch' };
    }

    // Check auth_date is not older than 24 hours
    const authDate = parseInt(urlParams.get('auth_date'), 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return { valid: false, error: 'initData expired' };
    }

    // Parse user object
    const userStr = urlParams.get('user');
    const user = userStr ? JSON.parse(decodeURIComponent(userStr)) : null;

    return { valid: true, user, queryId: urlParams.get('query_id') };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Middleware: Require valid JWT
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user data
    const result = await query(
      'SELECT * FROM users WHERE tg_user_id = $1 AND is_active = TRUE',
      [decoded.tg_user_id]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found or deactivated' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    next(err);
  }
};

/**
 * Middleware: Require verified seller role for a specific store
 */
const requireSellerOf = (paramName = 'storeId') => async (req, res, next) => {
  try {
    const storeId = req.params[paramName] || req.body.store_id;
    if (!storeId) return res.status(400).json({ error: 'Store ID required' });

    const result = await query(
      'SELECT * FROM stores WHERE store_id = $1 AND admin_tg_user_id = $2',
      [storeId, req.user.tg_user_id]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized for this store' });
    }
    req.store = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { verifyTelegramInitData, requireAuth, requireSellerOf };
