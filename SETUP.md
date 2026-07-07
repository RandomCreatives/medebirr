# e-Merkato Quick Setup Guide

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| PostgreSQL | 14+ | [postgresql.org](https://www.postgresql.org/download/) |
| npm | 8+ | bundled with Node.js |

---

## Step 1 — Create the Database

```sql
-- In psql or pgAdmin:
CREATE DATABASE emerkato_db;
```

---

## Step 2 — Configure Environment

```bash
cd backend
copy .env.example .env
```

Edit `.env` — update at minimum:
```
DB_PASSWORD=your_postgres_password
JWT_SECRET=any_random_32+_char_string
```

Everything else works in demo mode without real API keys.

---

## Step 3 — Install & Run Migrations

```bash
cd backend
npm install
node src/db/migrate.js    # Creates all 11 tables
node src/db/seed.js       # Loads 4 demo stores + 12 products + demo users
```

Expected output:
```
✅ Migrations complete.
✅ Seed data inserted successfully.
```

---

## Step 4 — Start the Server

```bash
npm run dev
```

Server starts on `http://localhost:3000`

---

## Step 5 — Open the App

Open `http://localhost:3000` in your browser.

The app auto-authenticates as **Mike Fikadu** (demo buyer) and loads the full marketplace.

### Test as a Seller

Open browser console and run:
```javascript
localStorage.setItem('em_demo_user', '98760002');
localStorage.removeItem('em_token');
location.reload();
```

This logs you in as the **Bole Apple & Tech Hub** seller. You'll see the Seller Studio with sales stats, inventory management, policy settings, and dispatch center.

---

## Running Tests

```bash
cd backend
npm test
```

Runs 28 unit tests covering:
- Telegram HMAC-SHA256 auth verification
- Store-partitioned cart logic
- Delivery zone fee matrix
- Order reference generation
- ETB currency formatting
- Policy snapshot immutability
- JWT token structure

---

## API Quick Reference

```bash
# Health check
curl http://localhost:3000/api/health

# Auth (demo mode)
curl -X POST http://localhost:3000/api/v1/auth/telegram \
  -H "Content-Type: application/json" \
  -d '{"initData":"mock:12893412"}'

# Browse products
curl "http://localhost:3000/api/v1/products?limit=5"

# Browse stores
curl "http://localhost:3000/api/v1/stores"
```

---

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use a strong random `JWT_SECRET` (32+ chars)
- [ ] Enable HTTPS (required by Telegram for Mini Apps)
- [ ] Apply for Telebirr Merchant API access from Ethio Telecom
- [ ] Sign up for Chapa sandbox at [chapa.co](https://chapa.co)
- [ ] Register `@YourBot` with BotFather and set Mini App URL
- [ ] Set `APP_URL` and `FRONTEND_URL` to your domain
- [ ] Configure PostgreSQL with connection pooling (PgBouncer)
- [ ] Set up Redis for cart sync at scale (`REDIS_URL`)

---

## Project File Map

```
backend/src/
  server.js          → Express app, routing, static file serving
  db/schema.sql      → 11 tables: users, stores, products, orders, payments...
  db/seed.js         → 4 stores, 12 products, 5 users, 2 addresses
  middleware/auth.js → verifyTelegramInitData(), requireAuth, requireSellerOf
  routes/auth.js     → POST /auth/telegram (HMAC verify + JWT issue)
  routes/stores.js   → Store CRUD, policy management, seller stats
  routes/products.js → Faceted search, CRUD, view count
  routes/orders.js   → Order creation with stock locking, dispatch, delivery
  routes/payments.js → Telebirr H5, Chapa, Cash webhook handlers
  routes/users.js    → Profile, addresses, wishlist, notifications

frontend/
  index.html         → App shell (header, role bar, nav, modal, toast)
  css/app.css        → Full dark-mode TMA design system
  js/api.js          → Typed API client for all backend endpoints
  js/state.js        → Centralized state + cart partitioning logic
  js/app.js          → Controller: auth, routing, all user actions
  js/views/buyer.js  → Explore, Cart, Wishlist, Orders views
  js/views/seller.js → Dashboard, Inventory, Policy, Dispatch views
  js/views/modals.js → Checkout, Product detail, Add product, Rider assignment
```
