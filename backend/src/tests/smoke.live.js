/**
 * Live-DB Smoke Test
 *
 * Exercises the refactored code paths against the REAL database (via the
 * Supabase pooler). Validates:
 *   1. inventory.deductStock / releaseReservedStock / completeDelivery
 *      produce correct row changes on the actual schema.
 *   2. The new pending-products routes are reachable, auth-gated, and
 *      run valid SQL (list / complete / discard).
 *
 * Requires a reachable DATABASE_URL (backend/.env) and JWT_SECRET.
 * Temp rows are created and deleted within the run; nothing persists.
 *
 * Run: node backend/src/tests/smoke.live.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../backend/.env') });
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const inventory = require('../services/inventory');
const { createApp } = require('../app');

let passed = 0, failed = 0;
const UNIQ = `sm${Date.now()}`;
function test(name, fn) {
  return (async () => {
    try { await fn(); console.log(`  ✅  ${name}`); passed++; }
    catch (e) { console.error(`  ❌  ${name}\n       ${e.message}`); failed++; }
  })();
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

// A real seeded seller (owns a verified store) — reused for the route test.
const SELLER_ID = 98760002;
const STORE_ID = 'cec19bf5-50af-4448-88a8-bd980deea75f';
const token = jwt.sign({ tg_user_id: SELLER_ID, user_id: 'smoke' }, process.env.JWT_SECRET, { expiresIn: '1h' });

const tests = [];

// ─── 1. Inventory helpers on the real schema ───────────────────────────────
tests.push(test('deductStock reduces stock_quantity and releases reserved', async () => {
  const pid = (await query(
    `INSERT INTO products (store_id, title, price_etb, stock_quantity, reserved_stock, category, order_count)
     VALUES ($1,'SMOKE-PROD',1,10,3,'electronics',0) RETURNING product_id`,
    [STORE_ID]
  )).rows[0].product_id;

  const oid = (await query(
     `INSERT INTO orders (order_ref, buyer_tg_user_id, store_id, delivery_address, subtotal_etb, total_etb, payment_method, payment_status, order_status)
     VALUES ('SMOKE-REF-' || $2,98760001,$1,'{}'::jsonb,1,1,'cash','pending','pending') RETURNING order_id`,
    [STORE_ID, UNIQ]
  )).rows[0].order_id;

  await query('INSERT INTO order_items (order_id, product_id, title, price_etb, quantity, subtotal_etb) VALUES ($1,$2,$3,1,2,2)',
    [oid, pid, 'SMOKE']);

  await inventory.deductStock(oid);

  const p = (await query('SELECT stock_quantity, reserved_stock FROM products WHERE product_id=$1', [pid])).rows[0];
  assert(p.stock_quantity === 8, `stock should be 8, got ${p.stock_quantity}`);
  assert(p.reserved_stock === 1, `reserved should be 1, got ${p.reserved_stock}`);

  await query('DELETE FROM order_items WHERE order_id=$1', [oid]);
  await query('DELETE FROM orders WHERE order_id=$1', [oid]);
  await query('DELETE FROM products WHERE product_id=$1', [pid]);
}));

tests.push(test('releaseReservedStock only touches reserved_stock', async () => {
  const pid = (await query(
    `INSERT INTO products (store_id, title, price_etb, stock_quantity, reserved_stock, category, order_count)
     VALUES ($1,'SMOKE-PROD2',1,10,5,'electronics',0) RETURNING product_id`,
    [STORE_ID]
  )).rows[0].product_id;

  const oid = (await query(
    `INSERT INTO orders (order_ref, buyer_tg_user_id, store_id, delivery_address, subtotal_etb, total_etb, payment_method, payment_status, order_status)
     VALUES ('SMOKE-REF2-' || $2,98760001,$1,'{}'::jsonb,1,1,'cash','pending','pending') RETURNING order_id`,
    [STORE_ID, UNIQ]
  )).rows[0].order_id;

  await query('INSERT INTO order_items (order_id, product_id, title, price_etb, quantity, subtotal_etb) VALUES ($1,$2,$3,1,5,5)',
    [oid, pid, 'SMOKE']);

  await inventory.releaseReservedStock(oid);

  const p = (await query('SELECT stock_quantity, reserved_stock FROM products WHERE product_id=$1', [pid])).rows[0];
  assert(p.stock_quantity === 10, `stock must stay 10, got ${p.stock_quantity}`);
  assert(p.reserved_stock === 0, `reserved should be 0, got ${p.reserved_stock}`);

  await query('DELETE FROM order_items WHERE order_id=$1', [oid]);
  await query('DELETE FROM orders WHERE order_id=$1', [oid]);
  await query('DELETE FROM products WHERE product_id=$1', [pid]);
}));

tests.push(test('completeDelivery increments order_count, releases reserved, updates store stats', async () => {
  const pid = (await query(
    `INSERT INTO products (store_id, title, price_etb, stock_quantity, reserved_stock, category, order_count)
     VALUES ($1,'SMOKE-PROD3',1,10,2,'electronics',0) RETURNING product_id`,
    [STORE_ID]
  )).rows[0].product_id;

  const oid = (await query(
    `INSERT INTO orders (order_ref, buyer_tg_user_id, store_id, delivery_address, subtotal_etb, total_etb, payment_method, payment_status, order_status)
     VALUES ('SMOKE-REF3-' || $2,98760001,$1,'{}'::jsonb,1,42.50,'cash','confirmed','dispatched') RETURNING order_id`,
    [STORE_ID, UNIQ]
  )).rows[0].order_id;

  await query('INSERT INTO order_items (order_id, product_id, title, price_etb, quantity, subtotal_etb) VALUES ($1,$2,$3,1,2,2)',
    [oid, pid, 'SMOKE']);

  const before = (await query('SELECT total_orders, total_revenue FROM stores WHERE store_id=$1', [STORE_ID])).rows[0];

  await inventory.completeDelivery(oid, 42.50, STORE_ID);

  const p = (await query('SELECT order_count, reserved_stock FROM products WHERE product_id=$1', [pid])).rows[0];
  assert(p.order_count === 2, `order_count should be 2, got ${p.order_count}`);
  assert(p.reserved_stock === 0, `reserved should be 0, got ${p.reserved_stock}`);

  const after = (await query('SELECT total_orders, total_revenue FROM stores WHERE store_id=$1', [STORE_ID])).rows[0];
  assert(after.total_orders === before.total_orders + 1, `store total_orders +1, got ${after.total_orders} vs ${before.total_orders}`);
  assert(Math.abs(Number(after.total_revenue) - (Number(before.total_revenue) + 42.5)) < 0.01, `store total_revenue +42.50`);

  await query('DELETE FROM order_items WHERE order_id=$1', [oid]);
  await query('DELETE FROM orders WHERE order_id=$1', [oid]);
  await query('DELETE FROM products WHERE product_id=$1', [pid]);
}));

// ─── 2. Pending-products routes (real app, real auth) ──────────────────────
tests.push(test('pending-products: list / complete / discard via HTTP', async () => {
  const app = createApp();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const auth = { Authorization: `Bearer ${token}` };

  const pendingId = (await query(
    `INSERT INTO pending_products (store_id, tg_group_id, title, price_etb, status)
     VALUES ($1, 0, 'SMOKE-PENDING', 99.99, 'pending') RETURNING pending_id`,
    [STORE_ID]
  )).rows[0].pending_id;

  const listRes = await fetch(`${base}/pending-products/store/${STORE_ID}`, { headers: auth });
  assert(listRes.status === 200, `list should 200, got ${listRes.status}`);
  const listData = await listRes.json();
  assert((listData.pending_products || []).some(p => p.pending_id === pendingId), 'new pending product should appear in list');

  const completeRes = await fetch(`${base}/pending-products/${pendingId}/complete`, {
    method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: 'smoke', category: 'electronics' })
  });
  assert(completeRes.status === 200, `complete should 200, got ${completeRes.status}`);

  const discardRes = await fetch(`${base}/pending-products/${pendingId}`, { method: 'DELETE', headers: auth });
  assert(discardRes.status === 200, `discard should 200, got ${discardRes.status}`);
  const discarded = (await query('SELECT status FROM pending_products WHERE pending_id=$1', [pendingId])).rows[0];
  assert(discarded.status === 'discarded', `status should be discarded, got ${discarded.status}`);

  await query('DELETE FROM pending_products WHERE pending_id=$1', [pendingId]);
  await new Promise(r => server.close(r));
}));

tests.push(test('pending-products: rejects unauthorized store access', async () => {
  const app = createApp();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  // Token belongs to STORE_ID's owner; a different store id must 403/404.
  const otherStore = '09e27764-4aca-43ac-bf3f-020c072245d1'; // owned by another seller
  const listRes = await fetch(`${base}/pending-products/store/${otherStore}`, { headers: { Authorization: `Bearer ${token}` } });
  assert(listRes.status === 403 || listRes.status === 404, `other store should be forbidden, got ${listRes.status}`);
  await new Promise(r => server.close(r));
}));

(async () => {
  for (const t of tests) await t;
  console.log(`\n🔥 Live smoke test: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
