# Medebirr — Session Journal

## 2026-07-28: Code Review + Architecture Planning

### Context
Reviewed the full medebirr codebase (Express backend + vanilla JS TMA). Compared against a FAANG-style e-commerce system design to identify gaps appropriate for an Ethiopia-focused Telegram marketplace at current scale.

### Bugs Found & Fixed

All fixes applied to files on disk. Uncommitted.

1. **Double stock deduction** — `payments.js` webhook + cash confirm called `deductStock` without checking if order was already paid. Added guard in webhook and cash routes.
2. **Store revenue set to NULL** — `orders.js` SELECT in dispatch + confirm-delivery routes missing `total_etb` and `store_id`. Added to SELECTs.
3. **Cancel/payment race condition** — `releaseReservedStock` in `inventory.js` had no transaction or `FOR UPDATE` lock. Wrapped in BEGIN/COMMIT with row locks.
4. **MarkdownV2 bot messages failing silently** — Hardcoded bot messages in `bot.js` had unescaped special characters. Added `sendSafeMessage()` to `telegram.js` (HTML parse_mode, auto-converts `*bold*` → `<b>bold</b>`). Fixed `/start` and search bot messages.
5. **Hardcoded DB credentials** — `run_migration.js` had production credentials committed. Switched to `DATABASE_URL` env var.

### Architecture Assessment

**Project maturity**: Solid alpha / early beta. Production-hardening needed.

**Strengths**:
- 23-table PostgreSQL schema with proper types, indexes, JSONB
- Telegram initData HMAC with timing-safe comparison
- `SELECT FOR UPDATE` in order creation for concurrency
- Policy snapshots as JSONB at order creation
- QR + OTP dual-confirmation delivery handshake
- Zero-escrow payment model (Telebirr direct to seller)
- Two-phase init frontend pattern, offline cache, per-store cart
- CI/CD pipeline, cache busting, i18n with Amharic

**Weaknesses**:
- No caching anywhere (every request hits DB directly)
- Search uses `ILIKE '%query%'` (no index usage, sequential scan)
- Single PostgreSQL instance (no read replicas)
- No monitoring/structured logging
- Auth middleware does `SELECT *` on every request
- DAL is half-implemented (inline SQL in routes bypasses it)

### Web Version Strategy

**Decision**: Build a separate web frontend in the same repo, sharing the backend. Monorepo structure:

```
medebirr/
├── packages/
│   ├── backend/     # Existing Express API (shared)
│   ├── tma/         # Existing vanilla JS TMA (unchanged)
│   └── web/         # New React/Next.js frontend
├── tokens.json      # Shared design values (colors, fonts)
└── vercel.json      # Route /api/* → backend, /* → web
```

**Key principle**: TMA and web share ZERO frontend code. No CSS bleed, no component sharing, no framework conflicts. The API is the only shared surface.

**Web version scope** (6-month plan):
- Month 1-2: Auth (email/Google) + browse + search
- Month 3-4: Cart + checkout + order tracking
- Month 5-6: Seller web dashboard (optional)

**What stays Telegram-only**: Bot-based product detection, payment verification via screenshot OCR, QR delivery handshake, Telegram DM notifications.

## 2026-07-28 (continued): Admin Analytics Dashboard — Design Spec

### Objective
Build a standalone admin/analytics page (PC browser, not Telegram) to monitor:
- User growth (sellers vs buyers, signups over time)
- Where users get stuck (funnel drops, abandoned carts, zero-result searches)
- Where the system fails (500 errors, payment failures, slow routes)

### Architecture

**No new services.** Everything in existing PostgreSQL + Express. Frontend is a vanilla-JS SPA page (same pattern as TMA, no framework).

Three layers: **Sink** (data collection) → **Backend API** (aggregation queries) → **Admin page** (tabs + charts).

---

### Layer 1: Data Collection

#### 1a. `user_events` table (frontend-tracked)

