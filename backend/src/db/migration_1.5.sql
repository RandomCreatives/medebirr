-- Migration 1.5: Flexible delivery provider
-- Supports self-delivery (seller is the rider), a named rider,
-- and a future local delivery company. Verification codes (OTP + QR)
-- are generated for every order regardless of provider.
-- Idempotent: safe to re-run.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_provider VARCHAR(20) DEFAULT 'rider'; -- self, rider, company
