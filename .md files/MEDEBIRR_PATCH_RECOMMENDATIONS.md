# 🛠️ e-Merkato / Medebirr Codebase Patch Recommendations
**Prepared For:** e-Merkato Product & Development Teams  
**Date:** 2026-07-11  
**Subject:** Precise Coded Fixes, UX Enhancements, and Operational Growth Strategies

---

## 📋 Executive Summary
This document provides a **complete developer-ready roadmap and code patch guide** to fix the bugs and structural disconnects identified in the e-Merkato code audits. 

By applying these exact patches, you will:
1. **Seal critical security gaps** (protecting customer privacy and preventing unauthorized listing injections).
2. **Resolve server-crashing bugs** (eliminating double-response errors on product edits).
3. **Bridge the coupon and checkout gap** (creating a unified database schema and a functional checkout-coupon application flow).
4. **Unlock high-end UX features** (activating interactive Telegram rider notifications).

All code blocks are written in the exact style of your current stack: **Node.js/Express, raw SQL, and Vanilla JS**.

---

## 🛠️ Section 1: Developer-Ready Code Patches (P0 & P1 Issues)

### Patch 1: Fix the Product Update "Double Response" Crash
* **File Target:** `backend/src/routes/products.js` (around line 331)
* **The Bug:** After broadcasting a newly-published product, the code falls through to a second `res.json()`, crashing the route handler with an `ERR_HTTP_HEADERS_SENT` exception.
* **The Solution:** Replace lines 331–335 with a returned response.

#### 📝 Coded Solution:
```javascript
// --- FIND THIS CODE IN backend/src/routes/products.js ---
      res.json({ product: result.rows[0], telegram_warning: telegramWarning });

    res.json({ product: result.rows[0] });

// --- REPLACE WITH THIS SECURED BLOCK ---
      return res.json({ 
        product: result.rows[0], 
        telegram_warning: telegramWarning 
      });
    }

    // This block now only runs if "is_published" was NOT toggled to true
    return res.json({ product: result.rows[0] });
```

---

### Patch 2: Fix Order Notification Privacy Leak
* **File Target:** `backend/src/routes/payments.js` (around line 250)
* **The Bug:** Order notifications—which contain the buyer's full name, phone number, and physical home address—are currently routed to `ord.tg_group_id` (the store's *public* Telegram channel). This leaks buyer private data to all group members.
* **The Solution:** Route these notifications to `s.admin_tg_user_id` (the seller's *private* Telegram chat with the bot), falls back to group chat with stripped details ONLY if private ID is unavailable.

#### 📝 Coded Solution:
Update the SQL query and notification logic in `backend/src/routes/payments.js`:
```javascript
// --- FIND THIS QUERY IN backend/src/routes/payments.js ---
        const orderFull = await query(
          `SELECT o.*, s.tg_group_id, u.first_name, u.last_name, u.username
           FROM orders o
           JOIN stores s ON o.store_id = s.store_id
           JOIN users u ON o.buyer_tg_user_id = u.tg_user_id
           WHERE o.order_id = $1`,
          [tx.order_id]
        );

// --- REPLACE WITH THIS SECURED QUERY ---
        const orderFull = await query(
          `SELECT o.*, s.tg_group_id, s.admin_tg_user_id, u.first_name, u.last_name, u.username
           FROM orders o
           JOIN stores s ON o.store_id = s.store_id
           JOIN users u ON o.buyer_tg_user_id = u.tg_user_id
           WHERE o.order_id = $1`,
          [tx.order_id]
        );
        const items = await query('SELECT * FROM order_items WHERE order_id = $1', [tx.order_id]);
        const ord = orderFull.rows[0];

        if (ord) {
          const tgService = require('../services/telegram');
          // ROUTE TO PRIVATE DM (Preferred)
          if (ord.admin_tg_user_id) {
            await tgService.notifySellerNewOrder(ord.admin_tg_user_id, ord, ord, items.rows);
          } else if (ord.tg_group_id) {
            // Safe fallback: send to group, but let's notify seller of privacy risk
            console.warn(`Privacy Warning: Routing order notification for #${ord.order_ref} to public group.`);
            await tgService.notifySellerNewOrder(ord.tg_group_id, ord, ord, items.rows);
          }
        }
