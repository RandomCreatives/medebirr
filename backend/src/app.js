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
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

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
const errorHandler = require('./middleware/errorHandler');

const APP_VERSION = '1.3.0';

/**
 * Build and return the configured Express app.
 * @param {object} [opts]
 * @param {boolean} [opts.serveStatic=false] - serve public/ statically + SPA fallback (local dev)
 */
function createApp(opts = {}) {
  const { serveStatic = false } = opts;
  const isProd = process.env.NODE_ENV === 'production';

  const app = express();

  // ─── Security ──────────────────────────────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

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

      console.warn(`CORS rejected origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  }));

  app.use(morgan(isProd ? 'combined' : 'dev'));
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

  // ─── Health ─────────────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'e-Merkato API',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'production',
      region: process.env.VERCEL_REGION || 'local',
      dbConfigured: !!process.env.DATABASE_URL,
      bypassAuth: process.env.BYPASS_TELEGRAM_AUTH === 'true'
    });
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
