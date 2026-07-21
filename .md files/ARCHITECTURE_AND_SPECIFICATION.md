# GroupCommerce TMA / ShopGram Ethiopia
## Multi-Group Telegram Web App (TMA) Platform Architecture & Specification

Based on your screenshots of **Bekollo | ዋጋው! Online Shopping** (an Ethiopian online shopping Telegram Mini App serving Addis Ababa with Birr currency, local delivery, wallet/points, and saved addresses), this document outlines the full engineering architecture and specification for scaling that experience into a **Multi-Tenant / Group-Centric SaaS Platform inside Telegram**.

---

## 1. Core Vision & Value Proposition

Currently, local buy/sell Telegram groups in Ethiopia (e.g., Addis Ababa shopping channels, university marketplaces, electronic bazaars) operate chaotically:
- Sellers post text and photos in chat streams where they get buried.
- Buyers haggle in private DMs.
- Payments are handled via manual screenshots of Telebirr or bank transfers.
- Order tracking and address collection are error-prone.

### The Solution: A Multi-Tenant Telegram Mini App Platform
Every Telegram group or channel owner links our Bot (`@ShopGramEtBot` or custom brand) as an administrator to their group.
1. **Autonomous Group Storefronts:** Each group gets its own isolated catalog, pricing, and storefront ID inside the Mini App.
2. **Dual-Mode Dashboard:**
   - **Shopper Dashboard:** Customers browse products filtered by specific groups or across the marketplace feed, manage a unified cart, select local Addis Ababa / Regional addresses, and track real-time deliveries.
   - **Group Admin / Seller Dashboard:** Group admins manage inventory, configure local delivery fees (e.g., Bole vs Kazanchis vs Hawassa), verify Telebirr/Chapa payments, and dispatch couriers directly from their phone.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          TELEGRAM CLIENT (Mobile / Desktop)            │
│  ┌──────────────────────┐               ┌──────────────────────────┐   │
│  │  Telegram Group/Chat │               │  Telegram Mini App (TMA) │   │
│  │  [Inline Shop Button]├──────────────►│  (HTML5/React/Tailwind)  │   │
│  └──────────┬───────────┘               └────────────┬─────────────┘   │
└─────────────┼────────────────────────────────────────┼─────────────────┘
              │ Webhooks                               │ HTTPS REST / GraphQL
              ▼                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKEND API CLUSTER                             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ API Gateway & Authentication Service                             │  │
│  │ • Validates Telegram `window.Telegram.WebApp.initData` (HMAC-SHA256)│  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌───────────────┐  │
│  │ Tenant/Group Service │  │ Product/Order Engine│  │ Notification  │  │
│  │ • Store Management   │  │ • Cart & Inventory  │  │ • Bot Alerts  │  │
│  └──────────┬───────────┘  └──────────┬──────────┘  └───────┬───────┘  │
└─────────────┼─────────────────────────┼─────────────────────┼──────────┘
              │                         │                     │
              ▼                         ▼                     ▼
┌─────────────────────────┐   ┌──────────────────────────────────────────┐
│  PostgreSQL Database    │   │ Local Ethiopian Payment Gateways         │
│  • Tenants, Products,   │   │ • Telebirr SuperApp H5 / Push API        │
│    Orders, Users        │   │ • Chapa API (Card & Bank Transfer)       │
└─────────────────────────┘   └──────────────────────────────────────────┘
```

---

## 3. Cryptographic Authentication & Security (`initData`)

When a user opens the Mini App from a Telegram group button, Telegram injects `window.Telegram.WebApp.initData`. The backend **must never trust client-provided user IDs** without verifying the HMAC-SHA256 signature using your Telegram Bot Token.

### Node.js Verification Example:
```javascript
const crypto = require('crypto');

