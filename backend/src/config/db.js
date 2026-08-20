/**
 * Database connection pool (mysql2/promise).
 *
 * Reads the connection string from DB_URL (.env), e.g.:
 *   DB_URL=mysql://user:password@host:4000/database?ssl-mode=REQUIRED
 *
 * Works with MySQL 5.7+/8.x and TiDB (TiDB speaks the MySQL protocol).
 * The pool is lazy: it does not open sockets until the first query runs,
 * so the server can boot even before the database is reachable.
 */
require('dotenv').config();

const mysql = require('mysql2/promise');

const { DB_URL } = process.env;

if (!DB_URL) {
  throw new Error(
    'DB_URL is not set. Copy .env.example to .env and fill in your MySQL/TiDB connection string.'
  );
}

// mysql2 accepts a full `mysql://` URI via the `uri` option.
// `ssl: {}` enables TLS — required by TiDB Serverless (and recommended everywhere).
const pool = mysql.createPool({
  uri: DB_URL,
  ssl: {}, // use default verification with publicly trusted certs
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Return DATETIME/TIMESTAMP columns as JavaScript Date objects is default;
  // set to true if you prefer ISO strings.
  dateStrings: true,
});

/**
 * Sanity helper: verifies the database is reachable.
 * Used during setup / health checks.
 */
async function testConnection() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT 1 AS ok');
    return rows[0].ok === 1;
  } finally {
    conn.release();
  }
}

module.exports = pool;
module.exports.testConnection = testConnection;
