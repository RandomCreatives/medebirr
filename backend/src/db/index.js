require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config();

const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const isServerless = !!process.env.VERCEL;

const connectionString = process.env.DATABASE_URL;

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
    throw new Error('DATABASE_URL is not set. Please configure it in Vercel settings.');
  }

  if (isProduction && (connectionString.includes('127.0.0.1') || connectionString.includes('localhost'))) {
    throw new Error('DATABASE_URL points to localhost, but the app is in production mode.');
  }

  if (!pool) {
    pool = new Pool(poolConfig);
    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err.message);
      pool = null;
    });
  }
  return pool;
}

const query = async (text, params) => {
  try {
    const p = getPool();
    return await p.query(text, params);
  } catch (err) {
    // Detailed error for ENOTFOUND
    if (err.code === 'ENOTFOUND') {
      const host = connectionString?.split('@')[1]?.split(':')[0] || 'unknown';
      err.message = `Hostname unreachable: ${host}. Ensure your DATABASE_URL uses the correct Supabase pooler host (aws-0-eu-central-1.pooler.supabase.com).`;
    }
    throw err;
  }
};

const getClient = async () => {
  const p = getPool();
  return await p.connect();
};

module.exports = { query, getClient, getPool };
