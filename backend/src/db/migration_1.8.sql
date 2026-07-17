-- Migration 1.8: Seller-provided product detail sections
-- Adds per-product fields so sellers populate the PDP accordion
-- (Specifications & Materials, Shipping/Duty/Returns).
-- Idempotent: safe to re-run.

ALTER TABLE products ADD COLUMN IF NOT EXISTS specifications TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS materials TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shipping_info TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS duty_info TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS return_info TEXT;
