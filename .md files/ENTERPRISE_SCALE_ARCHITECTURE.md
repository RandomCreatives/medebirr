# Enterprise-Scale Architecture: 100k Buyers & 1,000 Autonomous Shops
## High-Concurrency Telegram Mini App Platform for Ethiopia

This engineering specification details the architecture for scaling **GroupCommerce TMA (ShopGram Ethiopia)** to handle **1,000 autonomous sellers** and **100,000 daily active buyers** with resilience against huge daily traffic spikes.

Based on your verified requirements:
1. **Direct Seller Checkout (Zero Escrow Liability):** Money settles store-by-store directly to each merchant's Telebirr / CBE account.
2. **Seller-Managed Logistics:** Every shop configures its own delivery rates and dispatches its own delivery riders.
3. **Unified App with Automatic Role Switching:** A single Telegram Mini App where regular users see the high-speed discovery storefront, and verified shop admins unlock an integrated **Seller Studio** workspace.

---

## 1. System Architecture Diagram (100k Daily Users)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TELEGRAM CLIENT LAYER                           │
│   100,000 Daily Active Buyers across 1,000+ Telegram Sell/Buy Groups   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ window.Telegram.WebApp.initData
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        EDGE CDN & CACHING LAYER                        │
│   • Cloudflare Workers + Edge DDoS Protection                          │
│   • Sub-5ms static asset delivery (HTML/CSS/JS bundles)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS REST / GraphQL
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     MICROSERVICES API GATEWAY                          │
│   • Node.js / FastAPI Cluster (Auto-scaled on Kubernetes)              │
│   • Rate Limiting: Redis-backed Token Bucket (Protect against bot spam)│
└──────────┬────────────────────────┬─────────────────────────┬──────────┘
           │                        │                         │
           ▼                        ▼                         ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
│ Search & Discovery   │  │ Direct Checkout &    │  │ Seller Studio      │
│ Engine (Meilisearch) │  │ Cart Orchestrator    │  │ Policy Service     │
│ • Sub-10ms faceted   │  │ • Groups cart items  │  │ • Manages 1,000    │
│   search across 1,000│  │   by shop ID         │  │   distinct return &│
│   shops & 50k items  │  │ • Direct API push    │  │   logistics rules  │
└──────────┬───────────┘  └──────────┬───────────┘  └──────────┬─────────┘
           │                         │                         │
           ▼                         ▼                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   DATABASE & CACHE TIER (High Traffic)                 │
│   • Primary PostgreSQL: Write operations (Orders, Store settings)      │
│   • 3x Read-Replica PostgreSQL: Serves 95% of read queries             │
│   • Redis Cluster: Session locking, cart state, flash drop inventory   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  DIRECT ETHIOPIAN PAYMENT GATEWAYS                     │
│   • Telebirr SuperApp H5 / Push API (Direct to Seller Merchant Code)   │
│   • Chapa API / CBE Birr Direct Settlement                             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. High-Traffic Search & Discovery Engine

When 100,000 users concurrently query 1,000 shops, standard SQL relational queries (`SELECT * FROM products WHERE title LIKE '%phone%'`) will cause severe database contention and lag.

### Solution: Dedicated Search Cluster (Meilisearch / Elasticsearch)
Whenever a seller adds or updates an item in their **Seller Studio**, an asynchronous event updates the Meilisearch index within 50ms.

#### Index Structure (`products_index`)
```json
{
  "id": "prod_101",
  "title": "Apple iPhone 15 Pro Max (256GB)",
  "price": 165000,
  "shopId": "shop_bole_gadgets",
  "shopName": "Bole Apple & Tech Hub",
  "subCity": "Bole",
  "returnPolicy": "3_day_warranty",
  "inStock": true,
  "rating": 4.9
}
```

#### Sub-10ms Faceted Filtering
Buyers filter instantly by:
- **Location / Sub-City:** `subCity = Bole OR subCity = Kazanchis`
- **Return Policy:** `returnPolicy = free_returns`
- **Price Range:** `price <= 5000`

---

## 3. Direct Seller Checkout Protocol (Zero Escrow)

Because multi-vendor escrow introduces massive financial regulatory overhead and delayed settlement, our platform implements **Store-Isolated Direct Checkout**.

### Cart Grouping Algorithm
When a buyer adds items from multiple sellers into their global cart, the frontend automatically partitions the cart into **Store Packages**:

```javascript
function partitionCartBySeller(cartItems) {
  return cartItems.reduce((packages, item) => {
    const shopId = item.shopId;
    if (!packages[shopId]) {
      packages[shopId] = {
        shopName: item.shopName,
        returnPolicy: item.returnPolicy,
        deliveryFee: item.deliveryFee,
        merchantCode: item.paymentAccounts.telebirr,
        items: [],
        subtotal: 0
      };
    }
    packages[shopId].items.push(item);
    packages[shopId].subtotal += item.price * item.qty;
    return packages;
  }, {});
}
```

### Direct Payment Flow
1. Buyer clicks **Checkout & Pay Store** for `Bole Apple & Tech Hub`.
2. Backend generates a direct Telebirr transaction request configured with `merchantCode = 891204` (The specific seller's account).
3. The buyer authorizes the push notification on their mobile phone.
4. Telebirr settles 100% of funds directly to the seller's bank account.
5. Telebirr fires a webhook to `/api/webhooks/telebirr`. The platform verifies transaction receipt and sends a Telegram Bot alert directly to the seller's Telegram channel: `[🎉 New Paid Order #9921 - Dispatch Rider Now]`.

---

## 4. Seller Autonomous Policy & Logistics Enforcement

Every seller configures their own business rules in the **Seller Studio**. These rules are immutable per order snapshot.

### Database Table: `seller_policies`
| Column | Type | Description |
| :--- | :--- | :--- |
| `shop_id` | VARCHAR(64) PK | Unique store identifier |
| `return_policy_type` | VARCHAR(32) | `7_day_free`, `3_day_warranty`, `no_return` |
| `custom_policy_text`| TEXT | Full legal terms displayed at checkout |
| `addis_delivery_fee`| DECIMAL(10,2) | Flat rate for Addis Ababa sub-cities |
| `regional_dispatch_fee`| DECIMAL(10,2) | Flat rate for bus dispatch outside Addis |

At checkout, the buyer explicitly checks an agreement box: *"I agree to Bole Apple & Tech Hub's 3-Day Replacement Warranty policy."*

---

## 5. Traffic Spikes & Flash Drop Protection

To survive viral Telegram drops (e.g., when a channel with 50,000 subscribers broadcasts a flash deal link):
1. **Redis Inventory Locking:** When a buyer clicks "Checkout", Redis sets a TTL lock (`SETEX lock:item_101 300 1`) for 5 minutes. If unpaid within 5 minutes, inventory is released back to the pool.
2. **CDN HTML Caching:** The Mini App shell (`index.html`) is cached at Cloudflare edge nodes in Addis Ababa/Mombasa, resulting in `<15ms` initial load time even under 100,000 concurrent visits.
