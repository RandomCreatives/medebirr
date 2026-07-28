require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const dir = __dirname;
  const files = fs.readdirSync(dir)
    .filter(f => /^migration_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    try {
      await pool.query(sql);
      console.log(`${file} applied successfully`);
    } catch (err) {
      console.error(`Migration ${file} failed:`, err.message);
    }
  }
  await pool.end();
}
run();
