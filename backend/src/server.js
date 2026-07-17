require('dotenv').config();

// ─── Validate required env vars at startup ──────────────────────────────────
const validateEnv = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const missing = [];
  const warnings = [];

  const required = [
    'JWT_SECRET',
    'DATABASE_URL',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
    'TELEBIRR_APP_ID',
    'TELEBIRR_APP_SECRET'
  ];

  for (const v of required) {
    if (!process.env[v]) {
      if (isProd) missing.push(v);
      else warnings.push(v);
    }
  }

  if (warnings.length > 0) {
    console.warn(`⚠️ WARNING: Missing development environment variables: ${warnings.join(', ')}`);
  }
  if (missing.length > 0) {
    console.error(`❌ FATAL: Missing critical production environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
};
validateEnv();

// Safety: warn if bypass auth is set in production
if (process.env.NODE_ENV === 'production' && process.env.BYPASS_TELEGRAM_AUTH === 'true') {
  console.warn('⚠️ BYPASS_TELEGRAM_AUTH=true in production — mock login is enabled for browser testing.');
}

const { createApp } = require('./app');

const app = createApp({ serveStatic: true });
const PORT = process.env.PORT || 3000;

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
