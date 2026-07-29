const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { validatePhone } = require('../utils/validation');
const { sendOtp, verifyOtp } = require('../services/otp');

const router = express.Router();

/**
 * POST /api/v1/otp/send
 * Send verification code to user's Telegram
 */
router.post(
  '/send',
  requireAuth,
  [body('phone').notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const phoneResult = validatePhone(req.body.phone);
      if (!phoneResult.valid) return res.status(422).json({ errors: [{ field: 'phone', message: phoneResult.error }] });

      const result = await sendOtp(req.user.tg_user_id, phoneResult.normalized);
      if (!result.success) return res.status(429).json({ error: result.error });

      res.json({ message: 'Verification code sent to your Telegram' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/otp/verify
 * Verify code and mark phone as verified
 */
router.post(
  '/verify',
  requireAuth,
  [
    body('phone').notEmpty(),
    body('code').notEmpty().isLength({ min: 6, max: 6 })
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      const phoneResult = validatePhone(req.body.phone);
      if (!phoneResult.valid) return res.status(422).json({ errors: [{ field: 'phone', message: phoneResult.error }] });

      const result = await verifyOtp(req.user.tg_user_id, phoneResult.normalized, req.body.code);
      if (!result.success) return res.status(400).json({ error: result.error });

      res.json({ message: 'Phone verified successfully', phone_verified: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;