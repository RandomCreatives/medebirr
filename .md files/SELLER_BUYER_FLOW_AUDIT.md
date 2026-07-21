# e-Merkato: Seller ↔ Buyer Data Flow Audit

**Date:** 2026-07-11
**Stack:** Node.js/Express + Vanilla JS SPA + PostgreSQL (Supabase)
**Version:** 1.2.4

---

## 1. Product Creation (Manual by Seller)

**Backend route(s):** `POST /api/v1/products`, `PUT /api/v1/products/:id` (`backend/src/routes/products.js`)
**Frontend handler(s):** `Modals.openAddProduct()` (`public/js/views/modals.js`), `Api.products.create()` (`public/js/api.js`)
**DB table(s):** `products`, `stores`, `seller_policies`
**Status:** ⚠️ Partial — has double response bug

**What works:**
- Seller creates product with title, description, price, stock, category, images, variants
- Backend validates with express-validator; ownership verified via `stores.admin_tg_user_id`
- If `is_published` is true AND store has `tg_group_id`, auto-broadcasts to Telegram group
- Product stored in `products` table with `image_urls[]`, `variants` JSONB, `compare_price`

**Gaps/Issues:**
- **BUG: Double response in PUT handler** (`products.js:333-335`): After `if (is_published === true)` block broadcasts to Telegram, code falls through to a second `res.json()` causing `ERR_HTTP_HEADERS_SENT` error on every product update
- No seller confirmation DM after broadcast — seller doesn't know if it succeeded

---

## 2. Telegram Product Detection (Bot Auto-Detect)

**Backend route(s):** `POST /api/v1/bot/webhook` (`backend/src/routes/bot.js:153-228`), `handlePhotoMessage()` (`bot.js:233-311`)
**Frontend handler(s):** `SellerViews.renderPending()` (`public/js/views/seller.js`), `Api.pending.list()`, `Api.pending.complete()`, `Api.pending.publish()`
**DB table(s):** `pending_products`, `stores`, `product_rate_limits`
**Status:** ✅ Working

**What works:**
- Bot webhook receives Telegram messages; verifies `X-Telegram-Bot-Api-Secret-Token`
- Photo messages from linked groups trigger product detection: parses caption for title + price
- Auto-detect fires when `store.auto_detect_products === true` or `/sell` command used
- Rate limited: max 8 products/hour/store via `product_rate_limits`
- Images downloaded from Telegram API, uploaded to Supabase Storage
- Creates `pending_products` record; seller gets Telegram DM with inline buttons
- Seller completes listing in Seller Studio, then publishes → creates real `products` record → broadcasts to group

**Gaps/Issues:**
- Only processes one image per message (media groups not handled)
- Caption parsing is fragile — title extraction takes first non-empty line
- No way to detect product posts without prices when `auto_detect_products` is OFF

---

## 3. Product Listing & Discovery (Explore Hub)

**Backend route(s):** `GET /api/v1/products/featured`, `GET /api/v1/products`, `GET /api/v1/products/:productId` (`backend/src/routes/products.js`)
**Frontend handler(s):** `BuyerViews.renderExplore()`, `BuyerViews._itemCard()`, `App.handleSearch()`, `App.handleFilter()`, `App.openProduct()` (`public/js/app.js`)
**DB table(s):** `products`, `stores`, `seller_policies`
**Status:** ✅ Working

**What works:**
- Featured products: lightweight query with aggressive cache headers
- Full search with filters: `search` (ILIKE), `category`, `sub_city`, `min/max_price`, `return_policy`
- Sort: featured, newest, price_asc/desc, rating, popular
- Only shows `is_published = TRUE AND s.status = 'verified'`
- Product detail increments `view_count`
- Infinite scroll via IntersectionObserver

**Gaps/Issues:**
- Uses `ILIKE` — sequential scan, slow at scale (should use `tsvector`/`GIN` or Meilisearch)
- Cart doesn't validate stock on add; stale prices in localStorage

---

## 4. Seller Inventory (Seller's Own Items)

**Backend route(s):** `GET /api/v1/products/seller/:storeId` (`backend/src/routes/products.js:131-153`)
**Frontend handler(s):** `SellerViews.renderInventory()` (`public/js/views/seller.js`), `Api.products.sellerList()` (`public/js/api.js`)
**DB table(s):** `products`, `stores`, `seller_policies`
**Status:** ✅ Working

**What works:**
- Separate endpoint without `s.status = 'verified'` filter — shows all products regardless of store status
- Shows unpublished products, stock levels, view counts, order counts
- Seller can edit, toggle publish, update stock/price
- Status badges: Draft, Published, Out of Stock

---

## 5. Store Page & Discovery

