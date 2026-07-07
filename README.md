# e-Merkato — Ethiopia's Telegram Marketplace

> A multi-tenant Telegram Mini App connecting 1,000 autonomous sellers with 100,000 buyers in Ethiopia. Zero escrow. Direct Telebirr settlement. Built for Addis Ababa.

---

## Project Structure

```
eMerkato/
├── backend/                    # Node.js REST API
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.sql      # Full PostgreSQL schema
│   │   │   ├── seed.js         # Demo data (stores, products, users)
│   │   │   ├── migrate.js      # Run migrations
│   │   │   └── index.js        # DB connection pool
│   │   ├── middleware/
│   │   │   ├── auth.js         # Telegram initData HMAC verification + JWT
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js         # POST /api/v1/auth/telegram
│   │   │   ├── stores.js       # Store CRUD, policies, stats
│   │   │   ├── products.js     # Product listing, search, CRUD
│   │   │   ├── orders.js       # Order creation, dispatch, delivery
│   │   │   ├── payments.js     # Telebirr + Chapa + Cash webhooks
│   │   │   └── users.js        # Profile, addresses, wishlist
│   │   └── server.js           # Express app entry point
│   ├── .env.example
│   └── package.json
│
├── frontend/                   # Telegram Mini App (vanilla HTML/CSS/JS)
│   ├── index.html              # App shell
│   ├── css/app.css             # Full dark-mode TMA styles
│   └── js/
│       ├── api.js              # API client (all HTTP calls)
│       ├── state.js            # App state + cart management
│       ├── app.js              # Main controller (auth, routing, events)
│       └── views/
│           ├── buyer.js        # Explore, Cart, Wishlist, Orders
│           ├── seller.js       # Dashboard, Inventory, Policy, Dispatch
│           └── modals.js       # Checkout, Product detail, Add product, Rider
│
├── ARCHITECTURE_AND_SPECIFICATION.md
├── ENTERPRISE_SCALE_ARCHITECTURE.md
├── COMPLETE_SYSTEM_LIFECYCLE_GUIDE.md
├── generate_receipt.py         # PDF receipt generator
└── e_merkato_landing_page.html # Marketing landing page
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis (optional — for cart sync at scale)

### 1. Backend Setup

```bash
cd backend
copy .env.example .env
# Edit .env with your DB credentials and Telegram Bot Token
npm install
node src/db/migrate.js    # Create all tables
node src/db/seed.js       # Load demo stores, products, users
npm run dev               # Start API server on port 3000
```

### 2. Open the App

With the backend running, open `http://localhost:3000` in your browser.

The app runs in **demo mode** automatically — no real Telegram connection needed for development. It uses a mock user (Mike Fikadu) and all API calls go to `localhost:3000`.

### 3. Demo Credentials

The seed data creates these demo users:

| Role | Telegram ID | Notes |
|------|------------|-------|
| Buyer | 12893412 | Mike Fikadu — default demo user |
| Seller | 98760002 | Bole Apple & Tech Hub |
| Seller | 98760003 | Shiro Meda Heritage Textile |
| Seller | 98760004 | Kaffa & Sidama Direct Roastery |

To test as a seller, set `localStorage.setItem('em_demo_user', '98760002')` in the browser console, then reload.

---

## API Reference

All endpoints are prefixed with `/api/v1/`.

### Authentication
```
POST /auth/telegram          { initData: "..." }  →  { token, user }
```

### Products (public)
```
GET  /products               ?search=&category=&sub_city=&sort=&page=&limit=
GET  /products/:id
POST /products               (auth required — seller)
PUT  /products/:id           (auth + ownership)
DEL  /products/:id           (auth + ownership)
```

### Stores (public)
```
GET  /stores                 ?search=&sub_city=
GET  /stores/:id
POST /stores                 (auth — register new store)
PUT  /stores/:id             (auth + ownership)
PUT  /stores/:id/policy      (auth + ownership)
GET  /stores/:id/stats       (auth + ownership)
```

### Orders
```
POST /orders                 (auth)  { store_id, items, delivery_address, payment_method }
GET  /orders                 (auth)  buyer's orders
GET  /orders/:id             (auth)  buyer or seller
GET  /orders/store/:storeId  (auth + seller)
PUT  /orders/:id/dispatch    (auth + seller)  { rider_name, rider_phone }
PUT  /orders/:id/confirm-delivery  (auth + buyer)
```

### Payments
```
POST /payments/telebirr/initiate   (auth)  { order_id }
POST /payments/telebirr/webhook    (public — Telebirr calls this)
POST /payments/chapa/initiate      (auth)  { order_id }
POST /payments/chapa/webhook       (public)
POST /payments/cash/confirm        (auth)  { order_id }
```

---

## Telegram Bot Setup

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Copy the bot token to your `.env` as `TELEGRAM_BOT_TOKEN`
3. Create a Mini App via BotFather: `/newapp`
4. Set the Web App URL to your deployed frontend URL
5. Add the bot as admin to your sell/buy group
6. Users who send `/register_shop` will get an onboarding link

---

## Payment Integration

### Telebirr (Primary)
- Requires formal partnership with **Ethio Telecom**
- Apply at [ethiotelecom.et](https://ethiotelecom.et) for merchant API access
- In demo mode, payments are simulated without real API calls

### Chapa
- Sign up at [chapa.co](https://chapa.co/account/signup)
- Free sandbox available for testing
- Set `CHAPA_SECRET_KEY` in your `.env`

---

## Production Deployment

1. Set `NODE_ENV=production` in environment
2. Use a production PostgreSQL instance (e.g., Supabase, AWS RDS)
3. Set up Redis for cart state and session management
4. Deploy behind Nginx or use a PaaS (Railway, Render, Heroku)
5. Set `APP_URL` and `FRONTEND_URL` to your domain
6. Enable HTTPS (required by Telegram for Mini Apps)

---

## Architecture Highlights

- **Zero escrow**: Payments go directly from buyer's Telebirr to seller's merchant code
- **Store-partitioned cart**: Each seller's items are grouped and checked out independently
- **HMAC-SHA256 auth**: Telegram `initData` cryptographically verified on every session
- **Redis inventory locking**: Atomic `DECR` + TTL hold for flash-drop protection (pluggable)
- **Direct settlement**: `merchantCode` in payment payload routes funds to seller, not platform
- **Policy snapshots**: Order records store seller policy at time of purchase — immutable evidence
