require('dotenv').config({ path: require('path').join(__dirname, 'backend/.env') });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connStr = process.env.SUPABASE_DB_URL;
if (!connStr) {
  console.error('SUPABASE_DB_URL not set');
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(__dirname, 'backend/src/db/migration_2.5.sql'),
  'utf8'
);

const client = new Client({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await client.connect();
    console.log('Connected. Applying migration 2.5...');
    await client.query(sql);
    console.log('migration_2.5.sql applied successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
