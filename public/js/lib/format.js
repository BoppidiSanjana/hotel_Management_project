export const money = (n, d = 0) =>
  '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const compact = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'K' : String(Math.round(n)));

export const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => iso(new Date(Date.parse(s) + n * 86400000));
export const nights = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const todayLocal = () => {
  const d = new Date();
  return iso(new Date(d.getTime() - d.getTimezoneOffset() * 60000));
};
const dt = (s) => new Date(s.slice(0, 10) + 'T00:00:00');
export const fmtDate = (s) => dt(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const fmtDateLong = (s) => dt(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const fmtMonth = (ym) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' });
export const fmtStamp = (s) => new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const label = (s) => ({ checked_in: 'In house', checked_out: 'Checked out', reserved: 'Reserved', cancelled: 'Cancelled', maintenance: 'Maintenance', active: 'Active' }[s] || s.replace(/^./, (c) => c.toUpperCase()));
export const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());
export const initials = (n) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const hue = (n) => [...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
