/**
 * Vercel Serverless Entry Point
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { query } = require('../backend/src/db');

const authRoutes = require('../backend/src/routes/auth');
const storeRoutes = require('../backend/src/routes/stores');
const productRoutes = require('../backend/src/routes/products');
const orderRoutes = require('../backend/src/routes/orders');
const paymentRoutes = require('../backend/src/routes/payments');
const userRoutes = require('../backend/src/routes/users');
const errorHandler = require('../backend/src/middleware/errorHandler');

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL,
      /\.vercel\.app$/,
      /^http:\/\/localhost/
    ].filter(Boolean);
    if (!origin || allowed.some(p => typeof p === 'string' ? origin === p : p.test(origin))) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/stores', storeRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/users', userRoutes);

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

// ─── DB Health Check ─────────────────────────────────────────────────────────
app.get('/api/health/db', async (req, res) => {
  try {
    const dbRes = await query('SELECT version(), current_database() as db');
    res.json({
      ok: true,
      database: dbRes.rows[0].db,
      timestamp: new Date().toISOString(),
      version: dbRes.rows[0].version
    });
  } catch (err) {
    console.error('DB Health Check Failure:', err.message);
    res.status(503).json({
      ok: false,
      error: err.message,
      hint: 'Check if your DATABASE_URL is correct and has the right credentials/region.'
    });
  }
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

app.use(errorHandler);

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`e-Merkato API running on http://localhost:${PORT}`));
}

module.exports = app;
