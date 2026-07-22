/**
 * Inventory helper tests
 *
 * Verifies the stock/delivery math centralized in services/inventory.js by
 * injecting a mock `query` (no live DB needed). These protect the
 * money-critical paths: stock is deducted at payment, released on cancel,
 * and counted toward store stats only at delivery.
 */

let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// Mock query captures every call so we can assert the SQL + params.
function makeMockQuery(stockOverride) {
  const calls = [];
  const query = async (text, params) => {
    calls.push({ text, params });
    // Simulate order_items lookup used inside the helpers.
    if (/FROM order_items/.test(text)) {
      return { rows: [{ product_id: 'p1', quantity: 2 }, { product_id: 'p2', quantity: 1 }] };
    }
    // Simulate SELECT ... FOR UPDATE stock check
    if (/FOR UPDATE/.test(text)) {
      const s = stockOverride != null ? stockOverride : 10;
      return { rows: [{ stock_quantity: s }] };
    }
    return { rows: [], rowCount: 1 };
  };
  return { query, calls };
}

// Stub the real db module with a mock that routes to our per-test `query`.
const path = require('path');
const dbAbsolute = path.resolve(__dirname, '../../src/db/index.js');
let mockQuery;
let mockClient;

// Require inventory.js through our stubbed require so its `require('../db')`
// resolves to our mock instead of the real (DB-backed) module.
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  let resolved = request;
  try { resolved = Module._resolveFilename(request, parent, isMain); } catch (_) {}
  if (resolved === dbAbsolute) {
    return {
      query: (...args) => mockQuery(...args),
      getClient: async () => mockClient
    };
  }
  return originalLoad.apply(this, arguments);
};

const inventory = require('../../src/services/inventory');

console.log('\n📦 Inventory & Sales Helpers');

const tests = [];

function makeMockClient(mockQ) {
  const calls = mockQ.calls || [];
  const q = mockQ.query || mockQ;
  return {
    query: async (text, params) => {
      // Pass through BEGIN/COMMIT/ROLLBACK without recording
      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(text.trim())) return { rows: [] };
      return q(text, params);
    },
    release: () => {}
  };
}

test('deductStock reduces stock_quantity AND reserved_stock for every item', () => {
  const { query, calls } = makeMockQuery();
  mockQuery = query;
  mockClient = makeMockClient({ query, calls });
  return inventory.deductStock('o1').then(() => {
    const updates = calls.filter(c => /UPDATE products/.test(c.text) && /stock_quantity/.test(c.text));
    assert(updates.length === 2, 'expected 2 product stock updates');
    const allDeduct = updates.every(c => /stock_quantity = GREATEST\(0, stock_quantity - \$1\)/.test(c.text) && /reserved_stock = GREATEST\(0, reserved_stock - \$1\)/.test(c.text));
    assert(allDeduct, 'each update must reduce stock_quantity and reserved_stock');
    assert(updates[0].params[0] === 2, 'first item qty=2');
    assert(updates[1].params[0] === 1, 'second item qty=1');
    // Verify FOR UPDATE lock was acquired
    const locks = calls.filter(c => /FOR UPDATE/.test(c.text));
    assert(locks.length === 2, 'expected 2 SELECT ... FOR UPDATE locks');
  });
});

test('releaseReservedStock only touches reserved_stock (never stock_quantity)', () => {
  const { query, calls } = makeMockQuery();
  mockQuery = query;
  return inventory.releaseReservedStock('o1').then(() => {
    const updates = calls.filter(c => /UPDATE products/.test(c.text));
    assert(updates.length === 2, 'expected 2 product updates');
    const noneReduceStock = updates.every(c => !/stock_quantity/.test(c.text));
    assert(noneReduceStock, 'releaseReservedStock must NOT alter stock_quantity');
    const allRelease = updates.every(c => /reserved_stock = GREATEST\(0, reserved_stock - \$1\)/.test(c.text));
    assert(allRelease, 'each update must reduce reserved_stock');
  });
});

test('completeDelivery increments order_count, releases reserved, and updates store stats', () => {
  const { query, calls } = makeMockQuery();
  mockQuery = query;
  mockClient = makeMockClient({ query, calls });
  return inventory.completeDelivery('o1', 150, 's1').then(() => {
    const prodUpdates = calls.filter(c => /UPDATE products/.test(c.text) && /order_count/.test(c.text));
    assert(prodUpdates.length === 2, 'expected 2 product order_count updates');
    const allGood = prodUpdates.every(c => /order_count = order_count \+ \$1/.test(c.text) && /reserved_stock = GREATEST\(0, reserved_stock - \$1\)/.test(c.text));
    assert(allGood, 'product updates must +order_count and -reserved_stock');

    const storeUpdate = calls.find(c => /UPDATE stores/.test(c.text) && /total_orders/.test(c.text));
    assert(storeUpdate, 'store stats must be updated');
    assert(/total_orders = total_orders \+ 1/.test(storeUpdate.text), 'store total_orders +1');
    assert(/total_revenue = total_revenue \+ \$1/.test(storeUpdate.text), 'store total_revenue +amount');
    assert(storeUpdate.params[0] === 150, 'revenue amount passed through');
    assert(storeUpdate.params[1] === 's1', 'store_id passed through');
  });
});

test('deductStock throws on insufficient stock', () => {
  const { query, calls } = makeMockQuery(0);
  mockQuery = query;
  mockClient = makeMockClient({ query, calls });
  return inventory.deductStock('o1').then(
    () => { throw new Error('should have thrown'); },
    (err) => {
      assert(/Insufficient stock/.test(err.message), 'should mention insufficient stock');
    }
  );
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✅  ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌  ${name}`);
      console.error(`       ${err.message}`);
      failed++;
    }
  }
  console.log(`\n📦 Inventory tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
})();

