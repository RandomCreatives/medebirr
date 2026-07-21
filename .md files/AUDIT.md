# e-Merkato Code Audit & Recommendations

**Date:** 2026-07-10  
**Version:** 1.2.2  
**Stack:** Vanilla JS SPA + Node.js/Express on Vercel + PostgreSQL (Supabase)

---

## TL;DR — Is it "done"?

**No, but not far off.** The buyer-seller core loop works end-to-end:
browse → add to cart → checkout → order placed → QR receipt generated.

What's missing isn't features — it's **security hardening, data integrity, and production hygiene**. A few of these are exploitable right now. The rest are things that will bite you when real users show up.

---

## What's Good

- All SQL queries are parameterized — no SQL injection
- JWT auth with Telegram HMAC verification
- QR-based delivery verification with dual-confirm (buyer + rider)
- PDF receipts with QR codes
- Per-store checkout with delivery vs. pickup
- Rate limiting on auth endpoints (even if per-instance)
- Client leak protection on DB pool (auto-release after 10s)
- Comprehensive cart state with localStorage persistence

---

## CRITICAL — Fix Before Any Real Users

### 1. Unauthenticated product injection
`backend/src/routes/pending-products.js:40`

`POST /api/v1/pending-products` has **no requireAuth middleware**. Anyone can inject fake products into any store by sending a raw HTTP request. This is the most exploitable issue in the codebase.

**Fix:** Add `requireAuth` + `requireSellerOf` to this endpoint.

### 2. JWT refresh token oracle
`backend/src/routes/auth.js:145-163`

`POST /api/v1/auth/refresh` has **no auth middleware** and calls `jwt.verify(token, ..., { ignoreExpiration: true })`. An attacker with any expired JWT (even a forged one if they guess the payload structure) gets infinite fresh tokens.

**Fix:** Either add `requireAuth` to this endpoint, or remove `ignoreExpiration` and require the token to be < 1 hour expired. Best option: just delete this endpoint — the auth flow doesn't need it.

### 3. Stored XSS in HTML receipt
`backend/src/routes/orders.js:339-441`

Product titles, store names, buyer names, and phone numbers are interpolated directly into an HTML template served as `Content-Type: text/html`. A product titled `<script>alert(document.cookie)</script>` would execute in any browser that opens the receipt.

**Fix:** Use a simple HTML-escape function on all user-supplied values before interpolation:
```js
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
```

### 4. Telegram webhook has no secret verification
`backend/src/routes/bot.js:153`

The webhook endpoint doesn't check `X-Telegram-Bot-Api-Secret-Token`. Anyone can send fake messages/callbacks to your bot endpoint and trigger actions (e.g., fake product detection, fake orders).

**Fix:** Add the secret token check at the top of the webhook handler.

### 5. Chapa webhook has no signature verification
`backend/src/routes/payments.js:370`

The Chapa payment webhook has **zero** signature verification. Anyone can POST to this endpoint and mark any order as paid.

**Fix:** Verify the Chapa webhook signature before processing. (If Chapa is fully deprecated, delete this endpoint.)

---

## HIGH — Fix Before Scaling

### 6. Error handler leaks internal details
`backend/src/middleware/errorHandler.js:30`

`err.message` is sent to the client in ALL environments. Database connection errors, file system errors, and internal exceptions expose implementation details.

**Fix:** In production, return a generic message:
```js
const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
```

### 7. CORS allows all origins unconditionally
`api/index.js:51-66`

The `else` branch at line 62 calls `callback(null, true)` regardless. Every origin is allowed. For a Telegram Mini App this is somewhat acceptable (Telegram WebView sends no Origin), but for browser testing this means any website can make authenticated API calls to your backend.

**Fix:** At minimum, block known-malicious origins. Better: only allow your Vercel domain + localhost for development.

### 8. Timing-unsafe HMAC comparison
`backend/src/middleware/auth.js:32`

`calculatedHash !== hash` uses standard string comparison which leaks timing information. An attacker can brute-force the hash character-by-character.

**Fix:** Use `crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash))`.

### 9. Missing database indexes
These will slow down the app as data grows:

| Table | Column | Why |
|-------|--------|-----|
| `delivery_addresses` | `tg_user_id` | Every checkout loads addresses by user |
| `reviews` | `store_id` | Seller dashboard reviews query |
| `reviews` | `product_id` | Product detail reviews query |
| `orders` | `created_at` | Order list sorted by date |
| `products` | `created_at` | "Newest" sort |
| `products` | `view_count` | "Popular" sort |

**Fix:** Run a migration adding these indexes.

### 10. Foreign keys missing ON DELETE
12+ foreign keys have no `ON DELETE` clause. This means you **cannot delete** a user who owns a store, a product that appears in any order, or a store that has orders — PostgreSQL will throw a constraint error.

Key ones:
- `stores.admin_tg_user_id → users` — blocks user deletion
- `orders.store_id → stores` — blocks store deletion (contradicts the "delete store" feature)
- `order_items.product_id → products` — blocks product deletion

**Fix:** Add `ON DELETE CASCADE` or `ON DELETE SET NULL` as appropriate for each.

---

## MEDIUM — Fix When You Have Time

