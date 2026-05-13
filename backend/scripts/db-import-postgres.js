#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in .env');
  process.exit(2);
}

const schemaFile = path.join(__dirname, '..', 'schema.postgres.sql');
if (!fs.existsSync(schemaFile)) {
  console.error('schema.postgres.sql not found at', schemaFile);
  process.exit(3);
}

const schema = fs.readFileSync(schemaFile, 'utf8');

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  console.log('Connecting to Postgres...');
  const client = await pool.connect();
  try {
    console.log('Beginning import of schema.postgres.sql');
    // Run as a single query; Postgres supports multiple statements separated by semicolons
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');
    console.log('Schema imported successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to import schema:', err.message || err);
    try { await client.query('ROLLBACK'); } catch (e) {}
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
