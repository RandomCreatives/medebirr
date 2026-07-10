-- Migration 1.2.0: Checkout redesign (delivery method + payment accounts + tx_code)

-- Store payment account display names
ALTER TABLE stores ADD COLUMN IF NOT EXISTS telebirr_account_name VARCHAR(100);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS cbe_account_name VARCHAR(100);

-- Seller policies: CBE toggle
ALTER TABLE seller_policies ADD COLUMN IF NOT EXISTS cbe_enabled BOOLEAN DEFAULT FALSE;

-- Order: transaction code + delivery method
ALTER TABLE orders ADD COLUMN IF NOT EXISTS transaction_code VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(30) DEFAULT 'delivery';
