-- Migration 1.2.7: Coupon policies, sharing, group buying, chat system

-- Coupon policy per store (sharing rewards + group buying config)
CREATE TABLE IF NOT EXISTS coupon_policies (
    policy_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id            UUID UNIQUE NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    share_required      INT DEFAULT 3,
    share_discount      DECIMAL(5,2) DEFAULT 5.00,
    share_coupon_active BOOLEAN DEFAULT FALSE,
    group_min_members   INT DEFAULT 3,
    group_discount      DECIMAL(5,2) DEFAULT 10.00,
    group_buy_active    BOOLEAN DEFAULT FALSE,
    coupon_validity_days INT DEFAULT 7,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

-- Coupons issued to users
CREATE TABLE IF NOT EXISTS coupons (
    coupon_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id            UUID NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    tg_user_id          BIGINT NOT NULL REFERENCES users(tg_user_id),
    code                VARCHAR(20) UNIQUE NOT NULL,
    discount_percent    DECIMAL(5,2) NOT NULL,
    status              VARCHAR(20) DEFAULT 'active',
    valid_until         TIMESTAMP NOT NULL,
    used_at             TIMESTAMP,
    order_id            UUID REFERENCES orders(order_id) ON DELETE SET NULL,
    created_at          TIMESTAMP DEFAULT NOW()
);

-- Track product shares for coupon eligibility
CREATE TABLE IF NOT EXISTS product_shares (
    share_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id          UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    tg_user_id          BIGINT NOT NULL REFERENCES users(tg_user_id),
    shared_to           VARCHAR(100),
    platform            VARCHAR(20) DEFAULT 'telegram',
    created_at          TIMESTAMP DEFAULT NOW()
);

-- Group buying sessions (Pinduoduo-style)
CREATE TABLE IF NOT EXISTS group_buys (
    group_buy_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id          UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    store_id            UUID NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    creator_tg_user_id  BIGINT NOT NULL REFERENCES users(tg_user_id),
    min_members         INT NOT NULL,
    discount_percent    DECIMAL(5,2) NOT NULL,
    status              VARCHAR(20) DEFAULT 'open',
    expires_at          TIMESTAMP NOT NULL,
    created_at          TIMESTAMP DEFAULT NOW()
);

-- Group buy members
CREATE TABLE IF NOT EXISTS group_buy_members (
    member_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_buy_id        UUID NOT NULL REFERENCES group_buys(group_buy_id) ON DELETE CASCADE,
    tg_user_id          BIGINT NOT NULL REFERENCES users(tg_user_id),
    order_id            UUID REFERENCES orders(order_id) ON DELETE SET NULL,
    joined_at           TIMESTAMP DEFAULT NOW(),
    UNIQUE(group_buy_id, tg_user_id)
);

-- Chat conversations
CREATE TABLE IF NOT EXISTS conversations (
    conv_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id            UUID NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    buyer_tg_user_id    BIGINT NOT NULL REFERENCES users(tg_user_id),
    product_id          UUID REFERENCES products(product_id) ON DELETE SET NULL,
    last_message_at     TIMESTAMP DEFAULT NOW(),
    created_at          TIMESTAMP DEFAULT NOW(),
    UNIQUE(store_id, buyer_tg_user_id, product_id)
);

-- Chat messages
CREATE TABLE IF NOT EXISTS messages (
    message_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conv_id             UUID NOT NULL REFERENCES conversations(conv_id) ON DELETE CASCADE,
    sender_tg_user_id   BIGINT NOT NULL REFERENCES users(tg_user_id),
    message_text        TEXT NOT NULL,
    is_read             BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT NOW()
);
