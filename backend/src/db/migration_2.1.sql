-- Migration 2.1: Other Banks JSONB for seller payout
-- Sellers can add multiple bank accounts beyond Telebirr and CBE.
-- Each entry: { bank_name, account_number, account_holder }
-- Idempotent: safe to re-run.

ALTER TABLE stores ADD COLUMN IF NOT EXISTS other_banks JSONB DEFAULT '[]'::jsonb;
