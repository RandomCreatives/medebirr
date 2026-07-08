/**
 * Vercel Serverless Entry Point
 *
 * Vercel invokes this file for all /api/* requests.
 * Dependencies are resolved from the root package.json.
 * The Express app is assembled here without app.listen() —
 * Vercel manages the HTTP lifecycle.
 */

// Load .env for local development only — Vercel injects env vars directly
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });
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

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'e-Merkato API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'production',
    region: process.env.VERCEL_REGION || 'local'
  });
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

// Export for Vercel
module.exports = app;