```sql
CREATE TABLE user_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(64) NOT NULL,              -- random uuid, generated once per tab session
  event_name VARCHAR(64) NOT NULL,               -- see event catalog below
  page_url VARCHAR(256),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ue_name     ON user_events(event_name);
CREATE INDEX idx_ue_created  ON user_events(created_at);
CREATE INDEX idx_ue_user     ON user_events(user_id);
CREATE INDEX idx_ue_session  ON user_events(session_id);
CREATE INDEX idx_ue_meta     ON user_events USING GIN (metadata);
```

**Event catalog** (fired from TMA via fire-and-forget `POST /api/v1/events`):

| Event | When | metadata example |
|-------|------|-----------------|
| `page_view` | Every route change | `{ route: "explore", prev: "home" }` |
| `search` | User submits search | `{ query: "shoes", results: 3 }` |
| `search_no_results` | Zero results returned | `{ query: "xyz123" }` |
| `add_to_cart` | Item added | `{ product_id, store_id, price }` |
| `remove_from_cart` | Item removed | `{ product_id }` |
| `checkout_start` | Step 1 of checkout | `{ store_id, item_count, total }` |
| `checkout_step2` | Address entered | `{ store_id }` |
| `checkout_step3` | Payment method chosen | `{ method: "telebirr" }` |
| `checkout_abandon` | Left checkout before confirm | `{ step: 2, store_id, total }` |
| `payment_attempt` | Confirm clicked / webhook called | `{ order_id, method }` |
| `payment_success` | Payment confirmed | `{ order_id, amount }` |
| `payment_fail` | Payment declined/timeout | `{ order_id, error }` |
| `product_view` | PDP opened | `{ product_id, store_id }` |
| `product_create_start` | Seller opens add-product | `{}` |
| `product_create_finish` | Seller publishes product | `{ product_id, category }` |
| `product_create_abandon` | Seller leaves wizard | `{ step: 2 }` |
| `wishlist_add` | ❤️ clicked | `{ product_id }` |
| `error_frontend` | Uncaught JS error | `{ message, stack: truncated }` |

#### 1b. `system_errors` table (backend-caught)

```sql
CREATE TABLE system_errors (
  id BIGSERIAL PRIMARY KEY,
  route VARCHAR(128) NOT NULL,
  method VARCHAR(8) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  request_body JSONB,
  status_code INTEGER DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_se_route    ON system_errors(route);
CREATE INDEX idx_se_created  ON system_errors(created_at);
```

**How it populates:**
- Express error-handling middleware catches all uncaught errors → INSERT into `system_errors` before returning 500
- Payment webhook failures explicitly logged (timeout / invalid signature / Telegram unreachable)

#### 1c. `page_views_agg` materialized view (optional, for speed)

```sql
CREATE MATERIALIZED VIEW page_views_agg AS
SELECT
  date_trunc('day', created_at) AS day,
  page_url,
  COUNT(*) AS views,
  COUNT(DISTINCT user_id) AS unique_users
FROM user_events
WHERE event_name = 'page_view'
GROUP BY 1, 2;
```

Refreshed by pg_cron or a simple `REFRESH MATERIALIZED VIEW CONCURRENTLY` called from a daily endpoint. Skip at MVP — just query user_events directly until it's slow.

---

### Layer 2: Backend API Routes

All under `/api/admin/*`, protected by `requireAdmin` middleware (checks user.role === 'admin' or a dedicated `admins` table).

#### Main dashboard — `GET /api/admin/dashboard`
Returns:
```json
{
  "users": {
    "total": 1234,
    "sellers": 89,
    "buyers": 1145,
    "today_signups": 12,
    "this_week": 67,
    "growth_7d": [{"day": "2026-07-21", "count": 8}, ...]
  },
  "errors": {
    "total_24h": 5,
    "top_routes": [{"route": "/api/payments/webhook", "count": 3}, ...]
  },
  "funnel_today": {
    "page_views": 1200,
    "add_to_cart": 145,
    "checkout_start": 67,
    "payment_attempt": 42,
    "payment_success": 38
  },
  "search_gaps": [
    {"query": "iphone", "count": 5}
  ]
}
```

