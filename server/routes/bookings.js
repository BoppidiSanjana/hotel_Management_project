const router = require('express').Router();
const { z } = require('zod');
const pool = require('../db/pool');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bookingSchema = z.object({
  guest_id: z.coerce.number().int().positive(),
  room_id: z.coerce.number().int().positive(),
  check_in: date,
  check_out: date,
  paid: z.coerce.boolean().optional().default(false),
});

const TRANSITIONS = {
  reserved: ['checked_in', 'cancelled'],
  checked_in: ['checked_out'],
  checked_out: [],
  cancelled: [],
};

function nightsBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

router.get('/', async (req, res) => {
  const { status, from, to, guest_id } = req.query;
  const where = [];
  const params = [];
  if (status) {
    where.push('b.status = ?');
    params.push(status);
  }
  if (guest_id) {
    where.push('b.guest_id = ?');
    params.push(guest_id);
  }
  if (from) {
    where.push('b.check_out > ?');
    params.push(from);
  }
  if (to) {
    where.push('b.check_in < ?');
    params.push(to);
  }
  const [rows] = await pool.query(
    `SELECT b.*, g.name AS guest_name, g.email AS guest_email, g.phone AS guest_phone,
            r.number AS room_number, r.type AS room_type, r.price_per_night
     FROM bookings b
     JOIN guests g ON g.id = b.guest_id
     JOIN rooms r ON r.id = b.room_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY b.check_in DESC, b.id DESC LIMIT 500`,
    params
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.*, g.name AS guest_name, g.email AS guest_email, g.phone AS guest_phone,
            r.number AS room_number, r.type AS room_type, r.price_per_night
     FROM bookings b JOIN guests g ON g.id = b.guest_id JOIN rooms r ON r.id = b.room_id
     WHERE b.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid booking data' });
  const d = parsed.data;
  const nights = nightsBetween(d.check_in, d.check_out);
  if (!(nights > 0)) return res.status(400).json({ error: 'Check-out must be after check-in' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Locking the room row serializes concurrent bookings for the same room.
    // The overlap check below is also a locking read so it sees the latest
    // committed bookings rather than the transaction's start snapshot.
    const [[room]] = await conn.query('SELECT * FROM rooms WHERE id = ? FOR UPDATE', [d.room_id]);
    if (!room) {
      await conn.rollback();
      return res.status(404).json({ error: 'Room not found' });
    }
    if (room.status !== 'active') {
      await conn.rollback();
      return res.status(409).json({ error: 'Room is under maintenance' });
    }
    const [[guest]] = await conn.query('SELECT id FROM guests WHERE id = ?', [d.guest_id]);
    if (!guest) {
      await conn.rollback();
      return res.status(404).json({ error: 'Guest not found' });
    }

    const [overlap] = await conn.query(
      `SELECT id FROM bookings
       WHERE room_id = ? AND status IN ('reserved','checked_in') AND check_in < ? AND check_out > ?
       LIMIT 1 FOR UPDATE`,
      [d.room_id, d.check_out, d.check_in]
    );
    if (overlap.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'Room is already booked for these dates' });
    }

    const total = (nights * Number(room.price_per_night)).toFixed(2);
    const [r] = await conn.query(
      'INSERT INTO bookings (guest_id, room_id, check_in, check_out, total_amount, paid) VALUES (?,?,?,?,?,?)',
      [d.guest_id, d.room_id, d.check_in, d.check_out, total, d.paid ? 1 : 0]
    );
    await conn.commit();
    res.status(201).json({ id: r.insertId, total_amount: total, nights });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.patch('/:id/status', async (req, res) => {
  const next = req.body && req.body.status;
  const [[b]] = await pool.query('SELECT status FROM bookings WHERE id = ?', [req.params.id]);
  if (!b) return res.status(404).json({ error: 'Booking not found' });
  if (!TRANSITIONS[b.status].includes(next)) {
    return res.status(409).json({ error: `Cannot change a ${b.status} booking to ${next}` });
  }
  await pool.query('UPDATE bookings SET status = ? WHERE id = ?', [next, req.params.id]);
  res.json({ ok: true, status: next });
});

router.patch('/:id/paid', async (req, res) => {
  const paid = req.body && req.body.paid ? 1 : 0;
  const [r] = await pool.query('UPDATE bookings SET paid = ? WHERE id = ?', [paid, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Booking not found' });
  res.json({ ok: true });
});

module.exports = router;
