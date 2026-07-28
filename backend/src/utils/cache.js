/**
 * In-memory TTL Cache
 * Simple, zero-dependency cache with automatic expiration
 */

class TTLCache {
  constructor(defaultTTL = 60000) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get value from cache
   * @param {string} key
   * @returns {any|null} cached value or null if expired/missing
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set value in cache with TTL
   * @param {string} key
   * @param {any} value
   * @param {number} ttl - TTL in milliseconds (optional, uses default)
   */
  set(key, value, ttl = this.defaultTTL) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });
  }

  /**
   * Delete key from cache
   * @param {string} key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get or set pattern - fetch from cache or compute and cache
   * @param {string} key
   * @param {Function} fn - async function to compute value
   * @param {number} ttl - TTL in milliseconds
   */
  async getOrSet(key, fn, ttl) {
    const cached = this.get(key);
    if (cached !== null) return cached;

    const value = await fn();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Invalidate keys matching a prefix
   * @param {string} prefix
   */
  invalidatePrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache stats
   */
  stats() {
    let expired = 0;
    const now = Date.now();
    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) expired++;
    }
    return {
      size: this.cache.size,
      expired,
      active: this.cache.size - expired
    };
  }
}

// Singleton instances for different cache domains
const productCache = new TTLCache(30000);      // 30s for product details
const storeCache = new TTLCache(60000);        // 1min for store lookups
const featuredCache = new TTLCache(120000);    // 2min for featured lists
const searchCache = new TTLCache(15000);       // 15s for search results
const statsCache = new TTLCache(60000);        // 1min for dashboard stats

module.exports = {
  TTLCache,
  productCache,
  storeCache,
  featuredCache,
  searchCache,
  statsCache
};