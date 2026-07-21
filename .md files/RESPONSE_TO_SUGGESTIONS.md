# Response to `suggestions.md` — Medebirr Multi-Bot Ecosystem

**Prepared by:** OpenCode Assistant
**Date:** 2026-07-15
**Context:** Analysis of the 3 suggestions in `suggestions.md`, mapped against the current state of `RandomCreatives/medebirr`, to define a realistic build roadmap.

---

## 1. What `suggestions.md` Proposes

The document is split into **3 suggestion blocks**:

### Suggestion 1 — Multi-Bot Ecosystem
Four specialized bots behind the main Mini App:
1. **Scraper Bot** — listens to a seller's Telegram channel/group, auto-detects image+caption posts, parses price/description, drafts a pending product in the seller dashboard.
2. **Inline Search Bot** — `@MedebirrBot [query]` from any chat returns inline product cards with a "🛒 Buy Now" button.
3. **Transaction & Dispatch Notification Bot** — instant order/dispatch/rider updates to buyers & sellers.
4. **Telebirr/CBE Payment Verification Bot** — OCR on transaction screenshots → auto-marks order `paid`.

### Suggestion 2 — Key Developer Work Items
- **`useTelegram` React hook** (note: our app is vanilla JS, not React — adaptation needed).
- **Scraper Bot parsing logic** (regex/AI price extraction).
- **Secure Handshake Verification** on backend: `delivery_latitude/longitude`, `delivery_otp`, `rider_latitude/longitude`, Haversine geofence check.

### Suggestion 3 — Integrated Checkout & Verification Flow
- Native clipboard copy of seller account.
- "Upload Receipt to Verification Bot" deep link (`t.me/MedebirrBot?start=verify_order_12345`).
- OCR pipeline (Tesseract.js / Cloud Vision).
- Multi-way instant notifications (seller / buyer / rider).
- Geofenced delivery loop with rider OTP handshake.

---

## 2. Current Codebase State (Reality Check)

| Capability | Status | Notes |
|---|---|---|
| Main Mini App (buyer + seller) | ✅ Production | Vanilla JS SPA, deployed on Vercel |
| Telegram WebApp auth (`verifyTelegramInitData`) | ✅ Done | `backend/src/middleware/auth.js`, timing-safe HMAC |
| Single bot `@medebirrbot` | ✅ Active | Handles webhook, group verification, broadcasts |
| Store registration + Seller Studio | ✅ Done | 3-step wizard, T&C gate, auto-redirect |
| Order creation + checkout | ✅ Done | Stock enforcement, coupon, TX ID display |
| Receipt PDF generation | ✅ Fixed | Data-URL fallback when Supabase upload fails |
| Delivery + QR verification | ✅ Done | Rider scan, OTP-style flow exists |
| **Multi-bot architecture** | ❌ Missing | Only `@medebirrbot` exists |
| **Scraper Bot** | ❌ Missing | No message-listening parser |
| **Inline Search** | ❌ Missing | No inline query handler |
| **OCR payment verification** | ❌ Missing | Payments are manual confirm only |
| **Geofence / Haversine** | ❌ Missing | `orders` table has no lat/long/otp columns |
| **Rider GPS handshake** | ❌ Partial | Rider flow exists but no coordinate check |

**Key architecture note:** The app is **vanilla JS**, not React. Suggestion 2's `useTelegram` hook is React-specific — we adapt it as a `TelegramWebApp` wrapper module (`public/js/telegram-webapp.js`) instead.

---

## 3. My Recommendations (Prioritized)

### 🥇 Phase A — Quick Wins (High Impact, Low Effort)
1. **Native clipboard + receipt deep-link** (Suggestion 3, Step 1)
   - Replace manual "Copy Account" with `Telegram.WebApp.Clipboard.writeText()`.
   - Add "📱 Upload Receipt to Bot" button → deep link `t.me/medebirrbot?start=verify_order_{id}`.
   - *Effort: ~1 file, frontend only.*

2. **Secure Handshake schema** (Suggestion 2, Item 3)
   - Add columns: `delivery_latitude`, `delivery_longitude`, `delivery_otp`, `rider_latitude`, `rider_longitude` to `orders`.
   - `generateOTP()` util (crypto.randomBytes → 4-digit).
   - Haversine helper in `backend/src/utils/geo.js`.
   - *Effort: 1 migration + 2 small utils.*

