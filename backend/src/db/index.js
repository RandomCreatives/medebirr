require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const isServerless = !!process.env.VERCEL;

const connectionString = process.env.DATABASE_URL;

// Validation and explicit error reporting
if (!connectionString && (isProduction || isServerless)) {
  const msg = 'DATABASE_URL is missing. Please set it in Vercel/Environment settings.';
  console.error('❌ ' + msg);
}

const poolConfig = {
  connectionString: connectionString || undefined,
  ssl: (isProduction || (connectionString && !connectionString.includes('localhost')))
    ? { rejectUnauthorized: false }
    : false,
  max: isServerless ? 3 : 10,
  idleTimeoutMillis: isServerless ? 5000 : 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000
};

let pool;

function getPool() {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Check your environment variables.');
  }

  // Prevent connecting to localhost in production
  if (isProduction && (connectionString.includes('127.0.0.1') || connectionString.includes('localhost'))) {
    throw new Error('DATABASE_URL points to localhost, but the app is in production mode.');
  }

  if (!pool) {
    pool = new Pool(poolConfig);
    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err.message);
      pool = null; // Clear so it can be re-initialized
    });
  }
  return pool;
}

const query = async (text, params) => {
  try {
    const p = getPool();
    const res = await p.query(text, params);
    return res;
  } catch (err) {
    // Wrap error to ensure it's helpful
    if (err.message.includes('ECONNREFUSED')) {
      err.message = 'Database connection refused. Ensure DATABASE_URL is correct and Supabase is active.';
    }
    throw err;
  }
};

const getClient = async () => {
  const p = getPool();
  return await p.connect();
};

module.exports = { query, getClient, getPool };
