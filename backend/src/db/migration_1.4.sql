-- Migration 1.4: Secure delivery handshake
-- Adds OTP + geofence coordinate columns to the orders table.
-- Idempotent: safe to re-run.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_otp VARCHAR(8);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_latitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_longitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_latitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_longitude DOUBLE PRECISION;