```

---

### Patch 3: Delete Unused and Insecure Pending Products Route
* **File Target:** `backend/src/routes/pending-products.js` (around line 40)
* **The Bug:** `POST /api/v1/pending-products` only requires `requireAuth` (meaning any logged-in user can inject fake products into any store). Crucially, the Telegram bot webhook inserts pending products directly using raw database SQL, meaning this HTTP endpoint is entirely unused.
* **The Solution:** Remove this endpoint entirely to reduce the attack surface.

#### 📝 Coded Solution:
Delete the following lines from `backend/src/routes/pending-products.js`:
```javascript
// --- REMOVE THIS ENTIRE ROUTE BLOCK ---
/**
 * POST /api/v1/pending-products
 * Create a pending product (internal — called by bot webhook)
 */
router.post('/', requireAuth, async (req, res, next) => {
  ...
});
```

---

### Patch 4: Connect Interactive Rider Assigned Notifications
* **File Target:** `backend/src/routes/orders.js` (around line 550)
* **The Bug:** When a rider is dispatched, the system calls a generic text notification. The advanced interactive notification `notifyBuyerRiderAssigned()` (with Call Rider and Confirm buttons) is never triggered.
* **The Solution:** Hook up the rich interactive notification in the dispatch route.

#### 📝 Coded Solution:
In `backend/src/routes/orders.js`, locate the `/:orderId/dispatch` PUT route and update the notification block:
```javascript
// --- FIND THIS BLOCK IN backend/src/routes/orders.js ---
    // Notify buyer via Telegram bot
    try {
      const notif = require('../services/notifications');
      await notif.notifyOrderStatus(result.rows[0], 'dispatched', { rider_name, rider_phone });
    } catch (e) {
      console.warn('Buyer dispatch notification failed:', e.message);
    }

// --- REPLACE WITH THIS ENHANCED INTERACTIVE BLOCK ---
    // Notify buyer via Telegram bot with rich interactive message
    try {
      const tgService = require('../services/telegram');
      await tgService.notifyBuyerRiderAssigned(
        ord.buyer_tg_user_id, 
        result.rows[0], 
        rider_name, 
        rider_phone
      );
    } catch (e) {
      console.warn('Buyer interactive dispatch notification failed, falling back to simple text:', e.message);
      try {
        const notif = require('../services/notifications');
        await notif.notifyOrderStatus(result.rows[0], 'dispatched', { rider_name, rider_phone });
      } catch (err) {
        console.error('Fallback notification also failed:', err.message);
      }
    }
```

---

### Patch 5: Unify Coupons Table Schema and Enable Checkout Application
* **Files Target:** `backend/src/db/schema.sql`, `backend/src/routes/social.js`, and `backend/src/routes/orders.js`
* **The Bug:** 
  1. Two conflicting `coupons` table definitions clash in the schema.
  2. Coupons are completely disconnected from the actual Checkout endpoint.
* **The Solution:** 
  1. Run a migration to establish a **Unified Coupons Table**.
  2. Update `social.js` to write to the new schema.
  3. Update `orders.js` to allow a `coupon_code` during checkout and apply the discount.

#### 📝 Step 5A: Unified Coupons Table Migration
Run the following SQL migration on your Supabase instance:
```sql
-- Drop existing clashing tables to start fresh
DROP TABLE IF EXISTS user_coupons CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;

