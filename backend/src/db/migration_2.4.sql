-- ============================================================
-- MIGRATION 2.4 — Phone verification OTP
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS verification_codes (
    id              SERIAL PRIMARY KEY,
    tg_user_id      BIGINT NOT NULL,
    phone           VARCHAR(30) NOT NULL,
    code            VARCHAR(10) NOT NULL,
    attempts        INTEGER DEFAULT 0,
    expires_at      TIMESTAMP NOT NULL,
    used            BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_phone ON verification_codes(phone);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);
