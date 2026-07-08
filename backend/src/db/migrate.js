require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

async function migrate() {
  if (!connectionString) {
    console.error('❌ Error: SUPABASE_DB_URL or DATABASE_URL environment variable is not set.');
    console.error('If running locally, ensure you have a .env file in the project root or backend directory.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 1
  });

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  let client;
  try {
    client = await pool.connect();
    console.log('Running e-Merkato database migrations...');
    await client.query(sql);
    console.log('✅ Migrations complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

migrate();
