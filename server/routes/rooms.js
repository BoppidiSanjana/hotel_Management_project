const router = require('express').Router();
const { z } = require('zod');
const pool = require('../db/pool');
const { today } = require('../util/date');
const { roomStates } = require('../util/roomState');

const roomSchema = z.object({
  number: z.string().min(1).max(10),
  type: z.enum(['single', 'double', 'suite']),
  price_per_night: z.coerce.number().positive(),
  capacity: z.coerce.number().int().min(1).max(10),
  amenities: z.string().max(255).optional().default(''),
  status: z.enum(['active', 'maintenance']).optional().default('active'),
});

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', async (req, res) => {
  const [[rows], states] = await Promise.all([pool.query('SELECT * FROM rooms ORDER BY number'), roomStates(today())]);
  res.json(rows.map((r) => ({ ...r, current: states[r.id]?.current || null, next: states[r.id]?.next || null })));
});

// Rooms free for the whole [from, to) range
router.get('/available', async (req, res) => {
  const { from, to, type } = req.query;
  if (!dateRe.test(from) || !dateRe.test(to) || from >= to) {
    return res.status(400).json({ error: 'Valid from/to dates required (from < to)' });
  }
  const params = [];
  let typeClause = '';
  if (type) {
    typeClause = 'AND r.type = ?';
    params.push(type);
  }
  params.push(to, from);
  const [rows] = await pool.query(
    `SELECT r.* FROM rooms r
     WHERE r.status = 'active' ${typeClause}
       AND r.id NOT IN (
         SELECT room_id FROM bookings
         WHERE status IN ('reserved','checked_in') AND check_in < ? AND check_out > ?
       )
     ORDER BY r.number`,
    params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  try {
    const [r] = await pool.query(
      'INSERT INTO rooms (number, type, price_per_night, capacity, amenities, status) VALUES (?,?,?,?,?,?)',
      [d.number, d.type, d.price_per_night, d.capacity, d.amenities, d.status]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Room number already exists' });
    throw e;
  }
});

router.put('/:id', async (req, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const [r] = await pool.query(
    'UPDATE rooms SET number=?, type=?, price_per_night=?, capacity=?, amenities=?, status=? WHERE id=?',
    [d.number, d.type, d.price_per_night, d.capacity, d.amenities, d.status, req.params.id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'Room not found' });
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM rooms WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Room not found' });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'Room has bookings; set it to maintenance instead' });
    }
    throw e;
  }
});

module.exports = router;
