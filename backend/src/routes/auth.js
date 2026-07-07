const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { verifyTelegramInitData } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

/**
 * POST /api/v1/auth/telegram
 * Authenticate via Telegram WebApp initData
 */
router.post(
  '/telegram',
  [body('initData').notEmpty().withMessage('initData is required')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ error: 'Validation failed', errors: errors.array() });
      }

      const { initData } = req.body;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      // In development/demo mode, allow mock initData
      let verification;
      if (process.env.NODE_ENV !== 'production' && initData.startsWith('mock:')) {
        const mockUserId = parseInt(initData.replace('mock:', ''), 10);
        verification = {
          valid: true,
          user: {
            id: mockUserId || 12893412,
            first_name: 'Mike',
            last_name: 'Fikadu',
            username: 'Mike_Fikadu',
            language_code: 'en'
          }
        };
      } else {
        verification = verifyTelegramInitData(initData, botToken);
      }

      if (!verification.valid) {
        return res.status(401).json({ error: 'Invalid Telegram authentication', detail: verification.error });
      }

      const tgUser = verification.user;
      if (!tgUser || !tgUser.id) {
        return res.status(401).json({ error: 'No user data in initData' });
      }

      // Upsert user in database
      const result = await query(
        `INSERT INTO users (tg_user_id, first_name, last_name, username, language_code)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tg_user_id) DO UPDATE SET
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           username = EXCLUDED.username,
           language_code = EXCLUDED.language_code,
           updated_at = NOW()
         RETURNING *`,
        [tgUser.id, tgUser.first_name, tgUser.last_name || null, tgUser.username || null, tgUser.language_code || 'en']
      );

      const user = result.rows[0];

      // Check if user is a seller (has a store)
      const storeResult = await query(
        'SELECT store_id, store_name, store_slug, status, verified_badge FROM stores WHERE admin_tg_user_id = $1',
        [user.tg_user_id]
      );

      const token = jwt.sign(
        { tg_user_id: user.tg_user_id, user_id: user.user_id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        status: 'authenticated',
        token,
        user: {
          userId: user.user_id,
          tgUserId: user.tg_user_id,
          firstName: user.first_name,
          lastName: user.last_name,
          username: user.username,
          tier: user.tier,
          walletPoints: user.wallet_points,
          isSeller: storeResult.rows.length > 0,
          stores: storeResult.rows
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    const result = await query('SELECT * FROM users WHERE tg_user_id = $1 AND is_active = TRUE', [decoded.tg_user_id]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });

    const newToken = jwt.sign(
      { tg_user_id: decoded.tg_user_id, user_id: decoded.user_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({ token: newToken });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
