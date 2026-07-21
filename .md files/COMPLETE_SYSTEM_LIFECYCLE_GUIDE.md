# End-to-End System Lifecycle: 1,000 Sellers & 100,000 Buyers
## Complete Technical Architecture & Operational Guide for GroupCommerce TMA

This document provides an exhaustive explanation of the 7 core pillars governing your Telegram Mini App marketplace in Ethiopia.

---

## 1. Sign Up, Sign In & Cryptographic Authentication

Unlike traditional web e-commerce platforms requiring email/password registration, a Telegram Mini App leverages Telegram's native cryptographic identity. This eliminates friction and achieves **1-tap instant onboarding**.

### A. Buyer Authentication Flow
1. **App Launch:** A user taps the `[🛍️ Open Store Hub]` button inside any Telegram channel or bot chat.
2. **Data Injection:** Telegram automatically injects a cryptographically signed payload into the browser window: `window.Telegram.WebApp.initDataUnsafe.user`.
   ```json
   {
     "id": 12893412,
     "first_name": "Mike",
     "last_name": "Fikadu",
     "username": "Mike_Fikadu",
     "language_code": "en",
     "photo_url": "https://t.me/i/userpic/320/Mike.jpg"
   }
   ```
3. **HMAC-SHA256 Backend Verification:** To prevent attackers from spoofing another user's Telegram ID, the frontend transmits `window.Telegram.WebApp.initData` (the raw string) to your Node.js/FastAPI backend API gateway (`POST /api/v1/auth/telegram`).
4. **Token Generation:** The backend validates the SHA256 signature against your Telegram Bot Token. If valid, it provisions or updates the user in the `users` PostgreSQL table and issues an encrypted **JSON Web Token (JWT)** stored in `localStorage` for API sessions.

---

## 2. Seller Verification & Onboarding

To prevent fraud among 1,000 autonomous shops, sellers must undergo a structured verification pipeline before their items appear in the 100k Buyer Hub.

### Step-by-Step Seller Verification Flow:
1. **Group / Channel Linkage:** A prospective seller adds your platform bot (`@ShopGramEtBot`) as an **Administrator** to their Telegram sell/buy group or broadcast channel.
2. **Initiating Verification:** Inside their group chat, the seller types `/register_shop`. The bot verifies the sender is the group creator/admin and replies with a private application link: `[🏬 Complete Shop Verification]`.
3. **KYC & Account Submission (Inside Mini App):**
   * **Store Identity:** Legal Store Name, Physical Location in Addis Ababa (e.g., Bole Sub-City, Woreda 03), Business Phone Number.
   * **Settlement Verification:** Inputting Telebirr Merchant Shortcode (e.g., `891204`) or Commercial Bank of Ethiopia (CBE) Account Number.
   * **ID / License Upload:** Uploading a photo of their Ethiopian Kebele ID or Trade License.
4. **Platform Admin Approval:** Platform moderators review the submission in an internal admin portal. Once approved, the shop's status flips to `verified = TRUE` and they receive a **Gold Checkmark Badge (✓)** on all their listed items.

---

## 3. Cart Management (Store-Isolated Multi-Cart)

In a marketplace with 1,000 independent sellers, a standard single-checkout cart creates immense liability. If a buyer adds items from 3 distinct shops, we use a **Store-Partitioned Cart Architecture**.

### Technical Cart Architecture:
* **Client-Side Persistence:** The active cart state is persisted in `window.localStorage.getItem('bekollo_cart')` and synced to Redis (`HSET cart:user_12893412`) every time an item is added.
* **Automatic Store Partitioning Algorithm:**
  When a buyer opens their cart, the frontend groups items by `shop_id`:
  ```javascript
  // Cart grouping logic
  {
    "shop_bole_gadgets": {
      "shopName": "Bole Apple & Tech Hub",
      "deliveryFee": 200,
      "items": [
        { "id": 101, "title": "iPhone 15 Pro Max", "price": 165000, "qty": 1 }
      ],
      "subtotal": 165000,
      "total": 165200
    },
    "shop_shiro_meda": {
      "shopName": "Shiro Meda Heritage Textile",
      "deliveryFee": 150,
      "items": [
        { "id": 102, "title": "Habesha Kemis", "price": 4500, "qty": 1 }
      ],
      "subtotal": 4500,
      "total": 4650
    }
  }
  ```
* **Store-by-Store Checkout:** The buyer initiates checkout *per shop package*. This ensures that when they click "Checkout from Bole Tech Hub", they agree solely to Bole Tech Hub's return rules and pay directly to Bole Tech Hub.

---

## 4. Payment Management (Direct Zero-Escrow Settlement)

