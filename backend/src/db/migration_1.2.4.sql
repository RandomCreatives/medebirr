-- Migration 1.2.4: Add missing columns referenced in code but never created in DB
-- All use IF NOT EXISTS for idempotent re-runs

-- Orders: QR delivery + return tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_data JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_token VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_scan_attempts INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_verified_by_rider BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_verified_by_buyer BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_pdf_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_initiated_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Stores: verification request tracking
ALTER TABLE stores ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ;

-- Pending products: seller completion fields
ALTER TABLE pending_products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE pending_products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE pending_products ADD COLUMN IF NOT EXISTS sub_category VARCHAR(100);
ALTER TABLE pending_products ADD COLUMN IF NOT EXISTS compare_price DECIMAL(10,2);
ALTER TABLE pending_products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;
ALTER TABLE pending_products ADD COLUMN IF NOT EXISTS tags TEXT[];
