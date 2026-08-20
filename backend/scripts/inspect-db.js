/**
 * Dev utility — quick database inspection.
 * Dumps users, restaurants and vendor_requests.
 * Run with: node scripts/inspect-db.js
 */
require('dotenv').config();

const db = require('../src/config/db');

(async () => {
  const [users] = await db.query(
    'SELECT id, email, role, full_name, phone, created_at FROM users ORDER BY id'
  );
  console.log('USERS:');
  users.forEach((u) => console.log(`  #${u.id} ${u.email} | role: ${u.role} | name: ${u.full_name} | created: ${u.created_at}`));

  const [rest] = await db.query(
    'SELECT r.id, r.name, r.owner_id, r.cuisine_type, r.is_active, u.email AS owner_email FROM restaurants r JOIN users u ON u.id = r.owner_id ORDER BY r.id'
  );
  console.log('RESTAURANTS:');
  rest.forEach((x) => console.log(`  #${x.id} ${x.name} | owner: ${x.owner_email} | cuisine: ${x.cuisine_type || '-'} | active: ${x.is_active}`));

  const [reqs] = await db.query(
    'SELECT id, email, restaurant_name, status, admin_comment FROM vendor_requests ORDER BY id'
  );
  console.log('VENDOR_REQUESTS:');
  reqs.forEach((x) => console.log(`  #${x.id} ${x.restaurant_name} | ${x.status} | comment: ${x.admin_comment || '-'}`));

  process.exit(0);
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});