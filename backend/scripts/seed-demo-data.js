/**
 * Dev utility — seeds demo accounts for testing:
 *   customer@test.com / password123  (customer)
 *   admin@campus.com  / admin123     (admin)
 * Run with: node scripts/seed-demo-data.js
 */
require('dotenv').config();

const bcrypt = require('bcrypt');
const db = require('../src/config/db');

const demoUsers = [
  { email: 'customer@test.com', password: 'password123', full_name: 'Demo Customer', role: 'customer' },
  { email: 'admin@campus.com', password: 'admin123', full_name: 'Administrator', role: 'admin' },
];

(async () => {
  for (const u of demoUsers) {
    const password_hash = await bcrypt.hash(u.password, 10);
    await db.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role)`,
      [u.email, password_hash, u.full_name, u.role]
    );
    console.log(`Seeded ${u.email} (${u.role})`);
  }
  process.exit(0);
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});