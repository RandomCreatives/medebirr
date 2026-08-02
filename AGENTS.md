# e-Merkato / Medebirr — Agent Context

## Project
Ethiopian marketplace (vanilla-JS SPA + Express backend).  
Version `1.4.0`, cache-bust via `?v=` with git SHA.  
**549** `State.t()` keys now resolve across the app (`node scripts/validate-i18n.js`).

## Active Objective
Translate the app into **Amharic** with context-aware (not literal) translations.  
~380 user-facing strings now migrated to `State.t('key', vars)` (all buyer + checkout + seller nav/dashboard/inventory/dispatch/settings wrapped).  
Amharic column empty — awaiting translator input.

---

## i18n Architecture

| File | Purpose |
|------|---------|
| `gen_i18n.js` | **Master catalog** — 1029 keys, verbatim English, `add(cat, key, en, context, tech)` calls. Run `node gen_i18n.js` to regenerate CSV + locale files. |
| `i18n_terms.csv` | Spreadsheet you edit (fill **Amharic** column). Key columns: `Key, English, Category, Context, Amharic, Technical` |
| `public/js/i18n/en.js` | Auto-generated canonical English locale |
| `public/js/i18n/am.js` | Auto-generated Amharic locale (empty until CSV is filled) |
| `public/js/i18n/i18n.js` | Loader — `window.I18n.t(key, vars)` with English fallback + nested-`${var}` interpolation |
| `scripts/gen-i18n-csv.js` | **Delta generator** — scans code for `State.t('key')`, emits only keys missing/empty in `am.js`. Run `node scripts/gen-i18n-csv.js` → `i18n_terms_delta.csv` |

### Workflow
1. Translate: fill Amharic column in `i18n_terms.csv` (or the smaller `i18n_terms_delta.csv`)
2. Import: `node gen_i18n.js` → rewrites `en.js` + `am.js` from CSV
3. Test: switch language in-app (Profile → Settings → Language)
4. New words later: add `State.t('new.key')` in code → `node scripts/gen-i18n-csv.js` → translate delta → repeat

### Key rules
- `Technical=Yes` rows stay untranslated (Medebirr, Telebirr, CBE, QR, ETB, Afaan Oromoo, etc.)
- Interpolation supports nested paths: `State.t('checkout.title', { pkg: { shopName: 'X' } })` resolves `${pkg.shopName}`
- Strings with embedded JS logic (`State.formatETB(…)`, ternaries) are left in English for now

---

## Migration Status

| Area | Keys | Migrated | Notes |
|------|------|----------|-------|
| Buyer (explore, profile, orders, coupons, address, payment, settings, notifications, help, privacy, cart, wishlist) | ~160 | ✅ | buyer.js fully migrated |
| Checkout (steps 1-3, review, confirm, receipt) | ~72 | ✅ | checkout.js fully migrated |
| Delivery / QR / scan / manual-code / assign / receipt | ~48 | ✅ | modals.js delivery sections migrated |
| Nav bars (buyer bottom tabs + seller nav) | ~8 | ✅ | app.js migrated |
| Seller dashboard / inventory / dispatch / settings / register | ~220 | ✅ | Seller views wrapped (dashboard, pending, inventory, dispatch, settings nav) |
| Auth / login / onboarding | ~23 | ⬜ Not migrated | Cataloged, not wrapped |
| General (brand tokens) | ~10 | ⬜ Already Technical=Yes | Untranslated by design |

---

## Notable Recent Fixes (pre-i18n work)

- **QR validation bug fixed:** `buildQRData` now accepts `token` param so `qr_data.v === qr_token`. Existing orders repaired via `_qr_repair.js`.
- **QR payload enriched:** includes brand, buyer, seller, items, date, amount, unique `v` token, MEDEBIRR branding. Verified at ~380 bytes.
- **Camera permission prompt** added (mirroring location UX), plus **manual 4-digit code fallback** via `POST /delivery/:orderId/verify-code`.
- **Buy Now** flow on PDP, standardized back buttons with `Icons.chevron`.
- **Notifications** wired for both buyer + seller via DB table + Telegram DM dual mode.

---

---

## Fixed (2026-08-02 — P0 security hardening)

Full finding → fix → verification table: `REVIEW-2026-08-02.md` §14. Deploy narrative: `JOURNAL.md` → "2026-08-02".

