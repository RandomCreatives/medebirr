-- ============================================================
-- e-Merkato Database Schema
-- GroupCommerce TMA - Multi-Tenant Ethiopian Marketplace
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE (Telegram-authenticated buyers & sellers)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    user_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tg_user_id      BIGINT UNIQUE NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100),
    username        VARCHAR(100),
    photo_url       TEXT,
    language_code   VARCHAR(10) DEFAULT 'en',
    tier            VARCHAR(20) DEFAULT 'standard', -- standard, gold, verified_seller
    wallet_points   INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- STORES TABLE (Group Tenants / Seller Shops)
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
    store_id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tg_group_id             BIGINT UNIQUE,
    tg_channel_username     VARCHAR(100),
    store_name              VARCHAR(255) NOT NULL,
    store_slug              VARCHAR(100) UNIQUE,
    admin_tg_user_id        BIGINT NOT NULL REFERENCES users(tg_user_id),
    description             TEXT,
    location_sub_city       VARCHAR(100),
    location_woreda         VARCHAR(100),
    location_detail         TEXT,
    physical_address        TEXT,
    business_phone          VARCHAR(30),
    currency                VARCHAR(10) DEFAULT 'ETB',
    telebirr_merchant_id    VARCHAR(100),
    cbe_account_number      VARCHAR(50),
    chapa_secret_key        VARCHAR(255),
    kyc_document_url        TEXT,
    status                  VARCHAR(30) DEFAULT 'pending', -- pending, verified, suspended
    verified_badge          BOOLEAN DEFAULT FALSE,
    total_orders            INTEGER DEFAULT 0,
    total_revenue           DECIMAL(14,2) DEFAULT 0,
    rating                  DECIMAL(3,2) DEFAULT 0,
    rating_count            INTEGER DEFAULT 0,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SELLER POLICIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS seller_policies (
    policy_id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id                UUID UNIQUE NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    return_policy_type      VARCHAR(50) DEFAULT 'no_return', -- 7_day_free, 3_day_warranty, size_exchange, no_return, fresh_guarantee
    custom_policy_text      TEXT,
    addis_delivery_fee      DECIMAL(10,2) DEFAULT 150.00,
    regional_dispatch_fee   DECIMAL(10,2) DEFAULT 400.00,
    free_delivery_threshold DECIMAL(10,2) DEFAULT 2000.00,
    zone_fee_matrix         JSONB DEFAULT '{
        "Bole": 150,
        "Kirkos": 150,
        "Yeka": 200,
        "Lideta": 175,
        "Gulele": 175,
        "Nifas_Silk": 200,
        "Addis_Ketema": 150,
        "Akaki_Kality": 300,
        "Lemi_Kura": 250,
        "Kolfe_Keranio": 200,
        "Regional_Bus_Dispatch": 400
    }',
    cash_on_delivery        BOOLEAN DEFAULT TRUE,
    telebirr_enabled        BOOLEAN DEFAULT TRUE,
    chapa_enabled           BOOLEAN DEFAULT FALSE,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    product_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id        UUID NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    price_etb       DECIMAL(10,2) NOT NULL,
    compare_price   DECIMAL(10,2),
    sku             VARCHAR(100),
    stock_quantity  INTEGER DEFAULT 0,
    reserved_stock  INTEGER DEFAULT 0,
    category        VARCHAR(100),
    sub_category    VARCHAR(100),
    tags            TEXT[],
    image_urls      TEXT[] DEFAULT '{}',
    variants        JSONB DEFAULT '[]', -- [{name: "Size", options: ["S","M","L"]}]
    is_published    BOOLEAN DEFAULT FALSE,
    is_featured     BOOLEAN DEFAULT FALSE,
    view_count      INTEGER DEFAULT 0,
    order_count     INTEGER DEFAULT 0,
    rating          DECIMAL(3,2) DEFAULT 0,
    rating_count    INTEGER DEFAULT 0,
    tg_message_id   BIGINT,  -- Message ID of bot broadcast to group
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- DELIVERY ADDRESSES TABLE (Buyer saved addresses)
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_addresses (
    address_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tg_user_id      BIGINT NOT NULL REFERENCES users(tg_user_id) ON DELETE CASCADE,
    label           VARCHAR(50) DEFAULT 'Home',  -- Home, Work, Other
    sub_city        VARCHAR(100) NOT NULL,
    woreda          VARCHAR(50),
    house_number    VARCHAR(100),
    landmark        VARCHAR(255),
    phone           VARCHAR(30) NOT NULL,
    is_default      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    order_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_ref           VARCHAR(50) UNIQUE NOT NULL, -- ORD-20260706-XXXX
    buyer_tg_user_id    BIGINT NOT NULL REFERENCES users(tg_user_id),
    store_id            UUID NOT NULL REFERENCES stores(store_id),
    address_id          UUID REFERENCES delivery_addresses(address_id),
    delivery_address    JSONB NOT NULL, -- Snapshot of address at order time
    subtotal_etb        DECIMAL(10,2) NOT NULL,
    delivery_fee_etb    DECIMAL(10,2) DEFAULT 0,
    total_etb           DECIMAL(10,2) NOT NULL,
    payment_method      VARCHAR(30) DEFAULT 'telebirr', -- telebirr, chapa, cash
    payment_status      VARCHAR(30) DEFAULT 'pending',  -- pending, paid, failed, refunded
    order_status        VARCHAR(30) DEFAULT 'pending',  -- pending, confirmed, dispatched, delivered, cancelled
    payment_tx_ref      VARCHAR(100),
    telebirr_tx_id      VARCHAR(100),
    policy_snapshot     JSONB,  -- Store policy at time of order
    rider_name          VARCHAR(100),
    rider_phone         VARCHAR(30),
    dispatch_note       TEXT,
    buyer_confirmed_at  TIMESTAMP,  -- QR handshake confirmation
    delivered_at        TIMESTAMP,
    cancelled_at        TIMESTAMP,
    cancel_reason       TEXT,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ORDER ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
    item_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(product_id),
    title           VARCHAR(255) NOT NULL,  -- Snapshot
    price_etb       DECIMAL(10,2) NOT NULL, -- Snapshot
    quantity        INTEGER NOT NULL DEFAULT 1,
    variant_choice  JSONB,  -- {size: "M", color: "Blue"}
    subtotal_etb    DECIMAL(10,2) NOT NULL
);

