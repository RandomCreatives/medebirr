# e-Merkato Design Direction

> **Document version:** 1.0
> **Date:** July 2026
> **Status:** Active reference

---

## 1. Brand Identity

### Name Origin

**Merkato** — Amharic for "marketplace." The real Merkato in Addis Ababa is one of Africa's largest open-air markets. It is chaotic, vibrant, and deeply Ethiopian. Our digital version should honor that heritage while offering what the physical market cannot: trust, order, and convenience.

### Brand Essence

**"The Market, Modernized."**

We are not a Western e-commerce clone. We are an Ethiopian platform built for Ethiopian commerce — ETB pricing, Telegram-native UX, kebele-level delivery, telebirr integration. The design should feel like it *belongs* here.

### Brand Personality

| Trait | What it means | What it does NOT mean |
|-------|--------------|----------------------|
| **Confident** | Clean layout, bold typography, no hesitation | Not aggressive, no countdown timers, no "BUY NOW OR ELSE" |
| **Warm** | Ivory/cream tones, humanist spacing, approachable copy | Not childish, no excessive emojis, no loud gradients |
| **Trustworthy** | Consistent patterns, clear hierarchy, nothing hidden | Not sterile, not cold, not clinical |
| **Proud** | Ethiopian identity woven into color, copy, and structure | Not kitschy, no flag reproductions, no clip-art patterns |

### Brand Voice (UI Copy)

- **Direct and helpful.** Say what it is. "Your orders" not "Manage your purchase history."
- **No filler.** Remove every word that doesn't earn its place.
- **Amharic where it matters.** Product names, store names, addresses stay in Amharic. UI chrome stays in English (current state).
- **No fake urgency.** No "Only 2 left!" countdowns. Let the product speak.
- **No corporate jargon.** "Track your order" not "Initiate shipment monitoring protocol."

---

## 2. Visual Direction: Heritage Modern

### What is Heritage Modern?

It is not "minimalist" (too cold for Ethiopian commerce). It is not "luxury" (too exclusive for a marketplace). It is not "flat" (too lifeless).

**Heritage Modern** is: contemporary digital craft with cultural depth. Think of it as a well-made Ethiopian coffee ceremony — every element has purpose, warmth, and care.

### Core Principles

