/**
 * Vercel Serverless Entry Point
 *
 * Vercel invokes this file for all /api/* requests.
 * Dependencies are resolved from the root package.json.
 * The Express app is assembled here without app.listen() —
 * Vercel manages the HTTP lifecycle.
 */

// Load .env for local development only — Vercel injects env vars directly
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });
}

// Vercel sets VERCEL_ENV=production for production deploys, 'preview' for previews
// Only force production for real production deployments (previews need mock auth)
if (process.env.VERCEL_ENV === 'production') process.env.NODE_ENV = 'production';

// ─── Safety: refuse to start if bypass auth is accidentally set in production ──
if (process.env.NODE_ENV === 'production' && process.env.BYPASS_TELEGRAM_AUTH === 'true') {
  console.error('❌ CRITICAL: BYPASS_TELEGRAM_AUTH=true is set in production. This bypasses Telegram authentication and opens the app to anyone. Remove this env var from your production deployment.');
  process.env.BYPASS_TELEGRAM_AUTH = 'false';
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('../backend/src/routes/auth');
const storeRoutes = require('../backend/src/routes/stores');
const productRoutes = require('../backend/src/routes/products');
const orderRoutes = require('../backend/src/routes/orders');
const paymentRoutes = require('../backend/src/routes/payments');
const userRoutes = require('../backend/src/routes/users');
const botRoutes = require('../backend/src/routes/bot');
const reviewRoutes = require('../backend/src/routes/reviews');
const paymentMethodRoutes = require('../backend/src/routes/payment-methods');
const couponRoutes = require('../backend/src/routes/coupons');
const settingsRoutes = require('../backend/src/routes/settings');
const errorHandler = require('../backend/src/middleware/errorHandler');

const app = express();

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(cors({
  origin: (origin, callback) => {
    // Allow Vercel preview URLs, custom domain, and local dev
    const allowed = [
      process.env.FRONTEND_URL,
      /\.vercel\.app$/,
      /^http:\/\/localhost/
    ].filter(Boolean);
    if (!origin || allowed.some(p => typeof p === 'string' ? origin === p : p.test(origin))) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive for TMA — Telegram WebView needs this
    }
  },
  credentials: true
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Memory store is fine for serverless — each instance is isolated, providing
// per-instance rate limits rather than global. For global rate limiting at scale,
// replace with a Redis store using process.env.REDIS_URL.
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

// ─── Routes ───────────────────────────────────────────────────────────────────
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

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'e-Merkato API',
    version: '1.0.3',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'production',
    region: process.env.VERCEL_REGION || 'local',
    dbConfigured: !!process.env.DATABASE_URL,
    bypassAuth: process.env.BYPASS_TELEGRAM_AUTH === 'true'
  });
});

app.get('/api/health/db', async (req, res, next) => {
  try {
    const { query } = require('../backend/src/db');
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

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

app.use(errorHandler);

// ─── Local dev only: start HTTP server when run directly ─────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`e-Merkato API running on http://localhost:${PORT}`));
}

// ─── Auto-register Telegram webhook on startup (production only) ─────────────
if (process.env.VERCEL && process.env.TELEGRAM_BOT_TOKEN && process.env.APP_URL) {
  setTimeout(async () => {
    try {
      const tg = require('../backend/src/services/telegram');
      const webhookUrl = `${process.env.APP_URL}/api/v1/bot/webhook`;
      const result = await tg.tgCall('setWebhook', { url: webhookUrl, allowed_updates: ['message', 'channel_post', 'my_chat_member'] });
      if (result.ok) console.log(`✅ Telegram webhook set: ${webhookUrl}`);
      else console.warn('⚠️ Telegram webhook setup failed:', result.description);
    } catch (e) {
      console.warn('⚠️ Telegram webhook setup error:', e.message);
    }
  }, 3000); // Delay 3s to let the server fully initialize
}

// Export for Vercel
module.exports = app;