-- ============================================================
-- PAYMENT TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_transactions (
    tx_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(order_id),
    gateway         VARCHAR(30) NOT NULL, -- telebirr, chapa, cash
    gateway_tx_ref  VARCHAR(150) UNIQUE,
    amount_etb      DECIMAL(10,2) NOT NULL,
    merchant_code   VARCHAR(100),  -- Seller's direct payment code
    status          VARCHAR(30) DEFAULT 'initiated', -- initiated, pending, completed, failed
    gateway_response JSONB,
    webhook_verified BOOLEAN DEFAULT FALSE,
    settled_at      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    notif_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tg_user_id      BIGINT NOT NULL REFERENCES users(tg_user_id),
    type            VARCHAR(50),  -- order_paid, order_dispatched, new_order, rider_assigned
    title           VARCHAR(255),
    body            TEXT,
    data            JSONB,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- REVIEWS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
    review_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(order_id),
    product_id      UUID NOT NULL REFERENCES products(product_id),
    store_id        UUID NOT NULL REFERENCES stores(store_id),
    reviewer_tg_id  BIGINT NOT NULL REFERENCES users(tg_user_id),
    rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (order_id, product_id)
);

-- ============================================================
-- WISHLIST TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS wishlists (
    wishlist_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tg_user_id      BIGINT NOT NULL REFERENCES users(tg_user_id),
    product_id      UUID NOT NULL REFERENCES products(product_id),
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (tg_user_id, product_id)
);

-- ============================================================
-- PAYMENT METHODS TABLE (Buyer saved cards — PCI compliant)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_methods (
    method_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tg_user_id      BIGINT NOT NULL REFERENCES users(tg_user_id) ON DELETE CASCADE,
    card_brand      VARCHAR(20) NOT NULL,    -- visa, mastercard, amex
    last_four       VARCHAR(4) NOT NULL,
    exp_month       INTEGER,
    exp_year        INTEGER,
    cardholder_name VARCHAR(200),
    is_default      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(tg_user_id);

-- ============================================================
-- COUPONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
    coupon_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(50) UNIQUE NOT NULL,
    discount_type   VARCHAR(20) NOT NULL,    -- percent, fixed
    discount_value  DECIMAL(10,2) NOT NULL,
    min_order_etb   DECIMAL(10,2) DEFAULT 0,
    max_uses        INTEGER,
    used_count      INTEGER DEFAULT 0,
    expires_at      TIMESTAMP,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- USER COUPONS TABLE (Coupons assigned to users)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_coupons (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tg_user_id      BIGINT NOT NULL REFERENCES users(tg_user_id) ON DELETE CASCADE,
    coupon_id       UUID NOT NULL REFERENCES coupons(coupon_id),
    is_redeemed     BOOLEAN DEFAULT FALSE,
    redeemed_at     TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (tg_user_id, coupon_id)
);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user ON user_coupons(tg_user_id);

-- ============================================================
-- USER SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
    tg_user_id      BIGINT PRIMARY KEY REFERENCES users(tg_user_id) ON DELETE CASCADE,
    dark_mode       BOOLEAN DEFAULT TRUE,
    notif_orders    BOOLEAN DEFAULT TRUE,
    notif_promos    BOOLEAN DEFAULT TRUE,
    notif_chat      BOOLEAN DEFAULT TRUE,
    biometric_login BOOLEAN DEFAULT FALSE,
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- USER PROFILE EXTENSIONS (email, phone, mfa)
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_published ON products(is_published);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_tg_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(tg_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_payment_tx_ref ON payment_transactions(gateway_tx_ref);
