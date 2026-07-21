# Production Audit Report — e-Merkato (Medebirr)

**Date:** 2026-07-16  
**Verdict:** ⚠️ **NOT PRODUCTION-READY** — Critical gaps must be fixed before deploying to real users.

---

## 🔴 CRITICAL (Must Fix Before Launch)

| # | Issue | Location | Risk |
|---|-------|----------|------|
| 1 | **No `JWT_SECRET` validation at startup** — only warns, doesn't exit | `api/index.js:47` | Auth completely broken in prod; tokens unverifyable |
| 2 | **No `DATABASE_URL` hard failure** — only warns | `api/index.js:50` | App starts but all DB queries crash |
| 3 | **`TELEGRAM_BOT_TOKEN` not required** — only warns | `api/index.js:53` | Bot features silently fail (webhooks, broadcasts, payments) |
| 4 | **`TELEGRAM_WEBHOOK_SECRET` not required** — only warns | `api/index.js:56` | **Anyone can send fake webhook updates** — spoof payments, orders, bot commands |
| 5 | **Payment webhook signature verification disabled in non-prod** | `payments.js:202` | Dev/preview deployments accept unsigned Telebirr callbacks |
| 6 | **SUPABASE_SERVICE_ROLE_KEY not validated** | `storage.js:21` | Image uploads fail silently; no clear error to seller |
| 7 | **Telebirr secrets (`TELEBIRR_APP_ID`, `TELEBIRR_APP_SECRET`) not validated** | `payments.js:118,137` | Real payments fail with cryptic errors |

---

## 🟠 HIGH (Fix Before Launch)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 8 | **CORS is permissive in production** — allows all origins when Telegram sends no `Origin` | `api/index.js:83` | CSRF risk if browser credentials exposed |
| 9 | **Rate limiting uses in-memory store** — per-instance only | `api/index.js:97` | No global rate limiting on Vercel (each lambda isolated) |
| 10 | **No request body size limit on webhooks** | `bot.js:153`, `payments.js:188` | Large payloads can OOM lambda |
| 11 | **QR/Receipt generation sync in webhook handler** | `payments.js:252` | Webhook timeout risk (Telegram/Telebirr expect <5s) |
| 12 | **OCR runs synchronously in bot webhook** | `bot.js:764` | Tesseract.js is slow; will timeout webhook |
| 13 | **No health check for Supabase Storage** | `api/index.js:139` | Storage failures detected only at upload time |
| 14 | **`bcryptjs` and `redis` in deps but unused** | `package.json` | Supply chain risk; remove or use |
| 15 | **No structured logging / correlation IDs** | All routes | Debugging distributed requests impossible |

---

## 🟡 MEDIUM (Fix Soon After Launch)

| # | Issue | Location |
|---|-------|----------|
| 16 | **Cache-busting version numbers manual** — easy to forget | `public/index.html:11-131` |
| 17 | **No API versioning strategy** — `/api/v1/` hardcoded | `api/index.js:110` |
| 18 | **PDF receipt fallback returns data URL** — consumers must handle | `receipt.js:253` |
| 19 | **Inline SQL in routes** — no query builder / repository layer | All `routes/*.js` |
| 20 | **No integration tests in CI** — only 28 unit tests | `package.json:11` |
| 21 | **Seller password uses `crypto.scryptSync` (sync)** — blocks event loop | `stores.js:116` |
| 22 | **No idempotency keys on payment initiation** | `payments.js:112` |
| 23 | **Telegram file download has no size limit** | `telegram.js:297` |
| 24 | **Webhook `setWebhook` auto-registers on every cold start** | `api/index.js:167` | Rate limit risk with Telegram |

---

## 🟢 LOW / NICE TO HAVE

| # | Issue |
|---|-------|
| 25 | README is stale (wrong paths, Chapa docs, missing routes) |
| 26 | No OpenAPI/Swagger spec |
| 27 | No request validation middleware (only per-route `express-validator`) |
| 28 | `morgan` logs to stdout — no structured log aggregation |
| 29 | No feature flags / gradual rollout mechanism |
| 30 | Frontend has no CSP headers (Vercel serves static files) |

---

## 🔧 REQUIRED ENV VARS FOR PRODUCTION

```bash
# MUST BE SET (app will fail without these)
JWT_SECRET="64-char-random-hex-string"
DATABASE_URL="postgresql://postgres:...@db.xxx.supabase.co:5432/postgres"
TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."          # @BotFather token
TELEGRAM_WEBHOOK_SECRET="random-32-char-string" # For webhook auth
SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."       # Service role, NOT anon key

# PAYMENTS (Telebirr — required for real transactions)
TELEBIRR_APP_ID="your_app_id"
TELEBIRR_APP_SECRET="your_app_secret"
TELEBIRR_BASE_URL="https://196.188.120.3:38443/ammapi/payment/service-openup"

# OPTIONAL but recommended
APP_URL="https://medebirr.vercel.app"
FRONTEND_URL="https://medebirr.vercel.app"
TELEGRAM_BOT_USERNAME="medebirrbot"
SCRAPER_BOT_TOKEN="..."        # For DM-based product creation
SEARCH_BOT_TOKEN="..."         # For inline search
REDIS_URL="redis://..."        # If adding global rate limiting later
```

---

## ✅ QUICK WINS (Do These First)

1. **Hard-fail startup on missing critical env vars** — update `api/index.js:47-58`
2. **Require `TELEGRAM_WEBHOOK_SECRET` in production** — reject webhooks without it
3. **Move QR/receipt generation to async queue** (or at least `setImmediate` after webhook ACK)
4. **Add `express-rate-limit` Redis store** (when Redis provisioned)
5. **Bump cache-bust versions** in `public/index.html` before every deploy
6. **Remove unused deps**: `bcryptjs`, `redis` from `package.json`
7. **Add `helmet.contentSecurityPolicy`** for frontend (via Vercel headers or middleware)

---

## 📋 PRE-DEPLOY CHECKLIST

```
[ ] All REQUIRED env vars set in Vercel project settings
[ ] Supabase project region matches Vercel deployment region (for pgbouncer) OR use direct URL
[ ] Run migrations: `node backend/src/db/run_migration.js` (uses pooler)
[ ] Seed demo data: `node backend/src/db/seed.js`
[ ] Bump all `?v=N` in public/index.html
[ ] Test webhook endpoints with ngrok + Telegram CLI
[ ] Verify Telebirr sandbox credentials work end-to-end
[ ] Load test: 100 concurrent checkouts (check connection pool)
[ ] Verify PDF receipt generates + uploads to Supabase Storage
[ ] Confirm bot webhook secret validation works (curl with/without header)
```

---

## Summary

**Core business logic is solid** — cart partitioning, policy snapshots, Telegram auth, payment verification flow are well-designed. **Operational hardening is missing**: startup validation, webhook security, async processing, observability. Fix the 7 CRITICAL items and you're launch-ready.