1. **Warmth over coolness.** No blue-grays. No pure whites. Everything has a hint of cream, gold, or earth.
2. **Borders over shadows.** Cards use 1px borders, not drop shadows. Shadows are reserved for elevation moments (modals, nav, toast). This keeps the interface lightweight and fast-feeling.
3. **Weight = hierarchy.** Font weight (700-900) drives hierarchy more than size. This is efficient for mobile — bold text reads at smaller sizes.
4. **Gold is sacred.** The accent gold (#C8980A light, #FCCD04 dark) is used sparingly. It marks actions, status, and identity. It is never background. It is never decorative.
5. **Respect the density.** Ethiopian marketplaces are information-dense. Our users expect to see many items, many details, many options. Don't over-whitespace. Dense is not cluttered.

---

## 3. Color System

### Light Theme (Default)

| Token | Value | Role |
|-------|-------|------|
| `--bg-main` | `#F7F5F0` | App shell — warm ivory |
| `--bg-body` | `#EFEBE3` | Page body — parchment |
| `--bg-surface` | `#FFFFFF` | Elevated surfaces — pure white |
| `--bg-card` | `#FFFFFF` | Cards — white |
| `--bg-hover` | `#F0EDE6` | Hover state — warm cream |
| `--accent` | `#C8980A` | Primary action — antique gold |
| `--text-primary` | `#1A1A2E` | Headings — near-black navy |
| `--text-secondary` | `#6B6560` | Body — warm gray |
| `--border` | `#E2DDD4` | Default borders — warm tan |

**Palette origin:** Ethiopian gold trade, parchment, earth tones. The warmth signals "this is Ethiopian" without saying it.

### Dark Theme

| Token | Value | Role |
|-------|-------|------|
| `--bg-main` | `#0B0C0E` | App shell — obsidian |
| `--bg-surface` | `#15171C` | Elevated surfaces |
| `--bg-card` | `#1E2027` | Cards |
| `--accent` | `#FCCD04` | Primary action — bright gold |
| `--text-primary` | `#FFFFFF` | Headings |
| `--text-secondary` | `#9DA3AE` | Body |
| `--border` | `#2D303A` | Default borders |

**Palette origin:** Night market aesthetic — dark streets, bright stall lights, gold jewelry under lamplight.

### Color Rules

1. **Gold for actions only.** CTA buttons, active states, price highlights, status badges. Never for backgrounds or decorative fills.
2. **Semantic colors are muted.** Success (green), warning (amber), danger (red), info (blue) are used at `rgba(..., 0.15)` tinted backgrounds. They never compete with gold.
3. **No pure black (#000) in light mode.** Text is `#1A1A2E` — a warm navy. Pure black is harsh on cream backgrounds.
4. **No pure white (#FFF) in dark mode.** Text is `#FFFFFF` only for headings. Body text is `#9DA3AE`. Pure white on dark backgrounds causes eye strain.

### Secondary Accent (Future)

Consider adding `#B85C38` (terracotta) as a secondary accent for:
- Sale/discount badges
- Seller tier indicators (bronze)
- Seasonal promotions

This would pair with gold: gold = identity, terracotta = urgency/value.

---

## 4. Typography

### Current State

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Everything | Inter | 700-900 | 9-28px |

### Recommendation

| Role | Font | Weight | Size | Why |
|------|------|--------|------|-----|
| **Body / UI** | Inter | 400-600 | 12-14px | Clean, geometric, excellent at small sizes. Current weights (700-900) are too heavy for body text. |
| **Headings** | Inter | 700-800 | 15-28px | Keep Inter for consistency. Heavy weights work at larger sizes. |
| **Prices** | Inter | 800-900 | 14-28px | Gold accent + heavy weight = instant scannability. |
| **Logo** | Inter | 900 | 20-26px | Current logo treatment works. No need for a custom font. |

### Why NOT add a serif/display font?

1. **Performance.** Extra font = extra network request = slower first paint on Telegram WebView.
2. **Consistency.** One font family across the entire app creates visual cohesion.
3. **Ethiopian context.** Ge'ez script is angular and geometric — Inter's geometry echoes this without pretending to be Ge'ez.
4. **Mobile-first.** Serif fonts at small sizes (< 14px) lose readability on low-DPI screens.

### Typography Changes to Make

1. **Reduce body text weight from 700-800 to 400-600.** The current app reads as "shouting" because everything is bold. Body text should be regular weight. Only headings and buttons should be heavy.
2. **Add a consistent type scale:**
   - `--text-xs`: 10px / 600 (badges, meta)
   - `--text-sm`: 12px / 600 (secondary text, labels)
   - `--text-base`: 13px / 400 (body text, descriptions)
   - `--text-md`: 14px / 600 (card titles, button text)
   - `--text-lg`: 17px / 700 (section headers, modal titles)
   - `--text-xl`: 20px / 800 (page titles, product names)
   - `--text-2xl`: 28px / 900 (hero prices, stat values)
3. **Line height.** Body text should be 1.5-1.6. Current appears to be ~1.2-1.3 everywhere. This hurts readability for longer text (descriptions, policy, chat).

---

## 5. Spacing & Layout

### Current State

- Body padding: 14px
- Card padding: 12-16px
- Grid gaps: 10-11px
- Section margins: 14px

### Recommendation

The current spacing is appropriate for a dense marketplace. **Do not increase it.** Ethiopian users are accustomed to information-dense interfaces (see: the real Merkato). Over-spacing would waste screen real estate.

#### Spacing Tokens (formalize existing values)

| Token | Value | Use |
|-------|-------|-----|
| `--space-xs` | 4px | Tight internal gaps |
| `--space-sm` | 8px | Between related items |
| `--space-md` | 12px | Card padding, list gaps |
| `--space-lg` | 16px | Section padding, page margins |
| `--space-xl` | 24px | Between major sections |

### Layout Principles

1. **2-column product grid.** This is correct. 3 columns is too tight on 360px screens. 1 column wastes space.
2. **Full-bleed modals.** Modal sheets should slide up to ~85% height with a drag handle. This is already implemented correctly.
3. **Fixed bottom nav.** Keep it. 4 tabs max. Current implementation (Home, Explore, Cart, Profile) is correct.
4. **Sticky header with search.** Keep it. Search is the primary navigation tool.

---

## 6. Component Patterns

### Cards

| Property | Current | Recommended | Reason |
|----------|---------|-------------|--------|
| Border | `1px solid var(--border)` | Keep | Borders > shadows for this density |
| Border radius | `var(--radius-md)` (14px) | Keep | Rounds edges without looking blobby |
| Shadow | None on cards | None | Correct — cards are flat surfaces |
| Hover | `border-color` change | Add `transform: translateY(-1px)` | Subtle lift signals interactivity |
| Active/pressed | None | Add `transform: scale(0.98)` | Tactile feedback on tap |

### Buttons

| Property | Current | Recommended |
|----------|---------|-------------|
| Primary | Gold bg, dark text, 14px radius | Keep |
| Secondary | Transparent, border, 14px radius | Keep |
| Height | ~44px | Keep (44px is touch target minimum) |
| Font weight | 800 | Reduce to 700 for secondary, keep 800 for primary |
| Disabled state | Reduce opacity | Add `pointer-events: none` + explicit disabled style |

### Product Cards

| Element | Current | Recommended |
|---------|---------|-------------|
| Image | `background-image`, 130px height | Increase to 150px — images are the #1 conversion driver |
| Image fallback | Category gradient emoji | Keep — good UX for missing images |
| Title | 12px/700, 2-line clamp | Keep |
| Price | 14px/900, accent color | Keep — gold price is signature |
| Location | 10px/600, muted | Keep |

### Search Bar

| Element | Current | Recommended |
|---------|---------|-------------|
| Style | Rounded rect with icon | Keep |
| Border | 1px solid var(--border) | Add focus ring: `box-shadow: 0 0 0 2px var(--accent)` |
| Placeholder | "Search..." | "Search products, stores..." — more specific |
| Clear button | None | Add X button when input has value |

---

## 7. Motion & Micro-interactions

### Timing

| Action | Duration | Easing |
|--------|----------|--------|
| Theme switch | 250ms | `ease` |
| Modal open | 300ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Modal close | 200ms | `ease-in` |
| Card tap | 100ms | `ease` |
| Page transition | 250ms | `ease` |
| Toast appear | 300ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Toast dismiss | 200ms | `ease-in` |

### Recommended Micro-interactions

1. **Card tap feedback.** `transform: scale(0.98)` on `:active`. 100ms. Tactile.
2. **Button press.** `transform: scale(0.97)` on `:active` for primary buttons.
3. **Staggered card load.** When product grid loads, cards fade in with 50ms stagger. CSS `@keyframes` with `animation-delay` based on `--i` custom property.
4. **Smooth scroll.** `scroll-behavior: smooth` on the app body.
5. **Image lazy fade.** Product images fade in (`opacity: 0 → 1`) when loaded. Prevents white flash.
6. **Counter animation.** Cart badge number counts up/down when quantity changes.
7. **Pull-to-refresh.** Native-feeling rubber-band pull on product lists.

### What NOT to animate

- **Layout shifts.** Never animate `width`, `height`, `top`, `left`. Use `transform` and `opacity` only.
- **Theme-dependent elements.** Don't animate shadows during theme switch — they change too dramatically.
- **Text.** Never animate font-size or font-weight. It looks janky.

---

## 8. Signature Design Elements

These are the elements that make e-Merkato *feel* like e-Merkato, not a generic template.

### 1. The Gold Accent System

Gold is not just a color — it is the brand. It should have a consistent grammar:

| Element | Gold usage |
|---------|------------|
| Logo mark | Gold gradient `linear-gradient(135deg, #FCCD04, #F59E0B)` |
| Primary CTA | Gold bg, dark text |
| Active nav icon | Gold |
| Price display | Gold text |
| Active filter pill | Gold bg |
| Status badges | Gold text + gold tint bg |
| Sale badge | Gold bg (dark mode) or terracotta bg (light mode, future) |
| Rating stars | Gold fill |
| Verified badge | Gold checkmark |

**Rule: Gold never appears as background fill on large surfaces.** It is always a small, intentional accent. This preserves its value.

### 2. The Card System

Every piece of content lives in a card. This is already the pattern. Formalize it:

- **Standard card.** White bg, 1px border, 14px radius. Used for: products, orders, reviews, settings rows.
- **Elevated card.** Same as standard + `shadow-md`. Used for: modals, popups, toast.
- **Accent card.** Standard card + gold left border (3px). Used for: featured items, promotions, important notices.
- **Glass card.** `backdrop-filter: blur(20px)` + semi-transparent bg. Used for: bottom nav, header.

### 3. The Profile Header

The circular avatar + name + stat cards pattern is strong. Enhance it:

- Avatar border: 2px solid gold (verified sellers get gold ring, buyers get silver).
- Stat cards: Gold value text, secondary label. 2x2 grid.
- Role switch: Pill at top-right, gold when active.

### 4. Empty States

Current pattern (emoji + title + description + button) is correct. Enhance:

- Use a subtle illustration or pattern instead of emoji (future).
- Title in 700 weight, description in 400 weight.
- CTA button in primary style.

---

## 9. What to Avoid

### Anti-patterns

| Don't | Why |
|-------|-----|
| Pure white backgrounds in light mode | Too harsh on cream palette. Use `#FFFFFF` only on elevated surfaces. |
| Blue-gray tones | Kills the warmth. Every gray should have a yellow/red undertone. |
| Outlined/bordered buttons everywhere | Reserve outlined style for secondary actions only. Primary should always be filled gold. |
| Centered text in cards | Left-align everything except headings and empty states. |
| ALL CAPS in UI | Never. It reads as shouting. Use font-weight for emphasis. |
| Emoji as icon system | Use where already implemented (stats, empty states). Don't add more. |
| Drop shadows on cards | Conflicts with the border-based depth system. |
| Gradient backgrounds | The only gradient should be the gold logo mark. Everything else is flat. |
| Thin fonts (300-400) for headings | Headings should be 700+. Thin headings feel weak on mobile. |
| Auto-playing animations | All motion should be on user action or page load, not looping. |

---

## 10. Implementation Priority

### Phase 1 — Immediate (v1.3.0)

These changes improve the existing design without rewriting anything:

1. **Typography weight reduction.** Body text from 700-800 → 400-600. Headings stay 700+.
2. **Type scale tokens.** Add `--text-xs` through `--text-2xl` CSS variables.
3. **Line height.** Body text to 1.5, headings to 1.2.
4. **Card tap feedback.** `:active { transform: scale(0.98); }` on all cards and buttons.
5. **Search focus ring.** `box-shadow: 0 0 0 2px var(--accent)` on focus.
6. **Product image height.** 130px → 150px.
7. **Image lazy fade.** Add `opacity` transition on product images.

### Phase 2 — Short-term (v1.4.0)

1. **Accent card variant.** Gold left border for featured items.
2. **Staggered card animation.** Fade-in with delay on grid load.
3. **Counter animation.** Cart badge number transition.
4. **Pull-to-refresh.** On product lists and explore.
5. **Secondary accent.** Add terracotta for sale/discount indicators.

### Phase 3 — Medium-term (v2.0.0)

1. **Custom illustrations for empty states.** Replace emoji with branded illustrations.
2. **Geometric pattern header.** Subtle Ethiopian-inspired pattern (not busy) on profile/settings headers.
3. **Skeleton loading.** Replace spinner with content-shaped placeholders.
4. **Haptic feedback.** Telegram WebApp `HapticFeedback.impactOccurred()` on key actions.

---

## 11. References

| Reference | What to study |
|-----------|--------------|
| **Jumia Egypt/Morocco** | Dense marketplace layout, product card patterns |
| **Takealot (South Africa)** | Clean category navigation, trust signals |
| **Etsy** | Handmade/artisan positioning, warm palette, seller profiles |
| **Coinbase** | Clean typography, minimal UI, gold/white/black palette |
| **Linear** | Motion design, keyboard-first UX, component polish |
| **Dark mode: Arc Browser** | Warm dark palette, gold accents, glass morphism |

---

## 12. Summary

**e-Merkato is Heritage Modern.**

It is warm, not cold. Dense, not sparse. Gold-accented, not gold-saturated. Ethiopian, not generic. Premium, not exclusive.

The design should feel like walking into a well-organized section of Merkato — everything is there, everything has its place, and the gold sign above the stall tells you exactly where you are.

---

*This document is a living reference. Update it as the design evolves.*
