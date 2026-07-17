/**
 * App factory tests (no live DB required).
 *
 * Guards against the divergence that previously existed between api/index.js
 * and server.js: the shared createApp() factory must wire every route
 * (including the previously-missing pending-products) and report a single
 * version string.
 */

let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

const { createApp, APP_VERSION } = require('../../src/app');

const tests = [];

console.log('\n🧩 App Factory');

test('app reports a single unified version (1.3.0)', () => {
  const app = createApp();
  assert(app.get('version') === '1.3.0', 'app version should be 1.3.0');
  assert(APP_VERSION === '1.3.0', 'exported APP_VERSION should be 1.3.0');
});

test('pending-products routes are wired', () => {
  const app = createApp();
  const routes = [];
  app._router.stack.forEach(layer => {
    if (layer.route && layer.route.path) {
      routes.push(layer.route.path);
    } else if (layer.name === 'router') {
      // Determine the mount prefix from the layer's regexp (e.g. /api/v1/pending\-products/)
      const src = layer.regexp.toString();
      const m = src.match(/\\\/api\\\/v1\\\/([a-z-]+)/);
      const prefix = m ? `/api/v1/${m[1]}` : '';
      layer.handle.stack.forEach(l => {
        if (l.route) {
          const sub = l.route.path === '/' ? '' : l.route.path;
          routes.push(prefix + sub);
        }
      });
    }
  });
  // The four endpoints the frontend Api.pending.* depends on.
  const needed = [
    '/api/v1/pending-products/store/:storeId',
    '/api/v1/pending-products/:id/complete',
    '/api/v1/pending-products/:id/publish',
    '/api/v1/pending-products/:id'
  ];
  for (const n of needed) {
    assert(routes.includes(n), `missing route ${n} (found: ${routes.filter(r => r.includes('pending')).join(', ')})`);
  }
});

test('core routers are all mounted (no silent route drop)', () => {
  const app = createApp();
  const mounted = [];
  app._router.stack.forEach(layer => {
    if (layer.name === 'router' && layer.regexp) {
      const m = layer.regexp.toString().match(/\\\/api\\\/v1\\\/([a-z-]+)/);
      if (m) mounted.push(m[1]);
    }
  });
  const expectMounted = ['auth', 'stores', 'products', 'orders', 'payments', 'users', 'bot', 'reviews', 'coupons', 'images', 'delivery', 'pending-products', 'social'];
  for (const r of expectMounted) {
    assert(mounted.includes(r), `router /${r} should be mounted`);
  }
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
  console.log(`\n🧩 App factory tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
})();
