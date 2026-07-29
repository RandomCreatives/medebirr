-- ============================================================
-- MIGRATION 2.3 — Default CBE + Telebirr on for all stores
-- ============================================================

-- Backfill: enable CBE and Telebirr for all existing stores
UPDATE seller_policies SET cbe_enabled = TRUE WHERE cbe_enabled IS NULL OR cbe_enabled = FALSE;
UPDATE seller_policies SET telebirr_enabled = TRUE WHERE telebirr_enabled IS NULL;