**Backend route(s):** `GET /api/v1/stores`, `GET /api/v1/stores/:storeId` (`backend/src/routes/stores.js`)
**Frontend handler(s):** `BuyerViews.renderShops()`, `App.openStorePage()` (`public/js/app.js`), `visitStore()` (`public/js/views/buyer.js`)
**DB table(s):** `stores`, `seller_policies`, `reviews`
**Status:** ✅ Working

**What works:**
- Public store listing: filtered by sub_city, search; sorted by rating then total_orders
- Store detail returns policies, fees, return policy
- Sanitizes sensitive fields: `cbe_account_number`, `telebirr_merchant_id`, `seller_password_hash`
- Store page shows: policies, delivery fees, payment methods, products, reviews, Telegram group link

**Gaps/Issues:**
- Password gate exists but isn't enforced in buyer flow

---

## 6. Cart Management (Client-Side)

**Backend route(s):** None — entirely client-side
**Frontend handler(s):** `State.addToCart()`, `State.removeFromCart()`, `State.updateQty()` (`public/js/state.js`), `App.addToCart()` (`public/js/app.js`)
**DB table(s):** None (localStorage only)
**Status:** ✅ Working

**What works:**
- Store-partitioned cart: items grouped by `shop_id`
- Persistence in `localStorage` under key `em_cart`
- Package subtotal and total calculation includes delivery fee

**Gaps/Issues:**
- No stock validation on add — can add unlimited quantity
- No price freshness — cart shows stale prices until checkout
- No server-side cart sync

---

## 7. Per-Store Checkout

**Backend route(s):** `POST /api/v1/orders` (`backend/src/routes/orders.js:23-208`)
**Frontend handler(s):** `Modals.openCheckout()` (`public/js/views/modals.js`), `App.placeOrder()` (`public/js/app.js`)
**DB table(s):** `orders`, `order_items`, `products`, `stores`, `seller_policies`, `delivery_addresses`
**Status:** ✅ Working

**What works:**
- Per-store checkout with full transaction (`BEGIN/COMMIT/ROLLBACK`)
- Stock locking with `SELECT ... FOR UPDATE`
- Reserved stock tracked (not deducted from `stock_quantity` until payment confirmed)
- Delivery fee from `zone_fee_matrix` JSONB
- Free delivery threshold check
- Self-buy restriction
- Payment method validation per store
- Policy snapshot stored on order
- Order items stored as snapshots

**Gaps/Issues:**
- **No coupon application at checkout** — coupon infrastructure exists but isn't integrated into order creation
- No group buy price adjustment at checkout
- Delivery fee is static per sub_city

---

## 8. Payment Processing

**Backend route(s):** `POST /api/v1/payments/telebirr/initiate`, `POST /api/v1/payments/telebirr/webhook`, `POST /api/v1/payments/cash/confirm`, `POST /api/v1/payments/confirm-tx` (`backend/src/routes/payments.js`)
**Frontend handler(s):** `Api.payments.confirmCash()`, `Api.payments.confirmTx()` (`public/js/api.js`)
**DB table(s):** `payment_transactions`, `orders`, `products`
**Status:** ✅ Working (Telebirr + Cash), ⚠️ CBE partial

**What works:**
- Telebirr API: full payload with merchant code, SHA256 signed, calls `placeOrder` API
- Telebirr webhook: verifies signature, marks paid, deducts stock, generates QR + PDF receipt, notifies seller/buyer
- Cash on delivery: marks paid + confirmed, generates QR + receipt
- Manual TX code: buyer submits transaction code after paying directly to seller's account
- Demo/mock mode in non-production

**Gaps/Issues:**
- CBE has no API — only manual TX code submission works
- Signature skipped outside production (`NODE_ENV !== 'production'`)
- No Chapa integration (removed but `chapa_secret_key` field still on stores)

---

## 9. Order Notification to Seller (Telegram DM)

**Backend route(s):** Called from `payments.js` on payment confirmation
**Frontend handler(s):** None (backend-only flow)
**DB table(s):** `orders`, `stores`, `users`, `order_items`
**Status:** ✅ Working

**What works:**
- On successful payment, seller gets Telegram DM with: order ref, buyer info, delivery address, item list, total
- Inline keyboard "Assign Rider in Studio" deep-links to seller dashboard
- Buyer also receives DM via `notifications.js:notifyOrderStatus()`

**Gaps/Issues:**
- **Notification goes to group chat (`tg_group_id`), not seller's private DM** — privacy leak (all group members see buyer's name, phone, address)
- No low-stock notification to seller
- No order confirmation notification before payment

---

## 10. Rider Assignment & Dispatch

