-- migration_1.2.8.sql
-- Unify coupons table schema and enable coupon application at checkout

-- Drop dependent table first
DROP TABLE IF EXISTS user_coupons CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;

-- Unified COUPONS table
CREATE TABLE coupons (
    coupon_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(50) UNIQUE NOT NULL,
    discount_type   VARCHAR(20) NOT NULL DEFAULT 'percent', -- 'percent', 'fixed'
    discount_value  DECIMAL(10,2) NOT NULL,                 -- percent (e.g. 15.00) or fixed birr (e.g. 150.00)
    store_id        UUID REFERENCES stores(store_id) ON DELETE CASCADE,
    tg_user_id      BIGINT REFERENCES users(tg_user_id) ON DELETE CASCADE,
    min_order_etb   DECIMAL(10,2) DEFAULT 0,
    max_uses        INTEGER,
    used_count      INTEGER DEFAULT 0,
    expires_at      TIMESTAMP,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coupons_store ON coupons(store_id);
CREATE INDEX IF NOT EXISTS idx_coupons_user ON coupons(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(UPPER(code));

-- Re-create user coupons association
CREATE TABLE user_coupons (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tg_user_id      BIGINT NOT NULL REFERENCES users(tg_user_id) ON DELETE CASCADE,
    coupon_id       UUID NOT NULL REFERENCES coupons(coupon_id) ON DELETE CASCADE,
    is_redeemed     BOOLEAN DEFAULT FALSE,
    redeemed_at     TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (tg_user_id, coupon_id)
);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user ON user_coupons(tg_user_id);

-- Add coupon columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_etb DECIMAL(10,2) DEFAULT 0;
