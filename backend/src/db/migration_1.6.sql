-- Migration 1.6: Payment verification (buyer receipt proofs)
-- Supports the hybrid Payment Verification Bot: buyer sends a receipt
-- screenshot via the bot, seller confirms in Telegram. No OCR required.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS payment_verifications (
    verification_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id          UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    buyer_tg_user_id  BIGINT NOT NULL,
    photo_file_id     TEXT,
    photo_url         TEXT,
    transaction_note  TEXT,
    status            VARCHAR(20) DEFAULT 'awaiting_receipt', -- awaiting_receipt, pending_seller_confirm, confirmed, rejected
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_verifications_buyer ON payment_verifications(buyer_tg_user_id, status);
