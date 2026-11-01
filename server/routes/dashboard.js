const router = require('express').Router();
const pool = require('../db/pool');
const { today, addDays, monthStart } = require('../util/date');
const { roomStates } = require('../util/roomState');

const TREND_DAYS = 14;

router.get('/stats', async (req, res) => {
  const t = today();
  const trendFrom = addDays(t, -(TREND_DAYS - 1));
  const prevMonth = monthStart(t, -1);
  const revFrom = monthStart(t, -4);
  const revTo = monthStart(t, 3);

  const baseSelect = `SELECT b.id, b.status, b.paid, b.check_in, b.check_out, b.total_amount,
       g.name AS guest_name, r.number AS room_number, r.type AS room_type
     FROM bookings b JOIN guests g ON g.id = b.guest_id JOIN rooms r ON r.id = b.room_id`;

  // Independent reads: run together, since round trips to a hosted DB dominate latency
  const [
    [rooms],
    [stays],
    [revRows],
    states,
    [arrivals],
    [departures],
    [upcoming],
    [noShows],
    [dueSoon],
    [[unpaid]],
  ] = await Promise.all([
    pool.query('SELECT id, number, type, status FROM rooms ORDER BY number'),
    pool.query(
      `SELECT room_id, check_in, check_out FROM bookings
       WHERE status IN ('checked_in','checked_out') AND check_out > ? AND check_in <= ?`,
      [addDays(trendFrom, -1), t]
    ),
    pool.query(
      `SELECT DATE_FORMAT(check_in, '%Y-%m') AS ym, SUM(total_amount) AS revenue, COUNT(*) AS bookings
       FROM bookings WHERE status <> 'cancelled' AND check_in >= ? AND check_in < ?
       GROUP BY ym`,
      [revFrom, revTo]
    ),
    roomStates(t),
    pool.query(`${baseSelect} WHERE b.check_in = ? AND b.status IN ('reserved','checked_in') ORDER BY r.number`, [t]),
    pool.query(`${baseSelect} WHERE b.check_out = ? AND b.status IN ('checked_in','checked_out') ORDER BY r.number`, [t]),
    pool.query(
      `${baseSelect} WHERE b.check_in > ? AND b.check_in <= ? AND b.status = 'reserved' ORDER BY b.check_in, r.number LIMIT 6`,
      [t, addDays(t, 7)]
    ),
    pool.query(`${baseSelect} WHERE b.status = 'reserved' AND b.check_in < ? ORDER BY b.check_in LIMIT 5`, [t]),
    pool.query(
      `${baseSelect} WHERE b.status = 'checked_in' AND b.paid = 0 AND b.check_out <= ? ORDER BY b.check_out LIMIT 5`,
      [addDays(t, 1)]
    ),
    pool.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_amount), 0) AS amount FROM bookings
       WHERE paid = 0 AND status IN ('checked_in','checked_out')`
    ),
  ]);

  const active = rooms.filter((r) => r.status === 'active');
  const occupancyTrend = Array.from({ length: TREND_DAYS }, (_, i) => {
    const d = addDays(trendFrom, i);
    const occupied = new Set(stays.filter((s) => s.check_in <= d && s.check_out > d).map((s) => s.room_id)).size;
    return { date: d, occupied, pct: active.length ? Math.round((occupied / active.length) * 100) : 0 };
  });

  const revByYm = Object.fromEntries(revRows.map((r) => [r.ym, r]));
  const revenueByMonth = Array.from({ length: 7 }, (_, i) => {
    const ym = monthStart(t, i - 4).slice(0, 7);
    return {
      month: ym,
      revenue: Number(revByYm[ym]?.revenue || 0),
      bookings: Number(revByYm[ym]?.bookings || 0),
      future: ym > t.slice(0, 7),
      current: ym === t.slice(0, 7),
    };
  });
  const thisMonth = revenueByMonth.find((m) => m.current);
  const lastMonth = revenueByMonth.find((m) => m.month === prevMonth.slice(0, 7));

  const roomBoard = rooms.map((r) => {
    const s = states[r.id] || {};
    let state = 'available';
    if (r.status === 'maintenance') state = 'maintenance';
    else if (s.current?.status === 'checked_in') state = 'occupied';
    else if (s.current) state = 'arriving';
    else if (s.next?.check_in === t) state = 'arriving';
    return { id: r.id, number: r.number, type: r.type, state, current: s.current || null, next: s.next || null };
  });

  const attention = [
    ...noShows.map((b) => ({ kind: 'no_show', booking: b })),
    ...dueSoon.map((b) => ({ kind: 'payment_due', booking: b })),
  ];

  const occupied = roomBoard.filter((r) => r.state === 'occupied').length;
  const activeCount = active.length;
  const pct = activeCount ? Math.round((occupied / activeCount) * 100) : 0;
  const weekAgo = occupancyTrend[Math.max(0, occupancyTrend.length - 8)];

  res.json({
    today: t,
    totalRooms: rooms.length,
    activeRooms: activeCount,
    occupied,
    occupancyPct: pct,
    occupancyDelta: pct - weekAgo.pct,
    occupancyTrend,
    roomBoard,
    arrivals,
    departures,
    upcoming,
    attention,
    revenueByMonth,
    monthRevenue: thisMonth.revenue,
    monthRevenueDelta: lastMonth?.revenue ? Math.round(((thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100) : null,
    monthBookings: thisMonth.bookings,
    unpaidCount: Number(unpaid.n),
    unpaidAmount: Number(unpaid.amount),
  });
});

module.exports = router;
