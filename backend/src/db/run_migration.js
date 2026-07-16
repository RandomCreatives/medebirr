require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'aws-0-eu-central-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.yklkuxujuzthhijeovie',
  password: 'eMerkato2026',
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