**Backend route(s):** `PUT /api/v1/orders/:orderId/dispatch` (`backend/src/routes/orders.js:517-561`)
**Frontend handler(s):** `Modals.openAssignRider()`, `App.dispatchOrder()` (`public/js/app.js`)
**DB table(s):** `orders`, `stores`, `users`
**Status:** ⚠️ Partial

**What works:**
- Seller assigns rider name + phone
- Backend verifies ownership and order is paid
- Order status updated to `dispatched`
- Buyer notified via generic `notifyOrderStatus()`

**Gaps/Issues:**
- **`notifyBuyerRiderAssigned()` defined but never called** (`telegram.js:174-197`) — the richer function with rider details and "Confirm Delivery" button is never invoked
- Rider identified by name/phone only — no `rider_tg_user_id` field

---

## 11. QR Delivery Verification (Dual-Confirm)

**Backend route(s):** `GET /api/v1/delivery/:orderId/qr`, `POST /api/v1/delivery/:orderId/scan`, `POST /api/v1/delivery/:orderId/settle` (`backend/src/routes/delivery.js`)
**Frontend handler(s):** `Modals.openShowQR()`, `Modals.openScanQR()`, `Api.delivery.qr()`, `Api.delivery.scan()`, `Api.delivery.settle()` (`public/js/api.js`)
**DB table(s):** `orders`, `delivery_verifications`, `products`, `stores`
**Status:** ✅ Working

**What works:**
- QR code generated after payment via `qrService.generateToken()`
- Dual-confirmation: rider or buyer can scan the other's QR
- Scan attempts tracked (max 5); all logged in `delivery_verifications`
- On success: order marked `delivered`, store stats updated, order counts incremented, reserved stock released
- Manual settlement option for in-person resolution
- Auto-return on max scan attempts

