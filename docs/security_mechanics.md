# Medebirr Security & Mechanics — Plain English

## 1. How Login Works (Authentication)

**The problem:** Medebirr runs inside Telegram. When you open the app, Telegram sends us a signed message saying "this is user 123456". We need to trust that signature.

**The mechanism:**
- Telegram signs the login data with a secret that only Telegram and our bot know (the **bot token**)
- When the app starts, it sends this signed data to our server
- Our server re-computes the HMAC signature using the bot token and compares it with Telegram's signature using `timingSafeEqual` (constant-time compare — no shortcut if they're different lengths)
- If it matches, we know Telegram really sent it, and we issue a **JWT** (a signed token) back to the app
- The JWT expires after some time. On every API request, the server checks the JWT, then re-fetches the user from the database (doesn't trust the token alone)

**Why it's safe:**
- The bot token is never exposed to the client
- `timingSafeEqual` prevents timing attacks (measuring how long the comparison takes to guess the secret)
- Re-fetching the user from DB on every request means revoked users are locked out immediately

---

## 2. How Payments Work

### 2a. Telebirr (Automatic via Webhook)

**The flow:**
1. Buyer clicks "Pay with Telebirr" → server creates a payment request with the seller's Telebirr merchant ID
2. Buyer opens their Telebirr app, sends the money directly to the seller (no escrow — money goes straight to seller)
3. Ethio Telecom (Telebirr) calls our **webhook URL** with a signed receipt saying "payment succeeded"
4. Our server verifies the webhook signature using `TELEBIRR_APP_SECRET`
5. If valid, we mark the order as paid and deduct stock

**Safety mechanism — atomic guard (C-4 fix):**
- The UPDATE that marks the order paid has `WHERE payment_status != 'paid'`
- This is a single database operation — no SELECT-then-UPDATE race window
- If two webhook calls arrive at the exact same time, **only one** succeeds; the other updates zero rows and skips
- This prevents double stock deduction

**Safety mechanism — replay protection (S-5):**
- Each Telebirr transaction has a unique `transactionNo`
- The code inserts into `payment_transactions` — a second call with the same transaction number would create a duplicate row
- Defense-in-depth: we could add a UNIQUE constraint on the transaction number column

### 2b. Manual Payment (CBE / M-Pesa / Telebirr without webhook)

**The flow:**
1. Buyer pays the seller directly via CBE, M-Pesa, or Telebirr
2. Buyer comes back to Medebirr and calls **confirm-tx** with the transaction code
3. **Before the fix (C-3):** This immediately marked the order as paid — fake transaction codes would work
4. **After the fix:** Instead of auto-confirming, the server:
   - Records the buyer's transaction code in `payment_verifications` table
   - Sends the seller a Telegram message with **Confirm** and **Reject** buttons
   - Seller checks their actual bank/Telebirr app, then clicks Confirm or Reject

**Safety mechanism:**
- The seller must manually verify the money actually arrived in their account
- The Confirm button now checks that **only the store admin** can press it (C-2 fix) — not just anyone in the Telegram group
- Rate limited to 5 attempts per hour per user (H-1)

### 2c. Screenshot Verification (Buyer sends photo via bot)

**The flow:**
1. Buyer opens `/start verify_order_<ID>` in the bot
2. Bot asks for a payment screenshot
3. Buyer sends a screenshot photo
4. Bot runs OCR on the photo to extract transaction reference and amount (best-effort, may fail)
5. Bot forwards the screenshot to the seller with Confirm/Reject buttons
6. Seller reviews and clicks Confirm (only store admin can press it — same C-2 fix)
7. `markOrderPaid` runs with the atomic guard

**Why this matters:**
- Without the seller approval step, a buyer could send a fake screenshot that the OCR couldn't read, and still get the order confirmed automatically

### 2d. Cash on Delivery

**The flow:**
1. Buyer selects COD at checkout
2. Order is created with status "pending" and payment "cash_on_delivery"
3. Seller dispatches the item with a delivery person
4. Delivery person scans QR or enters OTP to confirm delivery
5. Seller gets the cash directly from the delivery person

**Why it's safe:**
- No digital payment to fake — money changes hands physically
- The QR/OTP just confirms delivery happened, not payment
- Stock is deducted at dispatch, not at delivery

---

## 3. How Delivery Works (QR + OTP)

**The problem:** The seller needs to prove they delivered the item. The buyer needs to prove they received it.

**The mechanism:**

**QR code:**
- When an order is confirmed (paid), the server generates a **QR code** and a **PDF receipt**
- The QR contains: order ID, reference number, brand, buyer/seller info, items, amount, and a unique `v` token (cryptographic nonce)
- The delivery person scans the QR with the buyer's phone — the app validates that `v` matches the server's stored value
- On successful scan, the order status changes to "delivered"

**OTP (fallback):**
- If scanning fails (dirty screen, bad lighting), the delivery person can enter a 4-digit code
- The code is generated with `crypto.randomInt()` (cryptographically secure, not `Math.random()`)
- **Risk (S-8):** 4 digits = 10,000 combinations. Without rate limiting on `/verify-code`, brute force is possible.
- Each order gets a unique code, and the code expires after a short time

**Manual code (last resort):**
- If both QR and OTP fail, the server has a `POST /delivery/:orderId/verify-code` fallback
- This requires a 4-digit code that the buyer gives to the delivery person verbally

---

## 4. How Stock Management Works

**The problem:** Two people buying the same item at the same time could oversell.

**The mechanism:**

**Three-stage system:**
1. **Reserve** — When an order is created, stock isn't touched, but reserved_count tracks pending orders
2. **Deduct** — When payment is confirmed, actual stock is reduced and reserved is cleared
3. **Release** — If the order is cancelled, reserved stock goes back to available stock

**Atomic operations:**
- `deductStock` and `releaseReservedStock` run inside `BEGIN/COMMIT` transactions with `FOR UPDATE` row locks
- This means: if two payments arrive at the same time for the same product, **one waits for the other** — no overselling
- The payment webhook atomic guard (C-4) prevents the same order from being deducted twice

---

## 5. How Bot Integration Works

**The problem:** The bot needs to receive updates from Telegram (messages, button clicks) securely.

**The mechanism:**

**Webhook:**
- Instead of polling Telegram for updates, we tell Telegram to call us at `https://medebirr.vercel.app/api/v1/bot/webhook`
- Telegram signs these requests with `TELEGRAM_WEBHOOK_SECRET` — we verify it before processing
- If the secret is missing, the server **refuses to start** in production (H-3)

**Callback queries (button clicks):**
- When a seller presses "Confirm Payment" in the bot, Telegram sends a `callback_query` with:
  - `callbackQuery.data` = the button's payload (e.g., `confirm_pay_<order_id>`)
  - `callbackQuery.from.id` = the Telegram user ID of the person who pressed it
- **Before C-2 fix:** Anyone in the group could press Confirm — no check on who pressed it
- **After C-2 fix:** The server fetches the order's `admin_tg_user_id` and checks it matches `callbackQuery.from.id`
- Non-admin pressers get a "Only the store admin can confirm payment" error message

---

## 6. How CORS Works

**The problem:** A malicious website at `stoleshoes.com` could make requests to Medebirr's API and read responses while a user is logged in.

**The mechanism:**

**Express CORS middleware (correct one):**
- The Express server has a whitelist of allowed origins: `FRONTEND_URL`, `medebirr.vercel.app`, and any `*.vercel.app` preview
- Requests with no origin (Telegram WebView, curl) are allowed (they can't carry cookies/auth)
- In production, unknown origins are **rejected with a 403**
- In development, all origins are allowed (convenience for testing)

**Vercel headers (the problem before C-1):**
- Vercel had `Access-Control-Allow-Origin: *` in its `vercel.json`
- This header was added **before** the Express CORS check, overriding it
- Every `*.vercel.app` response had this wildcard, making the Express whitelist useless
- **After C-1 fix:** The Vercel header block is removed — Express CORS is the single source of truth

**Why the JWT is still safe:**
- The JWT is stored in JavaScript memory, not a cookie
- Browser CORS doesn't automatically attach in-memory tokens to cross-origin requests
- Only Telegram WebView has access to the `window.Telegram.WebApp` API

---

## 7. How Rate Limiting Works

**The problem:** An attacker can spam an endpoint to exhaust resources, brute-force codes, or incur API costs.

**The mechanism (before H-1 fix):**
- Generic limit: 300 requests per 15 minutes across all API endpoints
- Auth limit: 30 requests per 15 minutes on login
- **No specific limits on:** payment initiation, OTP, coupon validation

**The mechanism (after H-1 fix):**
- Payment initiation: **5 per hour per user** — prevents Telebirr merchant quota exhaustion (S-10)
- OTP send: **3 per 5 minutes per user** — prevents SMS/Telegram spam costs
- Coupon validation: **10 per hour per user** — prevents brute-forcing coupon codes

**How it's implemented:**
- Each rate limiter stores counts in memory (per-server) with the user's IP as the key
- When the limit is hit, the server returns `429 Too Many Requests`
- Works per-server — if you scale to multiple servers, you'd need a shared store (Redis), but for a single-server setup this is fine

---

## 8. How Image Upload Security Works

**The problem:** A user could upload images into another seller's folder, polluting their product images.

**The mechanism (before H-2 fix):**
- Upload endpoint took a `store_id` from the request body
- No check that the authenticated user actually owns that store
- Any user could upload to any store's folder

**The mechanism (after H-2 fix):**
- Before uploading, the server queries: `SELECT store_id FROM stores WHERE store_id = $1 AND admin_tg_user_id = $2`
- If no row comes back, the user doesn't own that store → `403 Not authorized`
- Images are stored in Supabase Storage at path `{storeId}/{timestamp}_{index}.{ext}`

---

## 9. How Database SSL Works

**The problem:** Data between the server and the database travels over the internet. Without SSL verification, a man-in-the-middle could read or modify it.

**The mechanism (before H-4 fix):**
- SSL was enabled but `rejectUnauthorized: false` — the server accepted any certificate
- This means encryption existed but certificate validation didn't — a sophisticated attacker could present a fake certificate

**The mechanism (after H-4 fix):**
- SSL now uses `rejectUnauthorized: true` by default (controlled by `DB_SSL_REJECT_UNAUTHORIZED` env var)
- The server validates the database's certificate against the system's trusted CA bundle
- Can be disabled for local development or troubleshooting by setting `DB_SSL_REJECT_UNAUTHORIZED=false`

---

## 10. How Search & Caching Works

**The problem:** Every product search hits the database directly. At scale, this is slow.

**The mechanism:**

**Full-text search:**
- Products have a `search_vector` column (PostgreSQL `tsvector`) with a GIN index
- When a product is created or updated, a database trigger automatically updates the search vector
- Search uses `websearch_to_tsquery('english', query)` instead of `ILIKE '%query%'` — ~5ms vs ~500ms at 10K products
- Products and stores share a single search

**TTL Cache (before wiring fix):**
- Separate caches exist for: product detail (30s), store lookup (60s), featured (120s), search results (15s), store stats (60s)
- **Before fix:** `searchCache` was exported but **never used** in the search route — all searches hit the DB
- **After fix:** Search results are cached for 15 seconds by their filter parameters
- Caches are cleared when products are created, updated, or deleted

---

## 11. Attack Scenarios — Current Status

| Scenario | Risk | Status |
|----------|------|--------|
| S1: Fake buyer (COD fake payment) | Low — COD is cash at delivery | ✅ Safe by design |
| S1: Fake buyer (Telebirr confirm-tx) | High | ✅ **Fixed** C-3 (seller must approve) |
| S2: Bot hijacker (fake webhook) | Critical | ✅ **Fixed** H-3 (webhook secret required) |
| S3: Race condition (double-deduct) | High | ✅ **Fixed** C-4 (atomic UPDATE) |
| S4: CORS data thief | Low — no cookies | ✅ **Fixed** C-1 (removed wildcard) |
| S5: Webhook replay | Medium | ⚠️ **Mitigated** by atomic guard; UNIQUE constraint not yet added |
| S6: Delivery fraud (OTP sharing) | Medium | ⚠️ Known social problem; OTP expiry helps |
| S7: Colluding seller (fake orders) | Low | ❓ Not checked — verify `order_count` query |
| S8: OTP brute force | High | ❓ Not checked — verify `/verify-code` rate limiting |
| S9: JWT theft via XSS | High | ❓ Not checked — CSP disabled; audit needed |
| S10: Merchant quota exhaustion | Medium | ✅ **Fixed** H-1 (5/hr payment limit) |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `backend/src/routes/auth.js` | Telegram HMAC verification, JWT issue |
| `backend/src/middleware/auth.js` | `requireAuth` — JWT validation on every request |
| `backend/src/routes/payments.js` | Webhook, confirm-tx, markOrderPaid, cash confirm |
| `backend/src/routes/bot.js` | Bot webhook, callback queries, payment buttons |
| `backend/src/routes/otp.js` | OTP send/verify for phone verification |
| `backend/src/routes/images.js` | Image upload to Supabase Storage |
| `backend/src/routes/delivery.js` | QR scan, OTP verify, manual code |
| `backend/src/utils/cache.js` | TTL cache instances for products, search, stores |
| `backend/src/db/index.js` | Database pool, SSL config, query execution |
| `backend/src/app.js` | Express setup, CORS, rate limiting, routes |
| `backend/src/server.js` | Local dev server, env validation at startup |
| `vercel.json` | Vercel deployment config (rewrites, headers) |
