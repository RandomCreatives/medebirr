require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';
const isServerless = !!process.env.VERCEL;

const connectionString = process.env.DATABASE_URL;

const poolConfig = {
  connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : (connectionString && !connectionString.includes('localhost') ? { rejectUnauthorized: false } : false),
  max: isServerless ? 3 : 10,
  idleTimeoutMillis: isServerless ? 5000 : 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000
};

let pool;

function getPool() {
  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL environment variable is not set.');
    console.error('The application requires a valid PostgreSQL connection string.');
    throw new Error('DATABASE_URL environment variable is not set');
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
  const start = Date.now();
  const res = await getPool().query(text, params);
  if (!isProduction) {
    const duration = Date.now() - start;
    console.log('DB:', { sql: text.substring(0, 100).replace(/\s+/g, ' '), duration, rows: res.rowCount });
  }
  return res;
};

const getClient = async () => {
  const client = await getPool().connect();
  const originalRelease = client.release.bind(client);
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
