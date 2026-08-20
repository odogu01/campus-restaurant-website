/**
 * Dev utility — creates an admin user (or promotes an existing one).
 *
 * Usage:
 *   node scripts/create-admin.js                 # admin@campus.com / admin123
 *   node scripts/create-admin.js bob@mail.com    # password defaults to admin123
 *   node scripts/create-admin.js bob@mail.com S3cret!
 */
require('dotenv').config();

const bcrypt = require('bcrypt');
const db = require('../src/config/db');

const email = process.argv[2] || 'admin@campus.com';
const password = process.argv[3] || 'admin123';

(async () => {
  const password_hash = await bcrypt.hash(password, 10);

  // Promote if the email already exists, otherwise insert a fresh admin.
  const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    await db.query('UPDATE users SET role = ?, password_hash = ? WHERE id = ?', ['admin', password_hash, existing[0].id]);
    console.log(`Promoted existing user to admin: ${email}`);
  } else {
    await db.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, 'Administrator', 'admin')`,
      [email, password_hash]
    );
    console.log(`Created admin: ${email}`);
  }

  console.log(`Credentials -> email: ${email} | password: ${password}`);
  process.exit(0);
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});