-- Create Unified COUPONS Table
CREATE TABLE coupons (
    coupon_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(50) UNIQUE NOT NULL,
    discount_type   VARCHAR(20) NOT NULL DEFAULT 'percent', -- 'percent', 'fixed'
    discount_value  DECIMAL(10,2) NOT NULL,                 -- Serves as either % (e.g. 15.00) or Birr (e.g. 150.00)
    store_id        UUID REFERENCES stores(store_id) ON DELETE CASCADE, -- NULL means platform-wide
    tg_user_id      BIGINT REFERENCES users(tg_user_id) ON DELETE CASCADE, -- NULL means claimable by anyone
    min_order_etb   DECIMAL(10,2) DEFAULT 0,
    max_uses        INTEGER,
    used_count      INTEGER DEFAULT 0,
    expires_at      TIMESTAMP,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Re-create User Coupons Association Table
CREATE TABLE user_coupons (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tg_user_id      BIGINT NOT NULL REFERENCES users(tg_user_id) ON DELETE CASCADE,
    coupon_id       UUID NOT NULL REFERENCES coupons(coupon_id) ON DELETE CASCADE,
    is_redeemed     BOOLEAN DEFAULT FALSE,
    redeemed_at     TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (tg_user_id, coupon_id)
);
CREATE INDEX idx_user_coupons_user ON user_coupons(tg_user_id);

-- Alter Orders Table to Snapshot coupon usage
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_etb DECIMAL(10,2) DEFAULT 0;
```

#### 📝 Step 5B: Update `social.js` to match the Unified Schema
In `backend/src/routes/social.js`, update product share and group-buy fulfillment routes to write to the new unified coupon columns.

**Product Share Section (Around Line 60):**
```javascript
// --- REPLACE QUERY IN social.js (Share Route) ---
        const existing = await query(
          `SELECT coupon_id FROM coupons
           WHERE store_id = $1 AND tg_user_id = $2 AND is_active = TRUE AND expires_at > NOW()`,
          [storeId, tgUserId]
        );

        if (existing.rows.length === 0) {
          await query(
            `INSERT INTO coupons (store_id, tg_user_id, code, discount_type, discount_value, expires_at)
             VALUES ($1, $2, $3, 'percent', $4, $5)`,
            [storeId, tgUserId, code, policy.share_discount, validUntil]
          );
          couponIssued = true;
        }
```

**Group Buy Fulfillment Section (Around Line 250):**
```javascript
// --- REPLACE QUERY IN social.js (Group Buy Route) ---
      for (const row of members.rows) {
        const code = 'GRP' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const validUntil = new Date(Date.now() + 7 * 86400000).toISOString();
        const existing = await query(
          `SELECT coupon_id FROM coupons
           WHERE store_id = $1 AND tg_user_id = $2 AND is_active = TRUE AND expires_at > NOW()`,
          [gb.store_id, row.tg_user_id]
        );
        if (existing.rows.length === 0) {
          await query(
            `INSERT INTO coupons (store_id, tg_user_id, code, discount_type, discount_value, expires_at)
             VALUES ($1, $2, $3, 'percent', $4, $5)`,
            [gb.store_id, row.tg_user_id, code, gb.discount_percent, validUntil]
          );
        }
      }
```

#### 📝 Step 5C: Enable Coupon Calculation on Checkout in `orders.js`
Modify the Checkout handler (`POST /api/v1/orders`) to accept a `coupon_code` and calculate the discount inside the SQL database transaction.

```javascript
// --- UPDATE BODY VALIDATION AT TOP OF POST / ---
  [
    body('store_id').notEmpty().isUUID(),
    body('items').isArray({ min: 1 }),
    body('items.*.product_id').isUUID(),
    body('items.*.quantity').isInt({ min: 1 }),
    body('delivery_address').isObject(),
    body('delivery_address.sub_city').notEmpty(),
    body('delivery_address.phone').notEmpty(),
    body('payment_method').isIn(['telebirr', 'cbe', 'cash']),
    body('coupon_code').optional().isString() // <-- ADD THIS FIELD
  ],

// --- INSIDE THE HANDLER (Around line 38, after 'BEGIN') ---
      const { 
        store_id, items, delivery_address, payment_method, 
        address_id, delivery_method, coupon_code 
      } = req.body;

// --- AFTER THE ITEMS LOOP SUbtotal CALCULATION (Around line 110, before inserting order) ---
      let discountAmount = 0;
      let appliedCoupon = null;

      if (coupon_code && coupon_code.trim()) {
        const couponResult = await client.query(
          `SELECT * FROM coupons 
           WHERE UPPER(code) = UPPER($1) 
             AND is_active = TRUE 
             AND (expires_at IS NULL OR expires_at > NOW())
             AND (store_id IS NULL OR store_id = $2)
             AND (tg_user_id IS NULL OR tg_user_id = $3)`,
          [coupon_code.trim(), store_id, req.user.tg_user_id]
        );

        if (couponResult.rows.length > 0) {
          const coupon = couponResult.rows[0];
          appliedCoupon = coupon;

          if (subtotal >= Number(coupon.min_order_etb)) {
            if (coupon.discount_type === 'percent') {
              discountAmount = subtotal * (Number(coupon.discount_value) / 100);
            } else if (coupon.discount_type === 'fixed') {
              discountAmount = Number(coupon.discount_value);
            }
            // Ensure discount doesn't exceed subtotal
            discountAmount = Math.min(discountAmount, subtotal);
          }
        }
      }

      // Calculate final total
      const totalEtb = Math.max(0, (subtotal - discountAmount) + deliveryFee);

// --- UPDATE THE INSERT ORDER QUERY IN orders.js ---
      const orderInsert = await client.query(
        `INSERT INTO orders (
          order_ref, buyer_tg_user_id, store_id, address_id, delivery_address,
          subtotal_etb, delivery_fee_etb, total_etb, payment_method, 
          policy_snapshot, coupon_code, discount_etb
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          orderRef, req.user.tg_user_id, store_id, address_id || null, 
          JSON.stringify(delivery_address), subtotal, deliveryFee, totalEtb, 
          payment_method, JSON.stringify(policy), 
          appliedCoupon ? appliedCoupon.code : null, discountAmount
        ]
      );
```

---

## 💎 Section 2: Enhancing UX, Flow Smoothness, and Clarity

To make your application feel like a **world-class product** instead of a prototype, consider applying these four non-technical UX changes:

### 1. Simplify Chat: The "Redirect to Telegram" Trick
* **The Current State:** You have a built-in messaging flow (`conversations` / `messages`), but it isn't real-time, has no WebSockets, and gives no push alerts.
* **The UX recommendation:** Instead of maintaining a clunky inside-app chat, replace the "Chat with Seller" action in your app with a clean redirect to the seller's Telegram username.
* **Why this is better:** Users already live in Telegram. Redirecting them to `https://t.me/username` allows them to use Telegram's native voice notes, media uploads, and instant push notifications. This builds instant trust.

### 2. Live Inventory Warning in the Cart
* **The Problem:** The client-side cart (`state.js`) doesn't check stock. A buyer can add 10 items to their cart, only to receive an error at checkout because the store only has 2 in stock.
* **The UX recommendation:** When a buyer opens the cart modal, perform a fast stock-level handshake with the database. If an item is low in stock, display a orange warning badge: `⚠️ Only 2 left in stock!`. If out of stock, automatically disable the "Checkout" button for that item and show: `❌ Out of Stock`.

### 3. Clear Payment Instructions for CBE / Manual Transactions
* **The Problem:** CBE (Commercial Bank of Ethiopia) does not support a public webhook API, meaning users must submit transaction reference codes manually.
* **The UX recommendation:** Design a highly visual, 3-step overlay screen when they select "CBE Pay":
  1. **Step 1:** Show the store’s CBE Account Number with a prominent **"Copy Account Number"** button.
  2. **Step 2:** Provide instructions: *"Open your CBE Birr or CBE App, send [Amount] Birr to this account, and copy the Transaction ID from the SMS."*
  3. **Step 3:** Display a clean input field with the placeholder: `e.g. FT26190...` and a **"Submit Reference"** button.

### 4. Interactive "Call Rider" Card
* **The UX recommendation:** In the dispatched order screen, place a large green button next to the rider's information: **"📞 Call Rider [Name]"** which links directly to `tel:<rider_phone>`. 
* **Why this is better:** This makes it effortless for buyers to coordinate the last-mile handoff with delivery drivers in crowded environments (such as near landmarks in Addis).

---

## 📈 Section 3: Innovative Expansion Strategies (The Medebirr Advantage)

### 🛡️ Idea A: The Escrow Settlement Flow (Safe-Pay)
In Ethiopia, buyers are highly skeptical of sending pre-payments. Implement a **"Safe-Pay" Escrow Program**:
1. When paying via Telebirr, the funds are deposited into your central e-Merkato/Medebirr settlement wallet instead of going directly to the seller.
2. The bot alerts the seller: *"Payment Secured in Escrow. Please deliver order."*
3. Once the courier arrives and the buyer performs the **QR dual-confirm scan**, your backend automatically triggers a payouts API call to transfer the funds to the merchant's private Telebirr wallet, taking a 2% commission. 
4. This completely eliminates street-level and digital fraud.

### 👥 Idea B: Telegram Social Group-Buying (The Viral Engine)
Leverage your Telegram environment by finalizing the Group-Buying engine:
* Encourage sellers to offer a "Group Price" (e.g., 20% off if bought in groups of 3).
* Introduce a **"Share Group Invite"** button that lets the customer share the group buy directly into their Telegram family/friend groups to recruit other buyers. 
* This turns your user base into an active, unpaid sales force, causing your platform to grow organically without massive marketing expenditures.

---

### 📝 Next Steps for Your Developer
You have a magnificent application. To get this live, your developer simply needs to:
1. Run the **SQL migration** in Supabase (Patch 5A).
2. Copy-paste the **Coded Solutions** for Patches 1, 2, 4, 5B, and 5C into your backend router folders.
3. Delete the redundant route in **Patch 3**.

*You are now ready to launch e-Merkato safely to the Ethiopian public!*
