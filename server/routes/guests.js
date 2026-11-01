const router = require('express').Router();
const { z } = require('zod');
const pool = require('../db/pool');

const guestSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(120),
  phone: z.string().max(30).optional().default(''),
  id_proof: z.string().max(60).optional().default(''),
});

router.get('/', async (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const [rows] = await pool.query(
    `SELECT g.*, COALESCE(s.stays, 0) AS stays, COALESCE(s.spent, 0) AS spent, s.last_stay
     FROM guests g
     LEFT JOIN (
       SELECT guest_id, COUNT(*) AS stays, SUM(total_amount) AS spent, MAX(check_out) AS last_stay
       FROM bookings WHERE status <> 'cancelled' GROUP BY guest_id
     ) s ON s.guest_id = g.id
     WHERE g.name LIKE ? OR g.email LIKE ? OR g.phone LIKE ?
     ORDER BY g.name LIMIT 500`,
    [q, q, q]
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const parsed = guestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  try {
    const [r] = await pool.query(
      'INSERT INTO guests (name, email, phone, id_proof) VALUES (?,?,?,?)',
      [d.name, d.email, d.phone, d.id_proof]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A guest with this email already exists' });
    throw e;
  }
});

router.put('/:id', async (req, res) => {
  const parsed = guestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  try {
    const [r] = await pool.query(
      'UPDATE guests SET name=?, email=?, phone=?, id_proof=? WHERE id=?',
      [d.name, d.email, d.phone, d.id_proof, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Guest not found' });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A guest with this email already exists' });
    throw e;
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM guests WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Guest not found' });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'Guest has bookings and cannot be deleted' });
    }
    throw e;
  }
});

module.exports = router;
