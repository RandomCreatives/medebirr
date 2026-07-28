# Medebirr — Session Journal

## 2026-07-28: Code Review + Architecture Planning

### Context
Reviewed the full medebirr codebase (Express backend + vanilla JS TMA). Compared against a FAANG-style e-commerce system design to identify gaps appropriate for an Ethiopia-focused Telegram marketplace at current scale.

### Bugs Found & Fixed

All fixes applied to files on disk. Uncommitted.

1. **Double stock deduction** — `payments.js` webhook + cash confirm called `deductStock` without checking if order was already paid. Added guard in webhook and cash routes.
2. **Store revenue set to NULL** — `orders.js` SELECT in dispatch + confirm-delivery routes missing `total_etb` and `store_id`. Added to SELECTs.
3. **Cancel/payment race condition** — `releaseReservedStock` in `inventory.js` had no transaction or `FOR UPDATE` lock. Wrapped in BEGIN/COMMIT with row locks.
4. **MarkdownV2 bot messages failing silently** — Hardcoded bot messages in `bot.js` had unescaped special characters. Added `sendSafeMessage()` to `telegram.js` (HTML parse_mode, auto-converts `*bold*` → `<b>bold</b>`). Fixed `/start` and search bot messages.
5. **Hardcoded DB credentials** — `run_migration.js` had production credentials committed. Switched to `DATABASE_URL` env var.

### Architecture Assessment

**Project maturity**: Solid alpha / early beta. Production-hardening needed.

**Strengths**:
- 23-table PostgreSQL schema with proper types, indexes, JSONB
- Telegram initData HMAC with timing-safe comparison
- `SELECT FOR UPDATE` in order creation for concurrency
- Policy snapshots as JSONB at order creation
- QR + OTP dual-confirmation delivery handshake
- Zero-escrow payment model (Telebirr direct to seller)
- Two-phase init frontend pattern, offline cache, per-store cart
- CI/CD pipeline, cache busting, i18n with Amharic

**Weaknesses**:
- No caching anywhere (every request hits DB directly)
- Search uses `ILIKE '%query%'` (no index usage, sequential scan)
- Single PostgreSQL instance (no read replicas)
- No monitoring/structured logging
- Auth middleware does `SELECT *` on every request
- DAL is half-implemented (inline SQL in routes bypasses it)

### Web Version Strategy

**Decision**: Build a separate web frontend in the same repo, sharing the backend. Monorepo structure:

```
medebirr/
├── packages/
│   ├── backend/     # Existing Express API (shared)
│   ├── tma/         # Existing vanilla JS TMA (unchanged)
│   └── web/         # New React/Next.js frontend
├── tokens.json      # Shared design values (colors, fonts)
└── vercel.json      # Route /api/* → backend, /* → web
```

**Key principle**: TMA and web share ZERO frontend code. No CSS bleed, no component sharing, no framework conflicts. The API is the only shared surface.

**Web version scope** (6-month plan):
- Month 1-2: Auth (email/Google) + browse + search
- Month 3-4: Cart + checkout + order tracking
- Month 5-6: Seller web dashboard (optional)

**What stays Telegram-only**: Bot-based product detection, payment verification via screenshot OCR, QR delivery handshake, Telegram DM notifications.

### Context Sharing

This journal bridges OpenCode sessions. CLI OpenCode (here) handles architecture decisions and code review. VS Code OpenCode handles implementation. Both read/write this file + AGENTS.md.