> ⚠️ **Before next deploy:** run `backend/src/db/migration_2.5.sql` on the DB (direct port-5432 connection, not pgbouncer). Adds `orders.idempotency_key` (+ unique partial index) and `orders.cancel_requested_at` — checkout and cancel-request 500 without it.

**Payment lifecycle contract (server-enforced):**
| Method | At checkout | Path to `paid` |
|---|---|---|
| Cash (COD) | `pending`/`confirmed` | `inventory.completeDelivery` flips to `paid` + `CASH-` ledger row (or seller taps "Cash Collected" → `markCashCollected`) |
| Manual transfer | `pending`/`pending` | Buyer submits TX code → `verifying` → seller ✅ button in Telegram (`confirm_pay_<orderId>`) → `markOrderPaid` |
| Telebirr gateway | `pending`/`pending` | Signed webhook (`utils/telebirr.js`, signature always verified + amount match) → `markOrderPaid` |

- **Only** the signed Telebirr webhook or a seller button tap can mark an order paid. `/confirm-tx` never does; the SPA never fabricates transaction codes.
- All 7 `/delivery/*` routes gate on `orderParties()` (buyer vs `admin_tg_user_id`); delivery OTP/code endpoints lock after 10 attempts.
- XSS: `public/js/utils/escape.js` (`esc`/`escAttr`/`escUrl`) loads first in `index.html` — **always** wrap interpolated data in templates; `State.t()` escapes interpolated values by default.
- `vercel.json` has no `headers` block — Express CORS is the only CORS layer. Don't re-add one.
- Security regression suite: `backend/src/tests/security.test.js` (20 tests — real HMAC vectors, telebirr sign/verify, XSS payloads, source guards). Run via `npm test`.
- CI (`.github/workflows/ci.yml`) now: syntax check (`api` + `backend/src`), boot smoke (`createApp()` must construct), i18n validation, `npm test`. Lockfiles are committed — do not gitignore them.
- `uploads/` was removed from git (PII screenshots); path is gitignored.

## Fixed (previous: search, cache, logging)

### PostgreSQL full-text search, TTL cache, structured logging
- **Full-text search**: `migration_2.2.sql` — tsvector column + GIN index on `products` and `stores`, trigger auto-update, backfill. Search uses `to_tsvector @@ websearch_to_tsquery('english')` instead of `ILIKE '%query%'` (~5ms vs ~500ms at 10K products).
- **TTL caches**: `backend/src/utils/cache.js` — `productCache` (30s), `storeCache` (60s), `featuredCache` (120s), `statsCache` (60s). Wired into product detail, featured list, store detail, store stats. Invalidated on all writes (POST/PUT/DELETE).
- **Pino structured logging**: `backend/src/utils/logger.js` — UUID request IDs, `X-Request-ID` header, per-request child loggers, structured error/DB logging. Replaced `console.*` in `server.js`, `app.js`, `db/index.js`, `errorHandler.js`, `api/index.js`.

## Fixed (previous session)

### 5 critical bugs fixed (JOURNAL.md)
1. **Double stock deduction** — `payments.js` webhook + cash confirm checked `payment_status` before calling `deductStock`.
2. **Store revenue NULL** — `orders.js` dispatch SELECTs missing `total_etb` and `store_id`.
3. **Cancel/payment race** — `inventory.js` `releaseReservedStock` wrapped in transaction with `FOR UPDATE`.
4. **MarkdownV2 escaping** — `bot.js` messages escaped; `telegram.js` `sendSafeMessage()` uses HTML mode.
5. **Hardcoded DB credentials** — `run_migration.js` switched to `DATABASE_URL` env var.

## Upcoming (discussed, not started)

### Categories tab — new bottom nav item
Insert between **Explore** and **Wishlist** in the buyer nav bar.
Grid of category cards (icon + name) → drill into sub-categories → filtered listings.
Consider: own tab vs sub-section within Explore.

## Quick Commands

```bash
node gen_i18n.js          # regenerate CSV + locale files from master catalog
node scripts/gen-i18n-csv.js  # generate delta CSV of untranslated keys
cd backend && npm test    # 55 backend tests (28 logic + 4 inventory + 3 app + 20 security)
npm run bump-cache        # update ?v= cache buster from git HEAD
```