### 🥈 Phase B — Core Bots (Medium Effort)
3. **Transaction & Dispatch Notification Bot** (Suggestion 1, #3)
   - Already 80% there: `services/notifications.js` + `services/telegram.js` exist.
   - Extend `tgCall` usage to rider role.
   - *Effort: wire existing services to rider events.*

4. **Payment Verification Bot** (Suggestion 1, #4)
   - New bot or mode on `@medebirrbot`: listens for `/verify {otp}` and photo uploads.
   - OCR: use `tesseract.js` (already in stack consideration) or a lightweight Cloud Vision call.
   - Marks order `paid` + triggers notification cascade.
   - *Effort: new webhook handler + OCR service.*

### 🥉 Phase C — Advanced (High Effort)
5. **Scraper Bot** (Suggestion 1, #1)
   - Dedicated bot user, `message` listener, regex price parser (`/(\d[\d,]*)\s*(birr|etb|br|k)/i`), draft → pending product.
   - *Effort: new bot process + parser + draft UI.*

6. **Inline Search Bot** (Suggestion 1, #2)
   - `inline_query` handler, returns `InlineQueryResultArticle` cards.
   - *Effort: new bot scope (needs `@BotFather` inline permission) + search API.*

---

## 4. Risks & Caveats

- **Multiple bots ≠ multiple tokens on one process.** Each Telegram bot needs its own token + webhook (or shared dispatcher). Vercel serverless can host all via path routing (`/api/v1/bot/scraper`, `/api/v1/bot/inline`).
- **OCR accuracy** for Ethiopian SMS/receipt formats is variable. Recommend a **hybrid**: OCR auto-fills, seller taps "Confirm" — not fully automatic.
- **Geofence radius** must be configurable per city (Addis vs regional).
- **React hook suggestion** is moot for our vanilla stack — adapt to a plain module.

---

## 5. Proposed Next Step

Start with **Phase A** (clipboard deep-link + handshake schema). These are the highest-leverage, lowest-risk changes and directly address the "manual steps" pain point in Suggestion 3 without requiring new bot infrastructure.

**Awaiting your go-ahead to begin Phase A.**

---

## 6. Phase A — Implementation Log (2026-07-15)

**Status: DONE.** All Phase A items implemented, 28/28 tests passing, migration `1.4` applied to live Supabase.

### Phase A.1 — Frontend (Suggestion 3, Step 1)
- `public/js/views/checkout.js` `_renderPaymentDetails`: added **📋 Copy** button next to Telebirr/CBE account numbers, using `Telegram.WebApp.Clipboard.writeText` with `navigator.clipboard` + `execCommand` fallback (`CheckoutPage._copyText` / `_fallbackCopy`).
- `public/js/views/checkout.js` `_renderSuccess`: for Telebirr/CBE orders, added an **🤖 Upload Receipt to Verification Bot** deep-link (`https://t.me/medebirrbot?start=verify_order_<orderId>`) and a **delivery verification code** box showing the 4-digit OTP the buyer shares with the rider.
- `public/js/api.js`: added `Api.delivery.verifyOtp(orderId, data)` client method.
- `public/index.html`: bumped `?v=` on `api.js` (6→7) and `checkout.js` (2→3).

### Phase A.2 — Backend (Suggestion 2, Item 3)
- `backend/src/utils/otp.js`: `generateOTP(4)` — crypto.randomInt → zero-padded 4-digit code.
- `backend/src/utils/geo.js`: `haversineKm` + `withinRadius` (geofence; returns `true` when coords missing so it only blocks when both positions exist).
- `backend/src/db/schema.sql` + **new `migration_1.4.sql`**: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS` for `delivery_otp`, `delivery_latitude`, `delivery_longitude`, `rider_latitude`, `rider_longitude`. **Applied to live DB via pooler.**
- `backend/src/routes/orders.js`: generates `delivery_otp` on every new order; stores optional `delivery_latitude`/`delivery_longitude` when the client sends them; OTP returned in the order payload.
- `backend/src/routes/delivery.js`: new `POST /api/v1/delivery/:orderId/verify-otp` — validates the OTP, runs the geofence check (radius via `GEOFENCE_RADIUS_METERS`, default 200m), sets `qr_verified_by_rider` + rider coords, and completes delivery if the buyer already confirmed. Integrates cleanly with the existing QR handshake.

### Notes / follow-ups
- The checkout flow still uses sub-city/landmark (no map pin), so `delivery_latitude/longitude` are null until the buyer Mini App sends a pinned location. The geofence therefore only enforces when both coordinates exist — safe default.
- The Verification Bot (`/verify_order_<id>`) deep-link is wired on the frontend; the actual bot-side OCR handler is **Phase B** (not yet built).
- Push to `main` to deploy (Vercel auto-deploy).

**Next: Phase B** — extend Notification Bot to riders; build Payment Verification Bot with OCR.

---

## 7. Phase 2 — Flexible Delivery Assignment (2026-07-15)

**Status: DONE.** The rider can now be the **seller himself**, a **named rider**, or a **future local delivery company**. Verification codes (OTP + QR) are generated for **every** order regardless of who delivers. 28/28 tests pass; migration `1.5` applied to live Supabase.

### Backend
- `backend/src/db/migration_1.5.sql` + `schema.sql`: added `delivery_provider VARCHAR(20) DEFAULT 'rider'` (values: `self`, `rider`, `company`). **Applied to live DB.**
- `backend/src/routes/orders.js` `PUT /:orderId/dispatch`:
  - Accepts `delivery_provider`. Validation per type:
    - `self` → no rider info required; defaults rider name to "<Store> (Self-delivery)", phone to store `business_phone`.
    - `rider` → name + phone required (unchanged behavior).
    - `company` → company name required, phone optional (future-ready; integration TBD).
  - Buyer notification label adapts ("<Store> is delivering" / "Delivery partner: X" / rider name).
  - Order is still marked `dispatched` for all types, so the OTP/QR handshake works identically.
- Store-orders GET and buyer-orders GET now return `delivery_otp` + `delivery_provider` so the UI can surface codes.

### Frontend
- `public/js/views/modals.js` `openAssignRider` → redesigned as **"🛵 Assign Delivery"** with a 3-way segmented selector: **🏪 I'll Deliver / 🛵 Assign Rider / 🚚 Delivery Co.** Conditional fields per choice; `_pickProvider` switches them.
- `public/js/app.js` `assignRider` → reads `window.__deliveryProvider`, validates per type, sends `delivery_provider` + rider fields. Tailored success toasts.
- `public/js/views/seller.js` `_dispatchCard` → shows a provider badge (Self-delivery / Rider / Delivery Co.) and a **Delivery Code** chip (the OTP) with a copy button, for every dispatched order.
- `public/js/views/modals.js` `openShowQR` → now also displays the **Delivery Verification Code (OTP)** alongside the QR, for the person handing over.
- `public/js/views/buyer.js` order card → shows the **delivery code** with a hint ("give this to the seller/rider at handover") for `confirmed`/`dispatched` orders.
- `public/index.html`: bumped `?v=` (api 7→8, app 6→7, buyer 5→6, seller 5→6, modals 5→6, checkout 3→4).

### Design notes
- Self-delivery reuses the existing **rider** verification slots (seller acts as the rider: Show QR / Scan Buyer / OTP). No separate flow needed.
- Local delivery-company is wired into the schema + UI now; the actual partner API/bot integration is a future Phase B item.
- OTP is generated at order creation and QR at payment confirmation for **all** orders — codes exist independent of delivery provider.

**Push to `main` to deploy (Vercel auto-deploy).**

---

## 8. Phase B — Payment Verification Bot (Hybrid) (2026-07-15)

**Status: DONE.** Built the Payment Verification Bot flow the user approved (hybrid: buyer sends receipt → seller confirms in Telegram; **no OCR**). 28/28 tests pass; migration `1.6` applied to live Supabase.

Decided with user: **Hybrid (seller confirms)** — chosen over full OCR (no OCR lib/key in repo) and caption-only.

### Backend
- `backend/src/db/migration_1.6.sql` + `schema.sql`: new `payment_verifications` table (order_id, buyer_tg_user_id, photo_file_id, transaction_note, status). **Applied to live DB.**
- `backend/src/routes/payments.js`: extracted `async markOrderPaid(order, transactionCode)` (payment record + stock deduction + QR/receipt + buyer/seller notifications) and exported it on `router.markOrderPaid`. `confirm-tx` route now reuses it.
- `backend/src/routes/bot.js` (webhook) additions:
  - `/start verify_order_<id>` deep link → creates a pending verification, instructs buyer to send the screenshot (already wired on the checkout success screen in Phase A).
  - Private-chat photo while a verification is pending → `handleReceiptPhoto` forwards the photo to the **seller** via Telegram with **✅ Confirm Payment / ❌ Reject** inline buttons (status `pending_seller_confirm`), and ACKs the buyer.
  - Buyer text while pending (e.g. TX ID) → stored as `transaction_note`.
  - `confirm_pay_<id>` callback → calls `payments.markOrderPaid`, marks verification `confirmed`, edits the seller message, notifies buyer. `reject_pay_<id>` → marks `rejected` and asks buyer to resend.
- Group product-photo detection is untouched (private-chat receipts are routed first).

### Notes / limitations
- **Rider Telegram notifications** (the other Phase B item) were not added: the dispatch flow only captures rider **name + phone**, not a Telegram ID, so the bot can't DM a rider. For self-delivery the seller is the rider and is already notified. Capturing a rider TG username is a future enhancement.
- OCR was intentionally deferred per the user's choice; the flow is human-confirmed and works without external services.

**Push to `main` to deploy (Vercel auto-deploy). Next: Phase C — Scraper Bot + Inline Search Bot (require new bot tokens/inline permissions).**

---

## 9. OCR on Payment Screenshots → PDF Receipt (2026-07-15)

**Status: DONE.** Per user request, the buyer's payment screenshot is now OCR'd (Tesseract.js, no key) and the extracted transaction reference + amount are stored and **embedded into the PDF receipt** as a "Payment Proof" block. Kept as a best-effort assist on top of the seller-confirm flow (never auto-marks paid). 28/28 tests pass; migration `1.7` applied to live Supabase.

### Engine
- **Tesseract.js v5** added to root `package.json` and installed (`npm install` → 65 packages). Wrapped in `backend/src/services/ocr.js` with a `parseReceipt` that extracts TX refs (`FT…`, `TBX…`, `TXN…`, `TID…`, generic "transaction/ref/tid" patterns) and amounts (`Br / ETB / Birr`). Best-effort: any failure degrades gracefully to the existing hybrid flow.

### Backend
- `backend/src/services/telegram.js`: new `downloadTelegramFileBuffer(fileId)` returns raw bytes of a Telegram photo (used to OCR the receipt).
- `backend/src/routes/bot.js` `handleReceiptPhoto`: downloads the screenshot, runs OCR, stores `ocr_tx_ref`/`ocr_amount`/`ocr_text` on `payment_verifications`, and the seller's confirm message now shows the **detected TX + amount** so they just tap confirm.
- `backend/src/routes/payments.js` `markOrderPaid(order, txCode, paymentProof)`: now stores a `payment_proof` JSONB `{ source:'screenshot_ocr', tx_ref, amount, verified_at }` on the order (and sets `transaction_code` from the OCR ref).
- `backend/src/services/receipt.js`: renders a green **"PAYMENT PROOF · verified from screenshot"** block (TX + amount) on the PDF receipt.
- `backend/src/db/migration_1.7.sql` + `schema.sql`: `payment_verifications.ocr_tx_ref/ocr_amount/ocr_text` and `orders.payment_proof` JSONB. **Applied to live DB** (verified all 4 columns).
- Buyer orders GET now returns `payment_proof`; `public/js/views/buyer.js` shows a "✅ Payment verified from screenshot · TX …" badge.

### Notes / caveats
- Tesseract.js fetches wasm + `eng` traineddata from a CDN at runtime — works on Vercel but adds latency on cold starts. Accuracy on Ethiopian receipts varies; that's why it only *assists* the human confirm. The service is structured so a cloud OCR (Vision/Azure) can replace `recognize()` via env var later.
- `punycode` deprecation warning from a tesseract transitive dep is harmless.

**Push to `main` to deploy.** Next: Phase C (Scraper Bot + Inline Search Bot).

---

## 10. Phase C — Inline Search Bot + Scraper hardening (2026-07-15)

**Status: DONE (inline search) + scraper price parsing hardened.** Built the **Inline Search Bot** on the *existing* `@medebirrbot` (no extra token) and strengthened the already-present group-photo scraper.

### Inline Search Bot (`backend/src/routes/bot.js`)
- Webhook now handles `update.inline_query` (new `handleInlineQuery`). `inline_query` added to `allowed_updates` in `set-webhook`.
- Searches `products` joined to `verified` stores by `title ILIKE` / `description ILIKE` / `store_name ILIKE`, ordered by `order_count DESC`, limited to 20.
- Each result is an `InlineQueryResultArticle` whose `reply_markup` "🛒 Buy Now" button is a **`web_app`** deep link to `${FRONTEND_URL}?start=product_<id>` — which `public/js/app.js` `_handleDeepLink` already opens via `openProduct()`. Empty query returns a usage tip. Errors answer with empty results so the query never hangs.

**How a user uses it:** type `@medebirrbot shoes` in any Telegram chat → live product cards appear → tap sends a card with a Buy Now button → opens the Medebirr Mini App on that product. This is the viral discovery loop from Suggestion 1, #2.

### Scraper hardening (`backend/src/services/telegram.js`)
- `parseCaptionForProduct` price regex broadened to `/(\d[\d,\.]*)\s*(birr|br|etb|k)\b/i` (was case-sensitive `Birr|Br|ETB` only) and now supports the `k` thousands suffix (e.g. `5k` → 5000). Same fix applied to the photo-message `hasPrice` sniff in `bot.js`. The group-photo → pending-product → seller-DM flow (Suggestion 1, #1) is therefore more forgiving on price formats.

### Deployment prerequisites (one-time, external)
- **Enable inline mode** for `@medebirrbot` via BotFather → `/setinline` (pick any placeholder, e.g. `search`).
- **Re-run `POST /api/v1/bot/set-webhook`** so Telegram starts delivering `inline_query` updates (allowed_updates changed).

### Why no dedicated separate Scraper Bot token yet
- A fully separate bot (`SCRAPER_BOT_TOKEN` + its own webhook route) is possible but requires a new BotFather token and extra webhook wiring. The core scraper behavior already lives in the main bot's group detection, so the dedicated-token split is deferred — the inline search (the higher-value, harder-to-fake discovery surface) ships now with zero new credentials. To split later: add `SCRAPER_BOT_TOKEN`, mirror `api/index.js` to mount a second bot router, and set that bot's webhook.

**Push to `main` to deploy (after re-setting the webhook).**

---

## 11. Dedicated Scraper Bot + Inline Search Bot (2026-07-15)

**Status: DONE.** Wired the two dedicated bots the user created in BotFather:
- **Scraper Bot** `Medeb_Scrapperbot` (`SCRAPER_BOT_TOKEN`) — DM-based draft creation.
- **Inline Search Bot** `Medeb_Searchbot` (`SEARCH_BOT_TOKEN`) — inline product search.

### Backend changes (`backend/src/routes/bot.js`, `backend/src/services/telegram.js`)
- `tgCall(method, params, botToken)` is now **token-aware** (defaults to `TELEGRAM_BOT_TOKEN`). `downloadProductImages` and `downloadTelegramFileBuffer` also accept a `botToken` so files sent to a *different* bot are fetched with the right token (file access is per-bot). Removed the now-unused `TG_API` const.
- **Scraper Bot webhook** `POST /api/v1/bot/scraper/webhook` → `handleScraperMessage(msg, token)`:
  - Resolves the seller's store by `admin_tg_user_id` (DM context, not group).
  - Photo + price (or `/sell`) → creates a `pending_products` draft (same pipeline as group detection), downloads images via the **scraper** token, then notifies the seller via the **main** bot (`notifySellerNewProduct`) with the "Complete Listing" button.
  - `/start` → usage; no linked store → "register via @medebirrbot first".
- **Search Bot webhook** `POST /api/v1/bot/search/webhook` → `handleInlineQuery(inlineQuery, token)` (reused, now token-scoped) + `/start` welcome.
- **`POST /api/v1/bot/set-webhook-all`** (requireAuth) sets webhooks for all three bots in one call, each with its own path + `allowed_updates` (scraper: message/callback; search: inline_query only).
- Main bot keeps its inline handler too (redundant but harmless; user can @ either bot).

### Env vars (local `backend/.env`, gitignored — NOT committed)
Added `SCRAPER_BOT_TOKEN`, `SCRAPER_BOT_USERNAME`, `SEARCH_BOT_TOKEN`, `SEARCH_BOT_USERNAME`. **Also must be added to Vercel project env** before deploy.

### Deployment steps (one-time, after pushing to `main`)
1. In Vercel, add the 4 new bot env vars (`SCRAPER_BOT_TOKEN`, `SCRAPER_BOT_USERNAME`, `SEARCH_BOT_TOKEN`, `SEARCH_BOT_USERNAME`).
2. BotFather → `/setinline` on `Medeb_Searchbot` (enables inline mode).
3. Call `POST /api/v1/bot/set-webhook-all` (authed) to register all three webhooks (uses `APP_URL` + `TELEGRAM_WEBHOOK_SECRET`).
4. (Optional) `/setinline` on `medebirrbot` too if you want inline there as well.

28/28 tests pass; `bot.js` + `telegram.js` pass `node --check`.
