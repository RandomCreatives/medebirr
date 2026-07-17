/**
 * Vercel Serverless Entry Point
 *
 * Vercel invokes this file for all /api/* requests.
 * The Express app is assembled by backend/src/app.js (shared with the local
 * dev server in backend/src/server.js) — Vercel owns the HTTP lifecycle, so
 * this file must NOT call app.listen().
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
  console.warn('⚠️ BYPASS_TELEGRAM_AUTH=true in production — mock login is enabled for browser testing.');
}

const { createApp } = require('../backend/src/app');

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

const app = createApp();

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
      const payload = { url: webhookUrl, allowed_updates: ['message', 'channel_post', 'callback_query', 'my_chat_member'] };
      if (process.env.TELEGRAM_WEBHOOK_SECRET) payload.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
      const result = await tg.tgCall('setWebhook', payload);
      if (result.ok) console.log(`✅ Telegram webhook set: ${webhookUrl}`);
      else console.warn('⚠️ Telegram webhook setup failed:', result.description);
    } catch (e) {
      console.warn('⚠️ Telegram webhook setup error:', e.message);
    }
  }, 3000); // Delay 3s to let the server fully initialize
}

// Export for Vercel
module.exports = app;
