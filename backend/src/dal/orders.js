/**
 * Data-access layer for orders.
 * Wraps raw SQL queries behind named functions so route handlers never
 * write inline SQL. Schema changes touch one file, not 14 routes.
 */
const { query, getClient } = require('../db');
// ── Queries ──────────────────────────────────────────────

function getById(orderId) {
  return query(
    `SELECT o.*, s.store_name, s.store_slug, s.tg_channel_username, s.admin_tg_user_id
     FROM orders o
     JOIN stores s ON o.store_id = s.store_id
     WHERE o.order_id = $1`,
    [orderId]
  );
}

function getByIdFull(orderId) {
  return query(
    `SELECT o.*, s.store_name, s.tg_channel_username, s.telebirr_merchant_id,
            s.location_sub_city, s.physical_address,
            sp.return_policy_type, sp.custom_policy_text,
            u.first_name, u.last_name, u.username AS buyer_username
     FROM orders o
     JOIN stores s ON o.store_id = s.store_id
     JOIN users u ON o.buyer_tg_user_id = u.tg_user_id
     LEFT JOIN seller_policies sp ON s.store_id = sp.store_id
     WHERE o.order_id = $1`,
    [orderId]
  );
}

function getByStore(storeId, { status, limit = 50, offset = 0 } = {}) {
  const conditions = ['o.store_id = $1'];
  const params = [storeId];
  let idx = 2;
  if (status) { conditions.push(`o.order_status = $${idx++}`); params.push(status); }
  const sql = `SELECT o.*, s.store_name
               FROM orders o
               JOIN stores s ON o.store_id = s.store_id
               WHERE ${conditions.join(' AND ')}
               ORDER BY o.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);
  return query(sql, params);
}

function getByBuyer(buyerTgId, { status, limit = 50, offset = 0 } = {}) {
  const conditions = ['o.buyer_tg_user_id = $1'];
  const params = [buyerTgId];
  let idx = 2;
  if (status) { conditions.push(`o.order_status = $${idx++}`); params.push(status); }
  const sql = `SELECT o.*, s.store_name
               FROM orders o
               JOIN stores s ON o.store_id = s.store_id
               WHERE ${conditions.join(' AND ')}
               ORDER BY o.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);
  return query(sql, params);
}

function getStats(storeId) {
  return query(
    `SELECT
       COUNT(*) FILTER (WHERE order_status = 'pending') AS pending_count,
       COUNT(*) FILTER (WHERE order_status = 'dispatched') AS dispatched_count,
       COUNT(*) FILTER (WHERE order_status = 'delivered') AS delivered_count,
       COALESCE(SUM(total_etb) FILTER (WHERE payment_status = 'paid' AND created_at >= NOW() - INTERVAL '30 days'), 0) AS monthly_revenue,
       COALESCE(SUM(total_etb) FILTER (WHERE payment_status = 'paid'), 0) AS total_revenue
     FROM orders WHERE store_id = $1`,
    [storeId]
  );
}

function getActiveCount(storeId) {
  return query(
    `SELECT COUNT(*) FROM orders
     WHERE store_id = $1 AND order_status NOT IN ('delivered','cancelled') AND payment_status = 'paid'`,
    [storeId]
  );
}

function insert(orderData) {
  const { orderRef, buyerTgId, storeId, addressId, deliveryAddress,
          subtotal, deliveryFee, total, paymentMethod,
          policySnapshot, deliveryMethod, couponCode, discount,
          deliveryOtp, deliveryLat, deliveryLng } = orderData;
  return query(
    `INSERT INTO orders (
       order_ref, buyer_tg_user_id, store_id, address_id, delivery_address,
       subtotal_etb, delivery_fee_etb, total_etb, payment_method,
       payment_status, order_status, policy_snapshot, delivery_method,
       coupon_code, discount_etb, delivery_otp,
       delivery_latitude, delivery_longitude
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','pending',$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [orderRef, buyerTgId, storeId, addressId, JSON.stringify(deliveryAddress),
     subtotal, deliveryFee, total, paymentMethod,
     JSON.stringify(policySnapshot), deliveryMethod, couponCode, discount,
     deliveryOtp, deliveryLat, deliveryLng]
  );
}

function updateStatus(orderId, status, extraFields = {}) {
  const sets = [`order_status = '${status}'`, 'updated_at = NOW()'];
  const params = [orderId];
  let idx = 2;
  for (const [col, val] of Object.entries(extraFields)) {
    sets.push(`${col} = $${idx++}`);
    params.push(val);
  }
  return query(
    `UPDATE orders SET ${sets.join(', ')} WHERE order_id = $1 RETURNING *`,
    params
  );
}

function setField(orderId, field, value) {
  return query(
    `UPDATE orders SET ${field} = $2, updated_at = NOW() WHERE order_id = $1`,
    [orderId, value]
  );
}

function logVerificationAttempt(orderId, scannerRole, scannerTgId, scannedRole, orderRef, success, attemptNumber) {
  return query(
    `INSERT INTO delivery_verifications
     (order_id, scanner_role, scanner_tg_id, scanned_role, scanned_order_ref, success, attempt_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orderId, scannerRole, scannerTgId, scannedRole, orderRef || null, success, attemptNumber]
  );
}

async function transaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getById,
  getByIdFull,
  getByStore,
  getByBuyer,
  getStats,
  getActiveCount,
  insert,
  updateStatus,
  setField,
  logVerificationAttempt,
  transaction
};
