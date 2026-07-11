-- Migration 1.2.5: Store code, seller password, self-buy restriction
-- All use IF NOT EXISTS for idempotent re-runs

-- Store unique 16-char alphanumeric identifier (generated on registration)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_code VARCHAR(16) UNIQUE;

-- Seller password hash (set on registration, asked when switching to seller account)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS seller_password_hash TEXT;
