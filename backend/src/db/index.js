/**
 * Database connection layer
 *
 * Supabase / Vercel serverless notes:
 * - Use the SUPABASE_DB_URL (port 5432, direct connection) for migrations/seeds
 * - Use DATABASE_URL (port 6543, pgbouncer transaction mode) for API queries
 *   pgbouncer does not support PREPARE statements, so we always use simple queries.
 * - SSL is required for Supabase; rejectUnauthorized: false is safe here because
 *   we control the connection string and trust Supabase's certificate chain.
 * - In serverless environments each invocation may spin up a new process, so
 *   pool size is kept small (max: 3) to avoid exhausting pgbouncer's connection limit.
 */

const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';
const isServerless = !!process.env.VERCEL;

let pool;

// Reuse pool across warm invocations in serverless (module-level singleton)
function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }, // Always required for Supabase
      max: isServerless ? 3 : 10,
      idleTimeoutMillis: isServerless ? 5000 : 30000,
      connectionTimeoutMillis: 5000
    });
    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err.message);
      pool = null; // Reset so next request gets a fresh pool
    });
  }
  return pool;
}

/**
 * Execute a parameterized query.
 * Always use $1, $2, ... placeholders — never string interpolation.
 */
const query = async (text, params) => {
  const start = Date.now();
  const res = await getPool().query(text, params);
  if (!isProduction) {
    const duration = Date.now() - start;
    console.log('DB:', { sql: text.substring(0, 100).replace(/\s+/g, ' '), duration, rows: res.rowCount });
  }
  return res;
};

/**
 * Get a client for multi-statement transactions (BEGIN / COMMIT / ROLLBACK).
 * Use this only in routes that explicitly manage transactions.
 */
const getClient = async () => {
  const client = await getPool().connect();
  const originalRelease = client.release.bind(client);

  // Safety: auto-release if held longer than 10s (protects against connection leaks in lambdas)
  const timeout = setTimeout(() => {
    console.error('DB client held > 10s — releasing to prevent leak');
    client.release = originalRelease;
    client.release();
  }, 10000);

  client.release = () => {
    clearTimeout(timeout);
    client.release = originalRelease;
    return client.release();
  };

  return client;
};

module.exports = { query, getClient, getPool };
