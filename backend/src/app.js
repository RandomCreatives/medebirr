/**
 * Shared Express app factory.
 *
 * Both the Vercel entrypoint (api/index.js) and the local dev server
 * (backend/src/server.js) build their app from this single source so the
 * route wiring, CORS, rate limits, and version string can never drift
 * apart. The two entrypoints only differ in: static-file serving / SPA
 * fallback (local), webhook auto-registration (Vercel), and how env vars
 * are loaded.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { requestLogger, logger } = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth');
const storeRoutes = require('./routes/stores');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const userRoutes = require('./routes/users');
const botRoutes = require('./routes/bot');
const reviewRoutes = require('./routes/reviews');
const paymentMethodRoutes = require('./routes/payment-methods');
const couponRoutes = require('./routes/coupons');
const settingsRoutes = require('./routes/settings');
const imageRoutes = require('./routes/images');
const deliveryRoutes = require('./routes/delivery');
const socialRoutes = require('./routes/social');
const pendingProductRoutes = require('./routes/pending-products');
const otpRoutes = require('./routes/otp');
const errorHandler = require('./middleware/errorHandler');

// Single source of truth for the API version (asserted by tests/app.test.js
// and shown in the frontend footer — keep all three in sync).
const APP_VERSION = '1.4.0';

/**
 * Build and return the configured Express app.
 * @param {object} [opts]
 * @param {boolean} [opts.serveStatic=false] - serve public/ statically + SPA fallback (local dev)
 */
function createApp(opts = {}) {
  const { serveStatic = false } = opts;
  const isProd = process.env.NODE_ENV === 'production';

  const app = express();

  // ─── Request ID + Structured Logging ──────────────────────────────────────────
  app.use(requestLogger);

// ─── Security ──────────────────────────────────────────────────────────────
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://telegram.org", "https://unpkg.com", "'unsafe-inline'"],
        styleSrc: ["'self'", "https://unpkg.com", "https://fonts.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "https://api.qrserver.com", "https://*.tile.openstreetmap.org", "https://*.supabase.co", "data:", "blob:"],
        connectSrc: ["'self'", "https://medebirr.vercel.app", "https://*.supabase.co"],
        frameSrc: ["'self'", "https://*.supabase.co", "data:"],
        frameAncestors: ["'self'", "https://telegram.org", "https://*.telegram.org"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    }
  }));

  app.use(cors({
    origin: (origin, callback) => {
      // Requests with no Origin (Telegram WebView, curl, server-to-server)
      // are legitimate for a TMA backend and are allowed.
      if (!origin) return callback(null, true);

      const allowed = [
        process.env.FRONTEND_URL,
        'https://medebirr.vercel.app',
        /\.vercel\.app$/
      ].filter(Boolean);

      if (allowed.some(p => typeof p === 'string' ? origin === p : p.test(origin))) {
        return callback(null, true);
      }

      // Non-allowlisted origins are refused in production. In development
      // (localhost / ngrok / preview) we stay permissive for convenience.
      if (!isProd) return callback(null, true);

      logger.warn({ origin }, 'CORS rejected origin');
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ─── Rate Limiting ──────────────────────────────────────────────────────────
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
  });
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

  app.use('/api/', apiLimiter);
  app.use('/api/v1/auth', authLimiter);

  // Granular rate limiters (H-1)
  const paymentInitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: 'Too many payment attempts, try again later' }, standardHeaders: true, legacyHeaders: false });
  const otpLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 3, message: { error: 'Too many OTP requests, try again later' }, standardHeaders: true, legacyHeaders: false });
  const couponLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: 'Too many coupon attempts, try again later' }, standardHeaders: true, legacyHeaders: false });

  app.use('/api/v1/payments/telebirr/initiate', paymentInitLimiter);
  app.use('/api/v1/payments/confirm-tx', paymentInitLimiter);
  app.use('/api/v1/otp', otpLimiter);
  app.use('/api/v1/coupons/validate', couponLimiter);

  // ─── Static Frontend (local dev only) ───────────────────────────────────────
  if (serveStatic) {
    const path = require('path');
    app.use(express.static(path.join(__dirname, '../../public')));
  }

  // ─── API Routes ─────────────────────────────────────────────────────────────
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/stores', storeRoutes);
  app.use('/api/v1/products', productRoutes);
  app.use('/api/v1/orders', orderRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/users/me/payment-methods', paymentMethodRoutes);
  app.use('/api/v1/users/me/settings', settingsRoutes);
  app.use('/api/v1/bot', botRoutes);
  app.use('/api/v1/reviews', reviewRoutes);
  app.use('/api/v1/coupons', couponRoutes);
  app.use('/api/v1/images', imageRoutes);
  app.use('/api/v1/delivery', deliveryRoutes);
  app.use('/api/v1/pending-products', pendingProductRoutes);
  app.use('/api/v1/social', socialRoutes);
  app.use('/api/v1/otp', otpRoutes);

  // ─── Health ─────────────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => {
    const payload = {
      status: 'ok',
      service: 'e-Merkato API',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'production',
      region: process.env.VERCEL_REGION || 'local'
    };
    // Config internals are only exposed outside production — an open endpoint
    // advertising whether auth-bypass is enabled is an attacker's checklist.
    if (!isProd) {
      payload.dbConfigured = !!process.env.DATABASE_URL;
      payload.bypassAuth = process.env.BYPASS_TELEGRAM_AUTH === 'true';
    }
    res.json(payload);
  });

  app.get('/api/health/db', async (req, res) => {
    try {
      const { query } = require('./db');
      const r = await query('SELECT NOW() AS now, current_database() AS db, version() AS ver');
      res.json({
        ok: true,
        timestamp: r.rows[0].now,
        database: r.rows[0].db,
        version: r.rows[0].ver.split(' ').slice(0, 2).join(' ')
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── API 404 ─────────────────────────────────────────────────────────────────
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  // ─── SPA Catch-all (local dev only) ──────────────────────────────────────────
  if (serveStatic) {
    const path = require('path');
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/index.html'));
    });
  }

  // ─── Global Error Handler ─────────────────────────────────────────────────────
  app.use(errorHandler);

  app.set('version', APP_VERSION);
  return app;
}

module.exports = { createApp, APP_VERSION };
