-- Migration 2.0: Composite indexes for sellerList JOIN subqueries
-- The seller inventory view now joins order_items + orders to show
-- paid/delivered counts per product. These indexes make those queries fast.
-- Idempotent: safe to re-run.

-- Composite index for the paid-count subquery:
--   WHERE o.payment_status = 'paid'
--   GROUP BY oi.product_id
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_product ON order_items(order_id, product_id);

-- Composite index for the delivered-count subquery:
--   WHERE o.order_status = 'delivered'
--   GROUP BY oi.product_id
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status);

-- Better composite for the existing status index (payment_status first is more selective)
DROP INDEX IF EXISTS idx_orders_status;
CREATE INDEX IF NOT EXISTS idx_orders_status_payment ON orders(payment_status, order_status);
CREATE INDEX IF NOT EXISTS idx_orders_status_order ON orders(order_status, payment_status);
