/**
 * One-time setup script: applies backend/schema.sql to the target
 * MySQL/TiDB database using the DB_URL from .env.
 *
 * Run with: node scripts/init-db.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');

  // A dedicated connection is used (not the pool) so we can
  // pass multipleStatements to run the whole file in one shot.
  const conn = await mysql.createConnection({
    uri: process.env.DB_URL,
    ssl: {}, // TLS required by TiDB Serverless
    multipleStatements: true,
  });

  console.log('Connected to TiDB. Applying schema...');
  await conn.query(sql);

  const [tables] = await conn.query('SHOW TABLES');
  console.log('\nTables created:');
  tables.forEach((row) => console.log('  -', Object.values(row)[0]));

  const [dbs] = await conn.query('SHOW DATABASES');
  console.log('\nDatabases available:');
  dbs.forEach((row) => console.log('  -', Object.values(row)[0]));

  await conn.end();
  console.log('\nSchema applied successfully.');
})().catch((err) => {
  console.error('\nSchema application FAILED:', err.message);
  process.exit(1);
});