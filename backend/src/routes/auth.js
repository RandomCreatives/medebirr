const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { verifyTelegramInitData } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

/**
 * POST /api/v1/auth/telegram
 * Authenticate via Telegram WebApp initData
 *
 * Supports three initData forms:
 *   1. Real Telegram WebApp initData (verified with HMAC-SHA256 against BOT_TOKEN).
 *   2. `mock:<tg_user_id>` — only allowed in non-production OR when
 *      BYPASS_TELEGRAM_AUTH=true (set this temporarily on Vercel to test in a
 *      normal browser outside Telegram). NEVER leave it enabled in real prod.
 *   3. `devlogin:<tg_user_id>` — alias for (2), requires BYPASS_TELEGRAM_AUTH=true
 *      or NODE_ENV !== 'production'.
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

      // Allow mock/devlogin initData only in non-production
      // BYPASS_TELEGRAM_AUTH is intentionally ignored in production — if you
      // need to test in a browser, deploy to a preview deployment (NODE_ENV
      // won't be 'production' on Vercel previews).
      const bypassEnabled = process.env.NODE_ENV !== 'production' || process.env.BYPASS_TELEGRAM_AUTH === 'true';

      let verification;
      if (initData.startsWith('mock:') || initData.startsWith('devlogin:')) {
        if (!bypassEnabled) {
          return res.status(401).json({
            error: 'Mock authentication is disabled in production',
            hint: 'Open inside Telegram, or deploy to a preview environment to test in a browser.'
          });
        }
        const prefix = initData.startsWith('mock:') ? 'mock:' : 'devlogin:';
        const mockUserId = parseInt(initData.replace(prefix, ''), 10);
        // Fetch the existing seeded user so the upsert preserves their demo identity
        const existing = await query(
          'SELECT * FROM users WHERE tg_user_id = $1 LIMIT 1',
          [mockUserId || 12893412]
        );
        if (existing.rows.length > 0) {
          const u = existing.rows[0];
          verification = {
            valid: true,
            user: {
              id: u.tg_user_id,
              first_name: u.first_name,
              last_name: u.last_name || '',
              username: u.username || '',
              language_code: u.language_code || 'en'
            }
          };
        } else {
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
        }
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

module.exports = router;
