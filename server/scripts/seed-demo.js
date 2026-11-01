const pool = require('../db/pool');

const first = ['Aarav', 'Emma', 'Liam', 'Sofia', 'Noah', 'Priya', 'Oliver', 'Mei', 'Lucas', 'Ananya', 'Ethan', 'Isabella',
  'Rohan', 'Chloe', 'Daniel', 'Fatima', 'Mateo', 'Hannah', 'Kabir', 'Amelia', 'Arjun', 'Zoe', 'Hiro', 'Nora', 'Vikram',
  'Layla', 'Jack', 'Meera', 'Samuel', 'Elena', 'Omar', 'Grace', 'Dev', 'Clara', 'Leo', 'Ishita', 'Tom', 'Yuki', 'Nina', 'Adam'];
const last = ['Sharma', 'Johnson', 'Garcia', 'Patel', 'Williams', 'Chen', 'Müller', 'Reddy', 'Brown', 'Tanaka', 'Rossi',
  'Khan', 'Davies', 'Nair', 'Martin', 'Silva', 'Kim', 'Anderson', 'Gupta', 'Dubois', 'Wilson', 'Iyer', 'Moreau', 'Singh',
  'Taylor', 'Costa', 'Mehta', 'Walker', 'Novak', 'Haddad'];
const domains = ['example.com', 'example.org', 'example.net'];
const idTypes = ['Passport', 'Driving licence', 'National ID', 'Aadhaar'];

// Deterministic so reruns produce the same dataset
let seed = 20261101;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const day = (s, n = 0) => new Date(Date.parse(s) + n * 86400000).toISOString().slice(0, 10);
const nights = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const today = new Date().toISOString().slice(0, 10);

async function main() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM guests');
  if (n > 0 && !process.argv.includes('--force')) {
    throw new Error('guests table is not empty; pass --force to add demo data anyway');
  }

  const [rooms] = await pool.query("SELECT id, type, price_per_night FROM rooms WHERE status = 'active'");
  if (!rooms.length) throw new Error('No rooms found; run npm run setup first');

  // Guests
  const used = new Set();
  const guests = [];
  while (guests.length < 42) {
    const f = pick(first), l = pick(last);
    const email = `${f}.${l}${between(1, 99)}@${pick(domains)}`.toLowerCase().replace('ü', 'u');
    if (used.has(email)) continue;
    used.add(email);
    const phone = `+${pick(['1', '44', '91', '49', '81'])} ${between(70000, 99999)} ${between(10000, 99999)}`;
    const proof = `${pick(idTypes)} ${String.fromCharCode(65 + between(0, 25))}${between(1000000, 9999999)}`;
    guests.push([`${f} ${l}`, email, phone, proof]);
  }
  const [gr] = await pool.query('INSERT INTO guests (name, email, phone, id_proof) VALUES ?', [guests]);
  const guestIds = Array.from({ length: guests.length }, (_, i) => gr.insertId + i);

  // Bookings: walk each room's timeline so stays never overlap
  const rows = [];
  const startDate = day(today, -95);
  const endDate = day(today, 75);
  for (const room of rooms) {
    let cur = day(startDate, between(0, 4));
    while (cur < endDate) {
      const len = room.type === 'suite' ? between(2, 6) : room.type === 'double' ? between(1, 5) : between(1, 4);
      const out = day(cur, len);
      let status;
      if (out <= today) status = rnd() < 0.07 ? 'cancelled' : 'checked_out';
      else if (cur <= today) status = 'checked_in';
      else status = rnd() < 0.08 ? 'cancelled' : 'reserved';

      let paid = 0;
      if (status === 'checked_out') paid = rnd() < 0.95 ? 1 : 0;
      else if (status === 'checked_in') paid = rnd() < 0.55 ? 1 : 0;
      else if (status === 'reserved') paid = rnd() < 0.25 ? 1 : 0;
      else paid = 0;

      const total = (nights(cur, out) * Number(room.price_per_night)).toFixed(2);
      const booked = day(cur, -between(2, 35));
      const createdAt = `${booked > today ? today : booked} ${String(between(8, 21)).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}:00`;
      rows.push([pick(guestIds), room.id, cur, out, status, total, paid, createdAt]);

      cur = day(out, between(0, 2));
    }
  }

  await pool.query(
    'INSERT INTO bookings (guest_id, room_id, check_in, check_out, status, total_amount, paid, created_at) VALUES ?',
    [rows]
  );
  console.log(`Inserted ${guests.length} guests and ${rows.length} bookings`);
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