### 11. PostgreSQL error details leaked to client
`backend/src/middleware/errorHandler.js:10-11, 17-19`

Unique constraint violations and foreign key violations send PostgreSQL's `err.detail` to the client, exposing table names, column names, and constraint values.

**Fix:** Strip `err.detail` in production.

### 12. Telebirr webhook signature skipped outside production
`backend/src/routes/payments.js:196`

Signature check is only enforced in production. On staging/preview deployments, anyone can forge payment confirmations.

### 13. Rate limiting is per-instance (not global)
`api/index.js:72-86`

Vercel serverless means each cold start is a fresh rate limit window. An attacker can brute-force auth across instances without being limited.

**Fix:** Either accept this limitation for now, or use a Redis store (already a dependency in package.json).

### 14. SSL certificate validation disabled
`backend/src/db/index.js:35`

`rejectUnauthorized: false` disables SSL cert validation for PostgreSQL connections. Standard for Supabase but technically allows MITM.

### 15. QR codes embed sensitive data in plaintext
`backend/src/services/qrcode.js:20-31`

QR payload contains order_id, total, buyer name, store name, and verification token. Anyone who scans or intercepts the QR gets all this data.

### 16. Cart doesn't validate freshness
`public/js/state.js:180-193`

Cart loaded from localStorage may contain stale prices, titles, or stock levels. A user could check out with a price that no longer matches the server.

### 17. Wishlist Set/Array desync
`public/js/state.js:81-82` + `public/js/app.js:862-870`

Toggling a wishlist item updates the `Set` but not the `wishlistItems` array. The badge count and the wishlist view can disagree.

### 18. Stock not enforced in cart
`public/js/state.js:119-148, 157-167`

`addToCart` doesn't check stock. `updateQty` has no upper bound. Users can add unlimited quantity regardless of available stock. (Server-side check exists at order creation, but UX is misleading.)

### 19. setWebhook fires on every Vercel cold start
`api/index.js:146-158`

Every cold start calls `setWebhook` after 3s. Under load this hammers the Telegram API. Should only run on deploy.

---

## LOW / INFO

### 20. Dead frontend code (8 unused API methods)
`public/js/api.js` defines these methods that are never called from any frontend file:
- `Api.storeSettings.verification()`
- `Api.storeSettings.requestVerification()`
- `Api.bot.groupStatus()`
- `Api.bot.setWebhook()`
- `Api.images.upload()`
- `Api.delivery.initiateReturn()`
- `Api.payments.initiateTelebirr()`
- `Api.payments.initiateChapa()`

Not harmful, but increases bundle size and confuses future contributors.

### 21. CSP disabled in helmet
`api/index.js:49`

Acceptable for an API server, but any HTML-served endpoints (error pages, receipts) are unprotected.

### 22. Route ordering fragility
`api/index.js:94-96`

Payment-methods and settings routes are mounted AFTER the user routes but rely on fallthrough. If `userRoutes` ever adds a catch-all, they become unreachable.

### 23. No startup validation of required env vars
`JWT_SECRET`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN` are never validated at startup. If missing, the app will crash on first use with a confusing error.

### 24. MarkdownV2 escaping is incomplete
`backend/src/services/telegram.js:255-258`

`escapeMd` misses `-` and `:` which are also special in Telegram MarkdownV2. Can cause message send failures.

---

## Did We Overengineer?

**Partially, yes.** Here's what I'd cut vs. keep:

### Worth keeping
- QR delivery verification + dual confirm
- PDF receipt generation
- Per-store checkout with delivery vs. pickup
- Telegram ↔ App product pipeline
- Rate limiting (even if per-instance)

### Overengineered for current stage
- **Chapa integration** — deprecated, should be removed entirely
- **Telebirr webhook** — the current flow uses manual tx_code entry, the webhook adds complexity for a payment flow that may never be used
- **`form-data` package** — used for image uploads but the upload UI isn't wired up
- **Redis dependency** — in package.json but not actively used for rate limiting
- **8 unused API client methods** — dead code for features not yet built
- **Multiple ON DELETE strategies** — should be defined once in schema and tested

### Missing but simple to add
- Input sanitization (one `esc()` function)
- Env var validation at startup
- DB migration for indexes
- Stripe/Paystack as an alternative to Chapa (if needed)

---

## Recommended Priority Order

| Priority | Items | Effort |
|----------|-------|--------|
| **P0 — This week** | #1, #2, #3, #4, #5 | 2-3 hours |
| **P1 — Before launch** | #6, #7, #8, #9, #10 | 3-4 hours |
| **P2 — Before scaling** | #11-#19 | A weekend |
| **P3 — Nice to have** | #20-#24 | 1 hour |

---

## What's NOT Here (and That's Fine)

- **No tests** — The project has zero automated tests. For an MVP this is acceptable, but before any real users you should at least have integration tests for order creation, payment confirmation, and auth.
- **No CI/CD linting** — No ESLint configured. Code style is consistent by convention but could drift.
- **No monitoring** — No error tracking (Sentry, etc.), no performance monitoring. On Vercel you get basic logs but nothing structured.
- **No backup strategy** — Supabase handles backups, but there's no documented restore procedure.

---

*Generated by code audit on 2026-07-10*
