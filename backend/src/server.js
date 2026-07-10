require('dotenv').config();

// Safety: warn if bypass auth is set in production
if (process.env.NODE_ENV === 'production' && process.env.BYPASS_TELEGRAM_AUTH === 'true') {
  console.warn('⚠️ BYPASS_TELEGRAM_AUTH=true in production — mock login is enabled for browser testing.');
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Route imports
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
const deliveryRoutes = require('./routes/delivery');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & Middleware ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for TMA compatibility
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL]
    : true, // Allow all origins in development
  credentials: true
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many auth attempts' }
});

app.use('/api/', apiLimiter);
app.use('/api/v1/auth', authLimiter);

// ─── Static Frontend ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../../public')));

// ─── API Routes ───────────────────────────────────────────────────────────────
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
app.use('/api/v1/delivery', deliveryRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'e-Merkato API',
    version: '1.2.2',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// ─── API 404 ──────────────────────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// ─── SPA Catch-all (serve frontend for all non-API routes) ────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║       e-Merkato API Server                       ║
║       Ethiopia's Telegram Marketplace            ║
╠══════════════════════════════════════════════════╣
║  Port    : ${PORT}                                   ║
║  Mode    : ${(process.env.NODE_ENV || 'development').padEnd(12)}                    ║
║  API     : http://localhost:${PORT}/api/v1           ║
║  Health  : http://localhost:${PORT}/api/health       ║
╚══════════════════════════════════════════════════╝
  `);
});

module.exports = app;