#### Funnel detail — `GET /api/admin/funnel?from=&to=`
Per-step counts with optional date range. Used to populate the funnel chart.

#### Errors — `GET /api/admin/errors?limit=50&offset=0&route=`
Paginated list of recent errors. Click one to see full stack + request body (`GET /api/admin/errors/:id`).

#### Abandoned carts — `GET /api/admin/abandoned-carts?days=7`
Shows users who added items but never completed checkout. Returns user_id, items, total, time since abandonment.

#### Search gaps — `GET /api/admin/search-gaps?days=7`
Queries that returned 0 results, grouped by query text, sorted by frequency.

#### Event ingestion — `POST /api/v1/events`
Body: `{ event_name, page_url, metadata }` (session_id generated frontend, user_id extracted from JWT/auth)
Responds 200 immediately (fire-and-forget, no await on INSERT).

#### Event batch — `POST /api/v1/events/batch`
Body: `{ events: [{ event_name, page_url, metadata }, ...] }`
For bulk flush.

---

### Layer 3: Admin Frontend Page

Served at `/admin` via Express static or a dedicated route.

**Same tech stack as TMA**: vanilla JS, no build step, Tailwind via CDN or plain CSS.

#### Layout
```
┌─────────────────────────────────────────────────────┐
│  📊 Admin Dashboard    [date range picker] [refresh] │
├─────────────────────────────────────────────────────┤
│  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐          │
│  │Users  │ │Sellers│ │Errors │ │Orders │          │
│  │ 1,234 │ │   89  │ │   5   │ │  420  │          │
│  └───────┘ └───────┘ └───────┘ └───────┘          │
├─────────────────────────────────────────────────────┤
│  [Users] [Funnel] [Errors] [Search] [Carts] ← tabs │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Tab content area (see below)                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Tab: Users
- Line chart: signups per day (last 30 days)
- Pie/bar: sellers vs buyers
- Table: recent signups (name, role, created_at)

#### Tab: Funnel
- Horizontal bar chart: page_view → add_to_cart → checkout_start → payment_attempt → payment_success
- Drop-off percentages between each step
- Toggle: Today / This Week / This Month / Custom range

#### Tab: Errors
- Bar chart: errors by route (last 24h)
- Table: recent errors (time, route, message, status)
- Click row → expand to see full stack trace + request body

#### Tab: Search Gaps
- Table: query → count → last occurrence
- Helps identify products users want but aren't listed

#### Tab: Carts
- Table: user → items → total → time since added → status (abandoned / converted)

#### Chart rendering
Use a tiny inline chart lib (e.g. Chart.js from CDN, or hand-rolled SVG). No heavy framework.

---

### Implementation Order (for implementation session)

| Step | What | Est. |
|------|------|------|
| 1 | Run migration to create `user_events` + `system_errors` tables | 15m |
| 2 | Add `POST /api/v1/events` and `POST /api/v1/events/batch` routes | 30m |
| 3 | Add error-handling middleware that logs to `system_errors` | 15m |
| 4 | Add `requireAdmin` middleware | 15m |
| 5 | Add `GET /api/admin/dashboard` (main aggregation) | 45m |
| 6 | Add `GET /api/admin/funnel`, `/errors`, `/errors/:id`, `/search-gaps`, `/abandoned-carts` | 45m |
| 7 | Wire events into TMA (page_view on every route, search on submit, etc.) | 1h |
| 8 | Build admin frontend page at `/admin` | 2h |
| 9 | Create a seed admin user (or promote existing user to admin) | 15m |
| **Total** | | **~5h** |

### Files to Create/Modify

| File | Action |
|------|--------|
| `backend/src/db/migration_admin.sql` | Create `user_events` + `system_errors` tables |
| `backend/src/routes/events.js` | `POST /api/v1/events` and `/batch` — fire-and-forget ingestion |
| `backend/src/routes/admin.js` | All `GET /api/admin/*` aggregate routes |
| `backend/src/middleware/admin.js` | `requireAdmin` middleware |
| `backend/src/middleware/errorHandler.js` | **Modify** — add INSERT into `system_errors` before 500 response |
| `backend/src/app.js` | **Modify** — mount new routes |
| `public/admin.html` | Admin dashboard SPA (or `public/admin/index.html`) |
| `public/js/admin.js` | Admin dashboard logic |
| `public/js/admin-events.js` | **New TMA module** — fire-and-forget event emitter, imported by TMA pages |

### Next Step for VS Code Session

Pull latest `JOURNAL.md`, then start at **Step 1** above. Build in this order — each step is independently testable before moving to the next.

---

## 2026-07-29: Phase 1 Hardening Deployed — Production 500 Hotfix

### What Was Deployed (commit `4d8434e` by VS Code session)

Full-text search, TTL cache, and structured logging — 12 files, +448/-100 lines:

| File | What |
|------|------|
| `backend/src/db/migration_2.2.sql` | `tsvector` + GIN indexes on `products` and `stores`, auto-update triggers, backfill |
| `backend/src/utils/cache.js` | `TTLCache` class + 5 singleton caches (product 30s, store 60s, featured 120s, search 15s, stats 60s) |
| `backend/src/utils/logger.js` | Pino structured logger, request ID middleware (`X-Request-ID`), audit logging |
| `backend/src/routes/products.js` | Search switched from `ILIKE '%query%'` to `websearch_to_tsquery('english')`; cache wired for featured + product detail; cache invalidation on write |
| `backend/src/routes/stores.js` | Cache wired for store detail + stats; invalidation on write |
| `backend/src/app.js` | `morgan` replaced with `requestLogger` middleware; `console.warn` → `logger.warn` in CORS |
| `backend/src/server.js` | `console.*` → `logger.*` |
| `backend/src/db/index.js` | DB query logging via pino; pool creation log |
| `backend/src/middleware/errorHandler.js` | Error logging via `req.log` instead of `console.error` |
| `api/index.js` | `console.*` → `logger.*` in webhook auto-registration and startup |
| `backend/package.json` | Added `pino@^10.3.1`, `pino-pretty@^13.1.3` |

### Production Outage — Root Cause

After `4d8434e` deployed, **every API call returned 500 `FUNCTION_INVOCATION_FAILED`**.

**Root cause:** The VS Code session added `pino`, `pino-pretty` to `backend/package.json`, but Vercel reads dependencies from the **root** `package.json` — because the serverless entry point is `api/index.js` at the repo root, not inside `backend/`. Node's module resolution from `api/index.js` walks up the directory tree and finds `D:\DEV_TRIAL\IdeaTesting\medebirr_repo\package.json`, not `backend/package.json`.

Vercel's build installs from the root `package.json`. Since `pino` wasn't listed there, the require chain (`api/index.js` → `backend/src/app.js` → `backend/src/utils/logger.js` → `pino`) failed with `Cannot find module 'pino'`.

### Fix Applied (commit `0573187`)

Added the three missing deps to root `package.json`:

```diff
+    "pino": "^10.3.1",
+    "pino-pretty": "^13.1.3",
+    "uuid": "^11.1.1",
-    "morgan": "^1.11.0",   (still present, removal optional)
```

**Important lesson for future:**
- **Root `package.json`** = Vercel production dependencies (what runs in serverless)
- **`backend/package.json`** = local dev backend dependencies (+ any backend-only tools)
- Any new npm package MUST be added to **both** files, or Vercel will crash at cold start
- Consider adding a `"preinstall": "cd backend && npm install"` script to root `package.json`, or better yet, consolidate to root and symlink. But cross that bridge when it becomes a recurring issue.

### Code Review Notes (from 4d8434e)

**Issues to address (non-blocking):**

1. **`searchCache` exported but never wired** — `cache.js` exports `searchCache` but no route uses it. Either wire it into the search route in `products.js` or remove it.

2. **`db/index.js` creates its own pino instance** — separate from the one in `logger.js`. DB logs have different format/level than request logs. Should import and reuse the shared logger.

3. **`morgan` still in root `package.json`** — no longer used in code (replaced by `requestLogger`). Dead dep, safe to remove.

4. **`logger.js` uses `bindings()`** — `req.requestId = req.log.bindings().requestId` works on pino child loggers. Verified compatible with pino 10.3.1.

5. **Cache TTLs are reasonable** for current scale. No stale-data issues expected.

### Next Steps

1. Verify production is green after `0573187` auto-deploys (check `/api/health` and `/api/health/db`)
2. Start building admin analytics dashboard (see design spec above)
3. Optionally add bot commands (`/donate`, `/manual`, delivery confirmation) as discussed

## 2026-08-02: P0 Security Hardening — Full Review Fixes Deployed

### Context
Follow-on to `REVIEW-2026-08-02.md` (full-stack review). User asked to fix **all** issues found. Every P0 and the contained P1s are now implemented and verified: **55/55 tests green** (28 logic + 4 inventory + 3 app + 20 new security), every file parses (`node --check` over `public/`, `api/`, `backend/src/`), boot smoke passes, i18n validator passes (549 keys).

### ⚠️ Deploy Blocker — run this FIRST
`backend/src/db/migration_2.5.sql` **must be run against the database** before/with the next deploy (direct connection via `SUPABASE_DB_URL`/`DATABASE_URL` port 5432, **not** the pgbouncer port). It adds `orders.idempotency_key` (+ partial unique index) and `orders.cancel_requested_at`. `orders.js` now writes/reads both columns — without the migration, checkout and cancel-request will 500. The unique index will fail if duplicate `(buyer_tg_user_id, idempotency_key)` rows already exist; dedupe first if so.

### What was fixed (mapped to the review's evidence index)

1. **Boot-breaking syntax** (`stores.js:226`) — was already fixed during the review session; now protected by CI (see #13).
2. **Buyer-fabricated payment confirmation** — frontend no longer invents `TXN-${Date.now()}`; `/confirm-tx` never calls `markOrderPaid`. It sets `payment_status='verifying'`, upserts a `payment_verifications` row (`pending_seller_confirm`), and Telegram-DMs the seller with `confirm_pay_<orderId>` / `reject_pay_<orderId>` inline buttons (existing bot callbacks). Only the **signed Telebirr webhook** or a **seller button tap** can mark an order paid.
3. **Buyer self-confirming cash** — `/cash/confirm` is now seller-only (403 for buyers) and idempotent (`markCashCollected` writes the `CASH-<orderId>` ledger row only on the unpaid→paid flip). COD orders are born `order_status='confirmed'`, may dispatch while `payment_status='pending'`, and `inventory.completeDelivery` flips them to `paid` + ledger row inside the delivery transaction.
4. **Delivery IDOR (all 7 `/delivery/*` routes)** — every route now gates on `orderParties(order, tgUserId)` (buyer = `buyer_tg_user_id`, rider side = `admin_tg_user_id`; `/settle` keeps its owner-only check). One user can no longer sign both QR sides of someone else's order.
5. **OTP brute force** — delivery `/verify-otp` and `/verify-code` cap at 10 attempts per order (429 + locked); `services/otp.js verifyOtp` finally increments `attempts` on wrong guesses and locks at 3 (the counter was dead — lookup matched on the code value itself).
6. **Stored XSS (~110 sinks)** — new `public/js/utils/escape.js` (global `esc`/`escAttr`/`escUrl`, loaded first); codemod over buyer/seller/checkout/modals/order-actions/notification-feed/seller-registration views (titles, store names, usernames, addresses, chat messages, review comments, rider info, tx codes, Telegram-scraped draft captions); `i18n.js interpolate()` now escapes interpolated *values* by default; `_colorToHex` allowlist; `_copyText` uses `data-v`/`data-m` attrs instead of interpolated JS args; QR/receipt iframes go through `escUrl` (blocks `javascript:`).
7. **CORS wildcard vs Express CORS** — deleted the `vercel.json` `headers` block entirely; Express CORS is the single layer now.
8. **Telebirr webhook signature bypass** — new `backend/src/utils/telebirr.js` (`sign`/`verifySignature` timing-safe + non-mutating, `amountsMatch` epsilon compare). Webhook **always** verifies the signature (503 if `TELEBIRR_APP_SECRET` unset — no `isTesting`/`BYPASS_TELEGRAM_AUTH` escape hatch) and compares amount vs order total.
9. **Idempotency key overwritten by payments** — dedicated `orders.idempotency_key` column (migration_2.5) instead of abusing `payment_tx_ref`; checkout retries return the existing order.
10. **Paid-order buyer-cancel with no refund trail** — buyer cancel blocked once `payment_status='paid'` (must use cancel-request); cancel-request has a 24h dedupe (`cancel_requested_at`) so sellers aren't DM-spammed; new `/mark-refunded` writes a `REFUND-<orderId>` ledger row.
11. **Trust/model gaps** — image upload now checks store ownership; reviews require the product to be a line item of a non-cancelled order by that buyer; store creation capped at 3 per user; list endpoints have pagination caps (buyer 100, seller 200, products).
12. **Health endpoint info leak** — `dbConfigured`/`bypassAuth` only exposed outside production.
13. **CI was permanently red / never gated** — lockfiles were gitignored while CI ran `npm ci`. Both lockfiles now committed; `.github/workflows/ci.yml` adds: syntax check over `api/` + `backend/src/` (the missing half that would have caught the `stores.js` boot-break), a **boot smoke** step (`createApp()` must construct, asserts version), i18n validation, and `npm test`.
14. **Dependency split-brain** — `tesseract.js` added to `backend/package.json` (same missing-dep pattern as the documented pino outage); `morgan` removed from both manifests; `backend npm ci` verified (`tesseract.js loads OK`).
15. **PII in git** — `uploads/` (13 payment screenshots) removed from git and disk, path gitignored.

### Payment lifecycle contract (now enforced server-side)
| Method | At checkout | Path to `paid` |
|---|---|---|
| Cash (COD) | `pending` / `confirmed` (+seller DM) | Cash at handover → `completeDelivery` flips to `paid` + `CASH-` ledger row; or seller taps "Cash Collected" first |
| Manual transfer (Telebirr manual / CBE) | `pending` / `pending` | Buyer submits TX code → `verifying` → seller taps ✅ in Telegram → `paid` |
| Telebirr gateway | `pending` / `pending` | Signed webhook (signature **always** verified + amount match) → `paid` |

### Deferred (needs product decision or the migration first)
- Store onboarding `pending→verified` gating (no admin verify UI exists — flipping it would break all selling today)
- OCR/PDF async off webhook hot path; `express.json` 10MB + base64 screenshots in `orders.payment_proof`
- DAL migration completion, rider entity/role, OpenAPI, multi-store switcher, Amharic translation fill-in, Afaan Oromoo locale
- JWT moved from `localStorage` to httpOnly cookie (needs web-session work; XSS sink cleanup above shrinks the theft surface)

### Verification
```
cd backend && npm test   # 55 passed, 0 failed (28 logic + 4 inventory + 3 app + 20 security)
node --check over public/, api/, backend/src/   # clean
createApp() boot smoke with CI env vars          # OK, version 1.4.0
node scripts/validate-i18n.js                    # 549 State.t() keys resolve
```