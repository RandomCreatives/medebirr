require('dotenv').config({path: require('path').join(__dirname, '.env')});
const {Pool} = require('pg');

const pool = new Pool({connectionString: process.env.DATABASE_URL});

pool.query(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS other_banks JSONB DEFAULT '[]'::jsonb`)
  .then(r => { console.log('Migration applied'); pool.end(); })
  .catch(e => { console.error('Error:', e.message); pool.end(); });