const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const seedRooms = [
  ['101', 'single', 80, 1, 'WiFi, Desk'],
  ['102', 'single', 80, 1, 'WiFi, Desk'],
  ['201', 'double', 130, 2, 'WiFi, Balcony, Mini bar'],
  ['202', 'double', 130, 2, 'WiFi, City view'],
  ['203', 'double', 140, 3, 'WiFi, Balcony, Sofa'],
  ['301', 'suite', 260, 4, 'WiFi, Lounge, Bathtub, Mini bar'],
  ['302', 'suite', 320, 4, 'WiFi, Terrace, Bathtub, Kitchenette'],
];

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await pool.query(stmt);
  }

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('Set ADMIN_PASSWORD in .env before running setup');
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (username, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
    [username, hash]
  );

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM rooms');
  if (n === 0) {
    await pool.query(
      'INSERT INTO rooms (number, type, price_per_night, capacity, amenities) VALUES ?',
      [seedRooms]
    );
    console.log(`Seeded ${seedRooms.length} rooms`);
  }
  console.log('Setup complete');
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
