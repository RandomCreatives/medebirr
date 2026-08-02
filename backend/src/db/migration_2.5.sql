-- ============================================================
-- MIGRATION 2.5 — Order idempotency key + cancel-request dedupe
-- (P0 hardening, 2026-08-02)
-- ============================================================

-- Orders created by the SPA carry an idempotency_key so retried checkouts
-- return the same order instead of duplicating. Previously the key was
-- stored in payment_tx_ref — which Telebirr initiation and confirm-tx later
-- overwrote, silently disabling idempotency after payment began.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

-- Partial unique index (NULLs allowed) — one order per buyer per key.
-- NOTE: if production already has duplicate (buyer, key) pairs this index
-- will fail; clean them first with a GROUP BY query.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency
  ON orders(buyer_tg_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Timestamp throttle for buyer → seller cancel-request Telegram DMs
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMP;