function verifyTelegramWebAppData(telegramInitData, botToken) {
  const urlParams = new URLSearchParams(telegramInitData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  const dataCheckString = Array.from(urlParams.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return calculatedHash === hash;
}
```

---

## 4. Database Schema (PostgreSQL)

### Table: `stores` (Group Tenants)
| Column | Type | Description |
| :--- | :--- | :--- |
| `store_id` | UUID (PK) | Unique tenant ID |
| `tg_group_id` | BIGINT (Unique) | Telegram Chat/Group ID (`-100xxxxx`) |
| `store_name` | VARCHAR(255) | Display name (e.g. "Addis Fashion Hub") |
| `admin_tg_user_id` | BIGINT | Telegram ID of group admin |
| `currency` | VARCHAR(10) | Default `Br` / `ETB` |
| `telebirr_merchant_id` | VARCHAR(100) | Telebirr settlement code |
| `chapa_secret_key` | VARCHAR(255) | Chapa integration key |
| `created_at` | TIMESTAMP | Registration time |

### Table: `products`
| Column | Type | Description |
| :--- | :--- | :--- |
| `product_id` | UUID (PK) | Unique product ID |
| `store_id` | UUID (FK) | Links to `stores.store_id` |
| `title` | VARCHAR(255) | Product name |
| `price_etb` | DECIMAL(10,2) | Price in Ethiopian Birr |
| `stock_quantity`| INT | Available units |
| `category` | VARCHAR(100) | Men, Women, Electronics, etc. |
| `image_url` | TEXT | S3 or Telegram File ID |

### Table: `delivery_zones`
| Column | Type | Description |
| :--- | :--- | :--- |
| `zone_id` | UUID (PK) | Unique delivery zone |
| `store_id` | UUID (FK) | Links to store |
| `zone_name` | VARCHAR(100) | e.g., "Addis Ababa - Bole", "Regional - Hawassa" |
| `fee_etb` | DECIMAL(10,2) | Delivery fee (e.g., `150.00` Br) |
| `free_threshold`| DECIMAL(10,2) | Order amount for free delivery (e.g., `1000.00` Br) |

---

## 5. Ethiopian Payment Integration Flow

### A. Telebirr SuperApp / H5 Integration
1. Buyer clicks **Confirm Order** with Telebirr selected.
2. Backend generates a structured payload and signs it using your Telebirr App Secret.
3. Backend calls Telebirr Pre-Order API, receiving a `toPayUrl` or `rawRequest`.
4. Mini App redirects or triggers deep link `telebirr://pay?data=...`.
5. Upon completion, Telebirr fires a webhook to `/api/webhooks/telebirr`. Backend verifies signature and marks order `paid`.

### B. Chapa Gateway Integration
1. Backend calls `https://api.chapa.co/v1/transaction/initialize` with:
   ```json
   {
     "amount": "798",
     "currency": "ETB",
     "email": "customer@example.com",
     "first_name": "Mike",
     "last_name": "Fikadu",
     "tx_ref": "TX-ORDER-10245",
     "callback_url": "https://api.yourdomain.com/webhooks/chapa"
   }
   ```
2. Chapa returns a checkout URL. The Mini App opens it inside Telegram WebView.

---

## 6. How Group Integration Works User Flow

1. **Onboarding a Group:**
   - Admin adds `@ShopGramEtBot` to their Telegram channel or sell/buy group.
   - Admin sends `/setup_store`. The bot verifies admin rights and responds with an inline button: `[⚙️ Configure Group Store]`.
   - Admin taps it, opening the Mini App in **Group Admin Mode** where they add products and set delivery fees.
2. **Posting Products to the Group:**
   - When the admin creates a product in the Mini App dashboard, the backend triggers `bot.sendPhoto` to the Telegram Group chat with product image, price (`Br 399`), and an inline keyboard button: `[🛍️ Buy Now in Store]`.
3. **Shopper Purchase:**
   - A group member taps `[🛍️ Buy Now in Store]`.
   - The Mini App opens directly to that product (`?store_id=xyz&product_id=123`).
   - The buyer checks out in under 30 seconds using saved Addis Ababa delivery coordinates and Telebirr.
