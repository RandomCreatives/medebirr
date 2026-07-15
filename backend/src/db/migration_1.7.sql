-- Migration 1.7: OCR payment-proof fields
-- payment_verifications gets OCR-extracted tx_ref/amount/text from the
-- buyer's receipt screenshot. orders gets a payment_proof JSONB snapshot
-- that is embedded into the PDF receipt. Idempotent: safe to re-run.

ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS ocr_tx_ref VARCHAR(100);
ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS ocr_amount DECIMAL(10,2);
ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS ocr_text TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof JSONB;
