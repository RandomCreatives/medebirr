/**
 * Deadlock retry helper.
 * Wraps a route handler so that when PostgreSQL error 40P01 (deadlock)
 * occurs the operation is retried after a brief backoff.
 *
 * Usage:
 *   router.post('/', retryOnDeadlock(async (req, res, next) => { … }));
 */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;

function retryOnDeadlock(fn) {
  return async (req, res, next) => {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn(req, res, next);
      } catch (err) {
        lastErr = err;
        if (err.code === '40P01' && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 50;
          console.warn(`🔄 Deadlock detected (attempt ${attempt}/${MAX_RETRIES}), retrying in ${Math.round(delay)}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        break;
      }
    }
    next(lastErr);
  };
}

module.exports = { retryOnDeadlock };
