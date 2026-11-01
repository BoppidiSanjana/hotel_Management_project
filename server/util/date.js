const tz = process.env.HOTEL_TZ || 'UTC';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });

// Current calendar date (YYYY-MM-DD) in the hotel's timezone
const today = () => fmt.format(new Date());
const addDays = (s, n) => new Date(Date.parse(s) + n * 86400000).toISOString().slice(0, 10);
const nightsBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const monthStart = (s, offset = 0) => {
  const d = new Date(Date.parse(s.slice(0, 8) + '01'));
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 10);
};

module.exports = { today, addDays, nightsBetween, monthStart };
