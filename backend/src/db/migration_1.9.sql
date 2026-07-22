-- Migration 1.9: Product condition, size, product_code, barcode
-- Adds fields for the 4-page product wizard.
-- Idempotent: safe to re-run.

ALTER TABLE products ADD COLUMN IF NOT EXISTS condition VARCHAR(30) DEFAULT 'new';
ALTER TABLE products ADD COLUMN IF NOT EXISTS size VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code VARCHAR(20);
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(20);
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_radius INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_delivery_days INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS assign_name VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS assign_phone VARCHAR(30);
