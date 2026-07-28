require('dotenv').config();

const { logger } = require('./utils/logger');

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
    logger.warn({ missing: warnings }, 'Missing development environment variables');
  }
  if (missing.length > 0) {
    logger.fatal({ missing }, 'Missing critical production environment variables');
    process.exit(1);
  }
};
validateEnv();

// Safety: warn if bypass auth is set in production
if (process.env.NODE_ENV === 'production' && process.env.BYPASS_TELEGRAM_AUTH === 'true') {
  logger.warn('BYPASS_TELEGRAM_AUTH=true in production — mock login is enabled for browser testing.');
}

const { createApp } = require('./app');

const app = createApp({ serveStatic: true });
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info({ port: PORT, mode: process.env.NODE_ENV || 'development' }, 'e-Merkato API server started');
});

module.exports = app;
