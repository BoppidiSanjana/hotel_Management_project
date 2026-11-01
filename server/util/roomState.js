const pool = require('../db/pool');

// For each room: the booking holding it today (if any) and the next one after
async function roomStates(todayStr) {
  const [rows] = await pool.query(
    `SELECT b.id, b.room_id, b.check_in, b.check_out, b.status, b.paid, g.name AS guest_name
     FROM bookings b JOIN guests g ON g.id = b.guest_id
     WHERE b.status IN ('reserved','checked_in') AND b.check_out > ?
     ORDER BY b.check_in`,
    [todayStr]
  );
  const map = {};
  for (const b of rows) {
    const s = (map[b.room_id] ||= { current: null, next: null });
    if (b.check_in <= todayStr && !s.current) s.current = b;
    else if (b.check_in > todayStr && !s.next) s.next = b;
  }
  return map;
}

module.exports = { roomStates };
