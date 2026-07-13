-- ============================================================
-- e-Merkato v1.3 — Performance Indexes + FK ON DELETE Policies
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. COMPOSITE PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────

-- Orders: buyer + store lookup (user order history by store)
CREATE INDEX IF NOT EXISTS idx_orders_buyer_store ON orders(buyer_tg_user_id, store_id);

-- Products: partial index — only published products per store
CREATE INDEX IF NOT EXISTS idx_products_published_store ON products(store_id) WHERE is_published = TRUE;

-- Products: composite partial for explore category + price range filter
CREATE INDEX IF NOT EXISTS idx_products_category_price ON products(category, price_etb) WHERE is_published = TRUE;

-- Products: full-text search GIN on title (replaces ILIKE sequential scans)
CREATE INDEX IF NOT EXISTS idx_products_title_fts ON products USING GIN (to_tsvector('simple', title));

-- ─────────────────────────────────────────────────────────────
-- 2. FK ON DELETE POLICIES — 7 constraints missing ON DELETE
--    Drop and re-add with proper cascade behavior.
-- ─────────────────────────────────────────────────────────────

-- conversations.buyer_tg_user_id → users (CASCADE: delete conversation when user gone)
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_buyer_tg_user_id_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_buyer_tg_user_id_fkey
  FOREIGN KEY (buyer_tg_user_id) REFERENCES users(tg_user_id) ON DELETE CASCADE;

-- group_buy_members.tg_user_id → users (CASCADE)
ALTER TABLE group_buy_members DROP CONSTRAINT IF EXISTS group_buy_members_tg_user_id_fkey;
ALTER TABLE group_buy_members ADD CONSTRAINT group_buy_members_tg_user_id_fkey
  FOREIGN KEY (tg_user_id) REFERENCES users(tg_user_id) ON DELETE CASCADE;

-- group_buys.creator_tg_user_id → users (SET NULL: keep group buy record)
ALTER TABLE group_buys DROP CONSTRAINT IF EXISTS group_buys_creator_tg_user_id_fkey;
ALTER TABLE group_buys ADD CONSTRAINT group_buys_creator_tg_user_id_fkey
  FOREIGN KEY (creator_tg_user_id) REFERENCES users(tg_user_id) ON DELETE SET NULL;

-- messages.sender_tg_user_id → users (CASCADE)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_tg_user_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_sender_tg_user_id_fkey
  FOREIGN KEY (sender_tg_user_id) REFERENCES users(tg_user_id) ON DELETE CASCADE;

-- orders.address_id → delivery_addresses (SET NULL: keep order, lose address ref)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_address_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_address_id_fkey
  FOREIGN KEY (address_id) REFERENCES delivery_addresses(address_id) ON DELETE SET NULL;

-- product_shares.tg_user_id → users (CASCADE)
ALTER TABLE product_shares DROP CONSTRAINT IF EXISTS product_shares_tg_user_id_fkey;
ALTER TABLE product_shares ADD CONSTRAINT product_shares_tg_user_id_fkey
  FOREIGN KEY (tg_user_id) REFERENCES users(tg_user_id) ON DELETE CASCADE;

-- reviews.reviewer_tg_id → users (CASCADE: remove reviews when user deleted)
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_reviewer_tg_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_reviewer_tg_id_fkey
  FOREIGN KEY (reviewer_tg_id) REFERENCES users(tg_user_id) ON DELETE CASCADE;
