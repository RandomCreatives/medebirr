/**
 * Inventory & sales helpers.
 *
 * These centralize the stock math that was previously copy-pasted across
 * payments, orders, and delivery routes. Each helper owns ONE clear concern:
 *
 *   - deductStock(orderId)        : at PAYMENT   — reduce stock_quantity + reserved_stock
 *   - releaseReservedStock(orderId): at CANCEL    — reduce reserved_stock only (never sold)
 *   - completeDelivery(orderId)   : at DELIVERY  — +order_count, release reserved,
 *                                                +store total_orders / total_revenue
 *
 * The split between payment-time (deductStock) and delivery-time
 * (completeDelivery) is intentional: a unit is consumed from available
 * inventory the moment it is paid for, but a sale is only counted toward a
 * store's stats once the buyer actually receives it.
 *
 * ── Concurrency ──
 * deductStock uses SELECT ... FOR UPDATE inside a transaction to prevent
 * overselling when two buyers pay for the last item simultaneously.
 */

const { query, getClient } = require('../db');

/**
 * Reduce actual stock and release the reservation for a paid order.
 * Uses a transaction with row-level lock (FOR UPDATE) to prevent overselling.
 */
async function deductStock(orderId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const items = await client.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
      [orderId]
    );
    for (const item of items.rows) {
      const lock = await client.query(
        'SELECT stock_quantity FROM products WHERE product_id = $1 FOR UPDATE',
        [item.product_id]
      );
      if (lock.rows.length === 0) {
        throw new Error(`Product ${item.product_id} not found`);
      }
      if (Number(lock.rows[0].stock_quantity) < Number(item.quantity)) {
        throw new Error(
          `Insufficient stock for product ${item.product_id}: ` +
          `have ${lock.rows[0].stock_quantity}, need ${item.quantity}`
        );
      }
      await client.query(
        `UPDATE products SET
           stock_quantity = GREATEST(0, stock_quantity - $1),
           reserved_stock = GREATEST(0, reserved_stock - $1)
         WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Release the reserved quantity for an order that will never be sold
 * (cancelled, payment failed, return initiated, QR verification failed).
 * Only reserved_stock is touched — stock_quantity was never reduced.
 */
async function releaseReservedStock(orderId) {
  const items = await query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [orderId]);
  for (const item of items.rows) {
    await query(
      'UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - $1) WHERE product_id = $2',
      [item.quantity, item.product_id]
    );
  }
}

/**
 * Finalize a delivered order's inventory + store stats:
 *   - products: +order_count, -reserved_stock
 *   - stores:   +total_orders, +total_revenue
 * Used by both the QR-scan, OTP-verify, and manual-settle paths so the
 * sales numbers can never be double-counted if two flows fire.
 *
 * Wrapped in a transaction so product and store updates are atomic.
 *
 * @param {string} orderId
 * @param {number|string} totalEtb  order total in ETB (passed in to avoid a re-query)
 * @param {string} storeId
 */
async function completeDelivery(orderId, totalEtb, storeId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const items = await client.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
      [orderId]
    );
    for (const item of items.rows) {
      await client.query(
        `UPDATE products SET
           order_count = order_count + $1,
           reserved_stock = GREATEST(0, reserved_stock - $1)
         WHERE product_id = $2`,
        [item.quantity, item.product_id]
      );
    }
    await client.query(
      `UPDATE stores SET
         total_orders = total_orders + 1,
         total_revenue = total_revenue + $1,
         updated_at = NOW()
       WHERE store_id = $2`,
      [totalEtb, storeId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { deductStock, releaseReservedStock, completeDelivery };
