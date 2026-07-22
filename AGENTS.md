# e-Merkato / Medebirr — Agent Context

## Project
Ethiopian marketplace (vanilla-JS SPA + Express backend).  
Version `1.4.0`, cache-bust via `?v=` with git SHA.

## Active Objective
Translate the app into **Amharic** with context-aware (not literal) translations.  
280 user-facing strings already migrated to `State.t('key', vars)`. Amharic column empty — awaiting translator input.

---

## i18n Architecture

| File | Purpose |
|------|---------|
| `gen_i18n.js` | **Master catalog** — 927 keys, verbatim English, `add(cat, key, en, context, tech)` calls. Run `node gen_i18n.js` to regenerate CSV + locale files. |
| `i18n_terms.csv` | Spreadsheet you edit (fill **Amharic** column). Key columns: `Key, English, Category, Context, Amharic, Technical` |
| `public/js/i18n/en.js` | Auto-generated canonical English locale |
| `public/js/i18n/am.js` | Auto-generated Amharic locale (empty until CSV is filled) |
| `public/js/i18n/i18n.js` | Loader — `window.I18n.t(key, vars)` with English fallback + nested-`${var}` interpolation |
| `scripts/gen-i18n-csv.js` | **Delta generator** — scans code for `State.t('key')`, emits only keys missing/empty in `am.js`. Run `node scripts/gen-i18n-csv.js` → `i18n_terms_delta.csv` |

### Workflow
1. Translate: fill Amharic column in `i18n_terms.csv` (or the smaller `i18n_terms_delta.csv`)
2. Import: `node gen_i18n.js` → rewrites `en.js` + `am.js` from CSV
3. Test: switch language in-app (Profile → Settings → Language)
4. New words later: add `State.t('new.key')` in code → `node scripts/gen-i18n-csv.js` → translate delta → repeat

### Key rules
- `Technical=Yes` rows stay untranslated (Medebirr, Telebirr, CBE, QR, ETB, Afaan Oromoo, etc.)
- Interpolation supports nested paths: `State.t('checkout.title', { pkg: { shopName: 'X' } })` resolves `${pkg.shopName}`
- Strings with embedded JS logic (`State.formatETB(…)`, ternaries) are left in English for now

---

## Migration Status

| Area | Keys | Migrated | Notes |
|------|------|----------|-------|
| Buyer (explore, profile, orders, coupons, address, payment, settings, notifications, help, privacy, cart, wishlist) | ~160 | ✅ | buyer.js fully migrated |
| Checkout (steps 1-3, review, confirm, receipt) | ~72 | ✅ | checkout.js fully migrated |
| Delivery / QR / scan / manual-code / assign / receipt | ~48 | ✅ | modals.js delivery sections migrated |
| Nav bars (buyer bottom tabs + seller nav) | ~8 | ✅ | app.js migrated |
| Seller dashboard / inventory / dispatch / settings / register | ~220 | ⬜ Not migrated | Cataloged in gen_i18n.js, views not yet wrapped in `t()` |
| Auth / login / onboarding | ~23 | ⬜ Not migrated | Cataloged, not wrapped |
| General (brand tokens) | ~10 | ⬜ Already Technical=Yes | Untranslated by design |

---

## Notable Recent Fixes (pre-i18n work)

- **QR validation bug fixed:** `buildQRData` now accepts `token` param so `qr_data.v === qr_token`. Existing orders repaired via `_qr_repair.js`.
- **QR payload enriched:** includes brand, buyer, seller, items, date, amount, unique `v` token, MEDEBIRR branding. Verified at ~380 bytes.
- **Camera permission prompt** added (mirroring location UX), plus **manual 4-digit code fallback** via `POST /delivery/:orderId/verify-code`.
- **Buy Now** flow on PDP, standardized back buttons with `Icons.chevron`.
- **Notifications** wired for both buyer + seller via DB table + Telegram DM dual mode.

---

---

## Fixed (latest session)

### Built: 4-Page Product Wizard
Replaced the single-scroll add-product modal with a step-through 4-page wizard:
- **Page 1 (Essentials):** Image upload, Title, Price, Category (visual grid)
- **Page 2 (Details):** Description, Condition, Size, Materials, Stock, Product Code / Barcode (auto-gen toggles)
- **Page 3 (Delivery & Payment):** Store defaults auto-filled; delivery radius/min-days/assign-editable; payment locked behind seller password
- **Page 4 (Review & Approve):** Summary cards, edit links, publish
- Auto-save draft to localStorage every 30s with restore prompt
- +50 new i18n keys for wizard UI
- DB columns added: `condition`, `size`, `product_code`, `barcode`, `delivery_radius`, `min_delivery_days`, `assign_name`, `assign_phone` (migration 1.9)

### Previous fixes
- **Wishlist items not displaying**: `toggleWishlist` now syncs `wishlistItems` in-memory; tab switch always refreshes from API (not only when null)
- **TG photo auto-detect**: `captionHasPrice()` helper detects standalone numbers on their own line (no "Br" suffix needed)
- **CI/CD**: GitHub Actions workflow added (`.github/workflows/ci.yml`) — JS syntax + i18n validation
- **app.js split**: 2608→~1685 lines across `seller-registration.js`, `order-actions.js`, `store-settings.js`

## Upcoming (discussed, not started)

### Categories tab — new bottom nav item
Insert between **Explore** and **Wishlist** in the buyer nav bar.
Grid of category cards (icon + name) → drill into sub-categories → filtered listings.
Consider: own tab vs sub-section within Explore.

## Quick Commands

```bash
node gen_i18n.js          # regenerate CSV + locale files from master catalog
node scripts/gen-i18n-csv.js  # generate delta CSV of untranslated keys
npm test                  # unit tests (3 backend tests)
npm run bump-cache        # update ?v= cache buster from git HEAD
```
