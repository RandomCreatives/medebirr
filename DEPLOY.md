# e-Merkato — Supabase + Vercel Deployment Guide

## Overview

```
Telegram Users
     │
     ▼
Vercel (Frontend + API)          ← all requests go here
  ├── /                          → frontend/index.html (static)
  ├── /css /js                   → frontend/css, frontend/js (static)
  └── /api/*                     → api/index.js (serverless function)
            │
            ▼
       Supabase (PostgreSQL)     ← port 6543 via pgbouncer for API
                                 ← port 5432 direct for migrations
```

---

## Part 1 — Supabase Setup

### 1.1 Create a Project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Choose your organization, set a **project name** (e.g. `emerkato`), pick a **database password** (save it), choose the closest region to Ethiopia (e.g. `eu-west-1` or `ap-southeast-1`)
3. Wait ~2 minutes for provisioning

### 1.2 Run the Schema Migration

Get your **Direct connection string** from:
`Dashboard → Project Settings → Database → Connection string → URI`
Switch the tab to **Transaction** to get port 5432 (direct). It looks like:
```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

Set this in your local `.env` as `SUPABASE_DB_URL`, then run:

```bash
cd backend
# Copy the env example and fill in your Supabase values
copy .env.example .env

# Run migrations (creates all 11 tables)
node src/db/migrate.js

# Seed demo data (4 stores, 12 products, demo users)
node src/db/seed.js
```

Expected output:
```
✅ Migrations complete.
✅ Seed data inserted successfully.
```

### 1.3 Get Your Connection Strings

From `Dashboard → Project Settings → Database → Connection string`:

| Purpose | Tab | Port | Use for |
|---------|-----|------|---------|
| `SUPABASE_DB_URL` | Session | 5432 | `migrate.js`, `seed.js` |
| `DATABASE_URL` | Transaction | 6543 | API runtime queries |

The Transaction (pgbouncer) string looks like:
```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
```

Add `&connection_limit=3` at the end to prevent exhausting pgbouncer on cold starts:
```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=3
```

---

## Part 2 — Vercel Setup

### 2.1 Install Vercel CLI

```bash
npm install -g vercel
```

### 2.2 Push to Git

Vercel deploys from Git. Push the project to a GitHub/GitLab/Bitbucket repo:

```bash
git init
git add .
git commit -m "Initial e-Merkato deployment"
git remote add origin https://github.com/YOUR_USERNAME/emerkato.git
git push -u origin main
```

### 2.3 Deploy to Vercel

#### Option A — Vercel CLI (fastest)
```bash
vercel login
vercel --prod
```

Follow the prompts:
- **Set up and deploy** → Yes
- **Which scope** → your account
- **Link to existing project** → No (first deploy)
- **Project name** → `emerkato`
- **In which directory is your code located** → `./` (root)

#### Option B — Vercel Dashboard
1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your Git repo
3. **Root Directory** → leave as `/`
4. **Build Command** → leave blank (no build step)
5. **Output Directory** → leave blank
6. Click **Deploy**

### 2.4 Set Environment Variables

In Vercel Dashboard → Project → **Settings → Environment Variables**, add:

| Variable | Value | Environments |
|----------|-------|--------------|
| `DATABASE_URL` | `postgresql://postgres.[ref]:[pw]@...6543/postgres?pgbouncer=true&connection_limit=3` | Production, Preview |
| `SUPABASE_URL` | `https://[ref].supabase.co` | All |
| `SUPABASE_ANON_KEY` | from Supabase dashboard | All |
| `JWT_SECRET` | 64-char random hex (see below) | All |
| `JWT_EXPIRES_IN` | `7d` | All |
| `TELEGRAM_BOT_TOKEN` | from @BotFather | All |
| `TELEGRAM_BOT_USERNAME` | `eMerkatoBot` | All |
| `APP_URL` | `https://emerkato.vercel.app` | Production |
| `FRONTEND_URL` | `https://emerkato.vercel.app` | Production |
| `NODE_ENV` | `production` | Production |
| `TELEBIRR_APP_ID` | your Telebirr App ID | Production |
| `TELEBIRR_APP_SECRET` | your Telebirr secret | Production |
| `CHAPA_SECRET_KEY` | your Chapa key | Production |

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 2.5 Redeploy After Adding Env Vars

```bash
vercel --prod
```
or trigger a redeploy from the Vercel dashboard.

---

## Part 3 — Telegram Mini App Setup

### 3.1 Register the Bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. `/newbot` → set name (`e-Merkato`) and username (`eMerkatoBot`)
3. Save the **bot token** → set as `TELEGRAM_BOT_TOKEN` in Vercel

### 3.2 Create the Mini App

```
/newapp
→ Select your bot (@eMerkatoBot)
→ App name: e-Merkato
→ Short description: Ethiopia's Free Shopping Experience
→ Photo: upload a 640x360 image
→ Web App URL: https://emerkato.vercel.app
```

### 3.3 Add Bot to Seller Groups

Each seller adds `@eMerkatoBot` as an **Administrator** to their Telegram sell/buy group. The bot then handles `/register_shop` commands.

### 3.4 Test the Mini App

Open `https://t.me/eMerkatoBot/app` in Telegram on mobile. The Mini App opens at your Vercel URL and authenticates via Telegram `initData`.

---

## Part 4 — Verify the Deployment

```bash
# Health check
curl https://emerkato.vercel.app/api/health

# Should return:
# { "status": "ok", "service": "e-Merkato API", "region": "iad1", ... }

# Test auth (will return JWT if DB is connected)
curl -X POST https://emerkato.vercel.app/api/v1/auth/telegram \
  -H "Content-Type: application/json" \
  -d '{"initData":"mock:12893412"}'

# Browse products
curl "https://emerkato.vercel.app/api/v1/products?limit=5"
```

---

## Part 5 — Custom Domain (Optional)

In Vercel Dashboard → Project → **Settings → Domains**:
1. Add `emerkato.et` (or your domain)
2. Add the DNS records Vercel gives you at your domain registrar
3. Update `APP_URL` and `FRONTEND_URL` env vars to `https://emerkato.et`
4. Update the Mini App Web App URL in BotFather to `https://emerkato.et`

---

## Supabase Dashboard Shortcuts

| Task | Where |
|------|-------|
| View live data | Table Editor |
| Run SQL queries | SQL Editor |
| Monitor DB connections | Dashboard → Database → Connections |
| API logs | Dashboard → Logs → Edge |
| Connection strings | Settings → Database → Connection string |
| Reset DB password | Settings → Database → Reset database password |

---

## Architecture Notes

### Why pgbouncer (port 6543)?
Vercel serverless functions are stateless — each invocation may spin up a new Node.js process. Without a connection pooler, each cold start would open a new PostgreSQL connection, quickly exhausting Supabase's 60-connection default. pgbouncer in transaction mode multiplexes many short-lived app connections into a small number of real DB connections.

### Why keep both connection strings?
`pg` driver can't use `PREPARE` statements through pgbouncer in transaction mode. DDL statements (like `CREATE TABLE`) also don't work reliably. `migrate.js` and `seed.js` use `SUPABASE_DB_URL` (direct, port 5432) which supports everything.

### Vercel cold starts
The first request after inactivity takes ~300-500ms while the serverless function initializes. Subsequent requests in the same instance are fast. Supabase keeps DB connections warm on their side.

### Free tier limits
- **Supabase Free**: 500MB storage, 50MB DB size, 5GB bandwidth/month — sufficient for development and early growth
- **Vercel Free (Hobby)**: 100GB bandwidth, 100 serverless function invocations/day limit — upgrade to Pro for production traffic
