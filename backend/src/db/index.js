/**
 * Database connection layer
 *
 * Supabase connection strategy:
 * - Direct connection (db.[ref].supabase.co:5432) works globally from any region.
 * - pgbouncer pooler (pooler.supabase.com:6543) is region-specific and can cause
 *   ENOTFOUND errors when Vercel's region differs from the Supabase project region.
 * - We use the direct connection with a small pool (max:3) which is safe for
 *   serverless — Supabase supports up to 60 direct connections on the free tier.
 * - SSL is always required for Supabase.
 */

const { Pool } = require('pg');

const isServerless = !!process.env.VERCEL;
const isProduction = process.env.NODE_ENV === 'production';

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Parse the connection string — if it already contains sslmode, pg respects it.
    // We also set ssl in the config as a belt-and-suspenders for Supabase.
    const isLocal =
      /(^|[@/])localhost([:/]|$)/.test(connectionString) ||
      /(^|[@/])127\.0\.0\.1([:/]|$)/.test(connectionString);

    pool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: isServerless ? 3 : 10,
      idleTimeoutMillis: isServerless ? 10000 : 30000,
      connectionTimeoutMillis: 10000
    });

    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err.message);
      pool = null;
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