To eliminate central platform escrow liability and settle funds instantly to merchants, payments run peer-to-peer via verified gateway APIs.

### A. Telebirr SuperApp Push / H5 API Flow
1. **Order Initiation:** Buyer confirms an order of `Br 165,200` for `Bole Apple & Tech Hub`.
2. **Direct Payload Construction:** Backend sends a Pre-Order request to Telebirr API configured with the *seller's verified merchant ID*:
   ```json
   {
     "appId": "TELEBIRR_APP_ID",
     "merchantCode": "891204", // Directly to Seller's Telebirr account!
     "outTradeNo": "ORD-20260706-9921",
     "totalAmount": "165200.00",
     "notifyUrl": "https://api.bekollo.com/v1/webhooks/telebirr"
   }
   ```
3. **Instant Settlement:** The buyer inputs their 4-digit Telebirr PIN on their mobile phone. Telebirr deducts `Br 165,200` from the buyer and credits `Br 165,200` directly to the seller's merchant account.
4. **Webhook Reconciliation:** Telebirr posts a signed notification to `/api/webhooks/telebirr`. Our backend verifies the cryptographic signature, updates the order status in PostgreSQL to `PAID`, and instantly triggers a Telegram Bot dispatch alert to the seller.

---

## 5. Delivery & Logistics Management (Seller-Managed)

Because each seller autonomously manages their logistics, the platform acts as a standardized **Geographic Dispatch Engine**.

### Sub-City Fee Matrix
In their Seller Studio, each shop defines a JSON fee matrix based on Addis Ababa sub-cities and regional zones:
```json
{
  "Bole": 150,
  "Kirkos": 150,
  "Yeka": 200,
  "Nifas_Silk": 200,
  "Akaki_Kality": 300,
  "Regional_Bus_Dispatch": 400
}
```

### Order Fulfillment & Rider Dispatch Flow:
1. **Address Selection:** During checkout, the buyer selects their sub-city (`Bole Woreda 03`), specific house number/landmark (`Near Edna Mall`), and phone number. The exact delivery fee (`Br 150`) is added to that store's invoice.
2. **Seller Notification:** Once paid, the seller receives a structured Telegram card in their private management channel:
   ```
   📦 NEW PAID ORDER #9921
   👤 Buyer: Mike Fikadu (@Mike_Fikadu)
   📱 Phone: +251 911 234 567
   📍 Destination: Bole Woreda 03, Near Edna Mall
   💰 Payout Received: Br 165,350 (Telebirr Verified)
   [🛵 Assign Store Rider]  [📞 Call Buyer]
   ```
3. **Rider Assignment:** When the shop admin clicks `[🛵 Assign Store Rider]`, they input their rider's name and phone number. An automated Telegram bot alert is sent to the buyer: *"Rider Abebe (+251 922...) has picked up your order!"*

---

## 6. How Sellers Add Items & Inventory Management

To handle huge daily traffic without overselling during viral drops, item publishing and inventory management combine SQL persistence with Redis high-speed caching.

### A. Publishing a New Item (Seller Studio Flow)
1. **Item Creation Form:** Seller opens **Seller Studio -> + New Item**. They upload up to 4 photos, input title, price (`Br`), stock quantity, category, and select variant options (Sizes: S, M, L / Colors).
2. **Dual-Broadcasting Strategy:** When the seller clicks **Publish**:
   * **Database & Indexing:** Item is saved to PostgreSQL `products` table and instantly indexed into **Meilisearch** (`<50ms` latency) so 100k buyers can search it immediately.
   * **Telegram Channel Drop:** The platform bot automatically posts an interactive card to the seller's linked Telegram sell/buy group:
     ```
     🔥 NEW DROP: Apple iPhone 15 Pro Max (256GB)
     💵 Price: Br 165,000 | 📦 Only 8 units available!
     🛡️ Policy: 3-Day Replacement Warranty
     👇 Click below to buy securely inside Telegram:
     [🛍️ Buy Now with Telebirr]
     ```

### B. High-Concurrency Inventory Management (Flash Drops)
If a shop drops 10 limited-edition sneakers and 500 buyers click "Buy Now" simultaneously within 2 seconds:
1. **Redis Atomic Decrement (`DECR`):** Standard relational databases lock under sudden write spikes. Instead, available stock is held in Redis (`GET stock:prod_103 = 10`).
2. **Checkout TTL Lock:** When a buyer enters checkout, Redis atomically executes `DECR stock:prod_103` and sets a 5-minute reservation key (`SETEX hold:user_128:prod_103 300 1`).
3. **Expiration Recovery:** If the buyer does not complete Telebirr payment within 5 minutes, a background cron/worker expires the hold and executes `INCR stock:prod_103`, returning the unit to the available pool.
