-- Migration 1.2.6: Telegram notification toggle for sellers
ALTER TABLE stores ADD COLUMN IF NOT EXISTS telegram_notifs BOOLEAN DEFAULT TRUE;
