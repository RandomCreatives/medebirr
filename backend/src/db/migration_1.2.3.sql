-- ============================================================
-- Migration 1.2.3 — Security hardening + performance indexes
-- Run against Supabase SQL editor or via psql with pooler
-- ============================================================

-- ─── Performance Indexes ─────────────────────────────────────

-- delivery_addresses: queried by buyer on every checkout
CREATE INDEX IF NOT EXISTS idx_delivery_addresses_user ON delivery_addresses(tg_user_id);

-- reviews: seller dashboard queries by store_id
CREATE INDEX IF NOT EXISTS idx_reviews_store ON reviews(store_id);

-- reviews: product detail queries by product_id (UNIQUE index doesn't cover solo lookups)
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

-- orders: list sorted by created_at
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- orders: buyer order list queries
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_tg_user_id, created_at DESC);

-- products: "newest" sort
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at DESC);

-- pending_products: store lookup
CREATE INDEX IF NOT EXISTS idx_pending_products_store ON pending_products(store_id, status);

-- ─── Foreign Key ON DELETE Behavior ──────────────────────────
-- NOTE: PostgreSQL doesn't support ALTER FOREIGN KEY ... ADD ON DELETE.
-- We must drop and recreate each constraint.

-- stores → users (store owner)
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_admin_tg_user_id_fkey;
ALTER TABLE stores ADD CONSTRAINT stores_admin_tg_user_id_fkey
  FOREIGN KEY (admin_tg_user_id) REFERENCES users(tg_user_id) ON DELETE CASCADE;

-- orders → stores
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_store_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE SET NULL;

-- orders → users (buyer)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_buyer_tg_user_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_buyer_tg_user_id_fkey
  FOREIGN KEY (buyer_tg_user_id) REFERENCES users(tg_user_id) ON DELETE SET NULL;

-- order_items → products (keep order history, null out product ref)
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE SET NULL;

-- order_items → orders (cascade: delete items when order is deleted)
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;

-- payment_transactions → orders
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_order_id_fkey;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;

-- notifications → users
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_tg_user_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_tg_user_id_fkey
  FOREIGN KEY (tg_user_id) REFERENCES users(tg_user_id) ON DELETE CASCADE;

-- reviews → orders
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_order_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE SET NULL;

-- reviews → products
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_product_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE SET NULL;

-- reviews → stores
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_store_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE SET NULL;

-- wishlists → users
ALTER TABLE wishlists DROP CONSTRAINT IF EXISTS wishlists_tg_user_id_fkey;
ALTER TABLE wishlists ADD CONSTRAINT wishlists_tg_user_id_fkey
  FOREIGN KEY (tg_user_id) REFERENCES users(tg_user_id) ON DELETE CASCADE;

-- wishlists → products
ALTER TABLE wishlists DROP CONSTRAINT IF EXISTS wishlists_product_id_fkey;
ALTER TABLE wishlists ADD CONSTRAINT wishlists_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;

-- user_coupons → coupons
ALTER TABLE user_coupons DROP CONSTRAINT IF EXISTS user_coupons_coupon_id_fkey;
ALTER TABLE user_coupons ADD CONSTRAINT user_coupons_coupon_id_fkey
  FOREIGN KEY (coupon_id) REFERENCES coupons(coupon_id) ON DELETE CASCADE;

-- delivery_addresses → users
ALTER TABLE delivery_addresses DROP CONSTRAINT IF EXISTS delivery_addresses_tg_user_id_fkey;
ALTER TABLE delivery_addresses ADD CONSTRAINT delivery_addresses_tg_user_id_fkey
  FOREIGN KEY (tg_user_id) REFERENCES users(tg_user_id) ON DELETE CASCADE;

-- pending_products → products
ALTER TABLE pending_products DROP CONSTRAINT IF EXISTS pending_products_product_id_fkey;
ALTER TABLE pending_products ADD CONSTRAINT pending_products_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE SET NULL;