**Gaps/Issues:**
- Race condition on dual-verify check — stale `qr_verified_by_buyer` data
- QR data contains sensitive info in plaintext
- `confirm-delivery` (flow #12) bypasses QR verification entirely

---

## 12. Receipt Generation

**Backend route(s):** `GET /api/v1/orders/:orderId/receipt` (`backend/src/routes/orders.js:316-514`), `GET /api/v1/delivery/:orderId/receipt` (`backend/src/routes/delivery.js:302-356`)
**Frontend handler(s):** `Modals.openOrderReceipt()`
**DB table(s):** `orders`, `order_items`, `stores`, `users`, `seller_policies`
**Status:** ✅ Working

**What works:**
- HTML receipt with print-to-PDF button
- PDF receipt generated and cached in `receipt_pdf_url`
- Both sent via Telegram `sendDocument()`
- XSS prevention via `esc()` function

**Gaps/Issues:**
- HTML receipt served without CSP (helmet CSP disabled)
- Depends on external PDF service

---

## 13. Buyer Order Management (Cancel, Confirm Delivery)

**Backend route(s):** `PUT /api/v1/orders/:orderId/confirm-delivery`, `PATCH /api/v1/orders/:orderId/cancel`, `PATCH /api/v1/orders/:orderId/cancel-seller` (`backend/src/routes/orders.js`)
**Frontend handler(s):** `App.cancelOrder()`, order card buttons in `public/js/views/buyer.js`
**DB table(s):** `orders`, `products`, `stores`, `order_items`
**Status:** ✅ Working

**What works:**
- Buyer confirms delivery → marks `delivered`, releases stock, increments order_count
- Buyer cancels pending/confirmed orders → releases stock
- Seller cancels with reason → releases stock, notifies buyer
- All send Telegram DM via `notifications.js`

**Gaps/Issues:**
- `confirm-delivery` bypasses QR verification
- No refund mechanism — no reverse Telebirr API call

---

## 14. Reviews & Ratings

**Backend route(s):** `POST /api/v1/reviews`, `GET /api/v1/reviews/product/:productId`, `GET /api/v1/reviews/store/:storeId` (`backend/src/routes/reviews.js`)
**Frontend handler(s):** `Api.reviews.create()`, `Api.reviews.list()` (`public/js/api.js`)
**DB table(s):** `reviews`, `products`, `stores`, `orders`
**Status:** ✅ Working

**What works:**
- Review requires `order_id`, `product_id`, `rating` (1-5)
- Verified: backend checks order belongs to reviewer
- One review per order-product pair (upsert on conflict)
- Product and store ratings recalculated on review create
- Product reviews public; store reviews in seller dashboard

**Gaps/Issues:**
- No seller notification on new review
- No moderation; no flag/report; text-only; no seller response

---

## 15. Social Sharing & Coupon System

**Backend route(s):** `POST /api/v1/social/share`, `GET /api/v1/social/coupons`, `POST /api/v1/stores/:storeId/coupon-policy` (`backend/src/routes/social.js`)
**Frontend handler(s):** `Modals.openShareProduct()`, `BuyerViews._renderCoupons()` (`public/js/views/buyer.js`)
**DB table(s):** `product_shares`, `coupon_policies`, `coupons`, `stores`
**Status:** ⚠️ Partial — schema conflict

**What works:**
- Share tracking records each share in `product_shares`
- Auto-coupon issuance when share count reaches threshold
- Coupon validation: expiry, usage limit, unique claim per user
- Seller configures: share_required, discount_percent, validity_days

**Gaps/Issues:**
- **CRITICAL: Two conflicting `coupons` table definitions** (`schema.sql:256` vs `schema.sql:445`) — different columns; `social.js` and `coupons.js` use incompatible schemas
- No coupon application at checkout — validated coupons can't be used
- Share tracking doesn't verify actual share happened

---

## 16. Group Buying

**Backend route(s):** `POST /api/v1/social/group-buy`, `POST /api/v1/social/group-buy/:id/join` (`backend/src/routes/social.js`)
**Frontend handler(s):** `Modals.openGroupBuys()`, `App.createGroupBuy()`, `App.joinGroupBuy()` (`public/js/views/modals.js`)
**DB table(s):** `group_buys`, `group_buy_members`, `stores`, `users`
**Status:** ✅ Working

**What works:**
- Buyer creates group buy for a product with `min_members` and `discount_percent`
- Other buyers join the group
- When `min_members` reached, status changes to `fulfilled` and coupons issued to members

**Gaps/Issues:**
- Group buy discount not applied at checkout — coupons are issued but not auto-applied
- No notification when group buy reaches threshold
- Seller doesn't see group buys — no fulfillment integration

---

## 17. Buyer-Seller Chat

**Backend route(s):** `GET /api/v1/social/conversations`, `POST /api/v1/social/conversations`, `GET /api/v1/social/conversations/:id/messages`, `POST /api/v1/social/conversations/:id/messages` (`backend/src/routes/social.js`)
**Frontend handler(s):** `Modals.openChat()`, `BuyerViews.renderProfile()` chat inbox, `Api.social.*` (`public/js/api.js`)
**DB table(s):** `conversations`, `messages`, `stores`, `users`
**Status:** ✅ Working

**What works:**
- Buyer starts conversation with store, optionally linked to a product
- Message exchange with `sender_tg_user_id`, `message_text`, `is_read` flag
- Read receipts on conversation load
- Conversation list with unread count, linked product title
- Both buyer and seller can access via authorization check

**Gaps/Issues:**
- No real-time messaging — no WebSocket or polling
- No Telegram notification for new messages
- No image/file support in chat
- Seller can't proactively message buyer — only reply to existing conversations

---

## Summary Table

| # | Flow | Status | Key Issue |
|---|------|--------|-----------|
| 1 | Product Creation (Manual) | ⚠️ Partial | Double response bug in PUT handler |
| 2 | Telegram Product Detection | ✅ Working | Single image only; fragile parsing |
| 3 | Product Listing & Discovery | ✅ Working | ILIKE slow at scale |
| 4 | Seller Inventory | ✅ Working | — |
| 5 | Store Page & Discovery | ✅ Working | Password gate not enforced |
| 6 | Cart Management | ✅ Working | No stock validation; stale prices |
| 7 | Per-Store Checkout | ✅ Working | No coupon application |
| 8 | Payment Processing | ✅ Working | CBE partial; sig skip outside prod |
| 9 | Order Notifications | ✅ Working | Privacy leak (group, not DM) |
| 10 | Rider Assignment & Dispatch | ⚠️ Partial | `notifyBuyerRiderAssigned()` never called |
| 11 | QR Delivery Verification | ✅ Working | Race condition; plaintext QR |
| 12 | Receipt Generation | ✅ Working | No CSP; external PDF dependency |
| 13 | Buyer Order Management | ✅ Working | Bypasses QR; no refund |
| 14 | Reviews & Ratings | ✅ Working | No moderation; no seller response |
| 15 | Social Sharing & Coupons | ⚠️ Partial | **CRITICAL**: Schema conflict; no checkout integration |
| 16 | Group Buying | ✅ Working | No checkout integration |
| 17 | Buyer-Seller Chat | ✅ Working | No real-time; no Telegram alert |

---

## Top 5 Critical Fixes

1. **Fix `coupons` table schema conflict** — Two `CREATE TABLE IF NOT EXISTS coupons` with different columns
2. **Fix double response bug in `PUT /products/:id`** — `products.js:333-335` sends two responses
3. **Fix notification privacy leak** — Order details sent to group instead of seller DM
4. **Call `notifyBuyerRiderAssigned()` in dispatch flow** — Function exists but never invoked
5. **Apply coupons at checkout** — Coupon infrastructure exists but no integration with order creation
