# AGENTS.md — e-Merkato

Compact repo guidance for OpenCode. Only non-obvious, verified facts.

## Deploy & Entrypoints
- **Deploy = push to `main`** on `RandomCreatives/medebirr`. Vercel auto-deploys. There is no separate deploy command.
- **Vercel entry: `api/index.js`** — it assembles the Express app from `backend/src/routes/*` and must NOT call `app.listen()` (Vercel owns the lifecycle). Register new route files here.
- `NODE_ENV` is forced to `production` only when `VERCEL_ENV === 'production'` (real prod). Preview deploys keep dev/mock behavior.
- Frontend is the **`public/`** directory (vanilla JS SPA). The README's `frontend/` path is stale — trust the code, not the README.

## Critical Gotchas
- **Cache busting is mandatory.** Every static JS/CSS reference in `public/index.html` uses a `?v=N` query param. Vercel serves these with immutable caching, so **any change to JS/CSS must bump `?v=`** or stale code is served forever. This has caused "ghost" bugs before.
- **Chapa is removed** from the codebase (no references). Only Telebirr / cash / payment-method flows remain. The README still documents Chapa — ignore it.
- **`bcryptjs` and `redis` are in `package.json` deps but UNUSED.** Password hashing uses Node built-in `crypto.scryptSync` with format `salt:hexHash`. Do not import bcryptjs/redis.
- **README is stale** (wrong dir layout, removed features, missing routes like bot/reviews/coupons/delivery/pending-products). Verify against code + `api/index.js`.

## Auth
- Telegram `initData` HMAC-SHA256 verified in `backend/src/middleware/auth.js`.
- Mock auth works when `NODE_ENV !== 'production'`. In production, real verification is required; `BYPASS_TELEGRAM_AUTH=true` is forbidden in prod (startup warns).
- Demo user switch in browser: `localStorage.setItem('em_demo_user', '98760002')`.

## Database
- Runtime pool (`backend/src/db/index.js`) uses `DATABASE_URL` (Vercel-injected). Region-specific Supabase pooler; some varchar=uuid type inference quirks exist.
- **Migrations:** `node backend/src/db/migrate.js` needs `SUPABASE_DB_URL` (DIRECT connection, port 5432). pgbouncer transaction mode cannot run DDL.
- **From the dev machine the direct host does not resolve.** Use `backend/src/db/run_migration.js`, which targets the pooler `aws-0-eu-central-1.pooler.supabase.com:6543`.
- Dev env loader reads `backend/.env` (`backend/.env.example` is the template). Supabase project: `yklkuxujuzthhijeovie`.

## Tests
- `npm test` (root) → `node backend/src/tests/logic.test.js` — **28 unit tests**, no DB needed. Run this after changes.
- `backend/src/tests/integration.test.js` is NOT part of the default script and requires a live DB (skips some pooler-related cases). Don't rely on it.

## Services / Receipts
- `backend/src/services/receipt.js` generates PDFs via pdfkit. Supabase Storage upload can fail → it returns a `data:application/pdf;base64,...` data-URL fallback. Never assume `receipt_pdf_url` is a hosted URL; consumers (delivery.js, payments.js) must handle data URLs.

## Stack Note
- The app is **vanilla JS**, not React. Suggestions proposing React hooks (e.g. `useTelegram`) must be adapted to plain modules under `public/js/`.
