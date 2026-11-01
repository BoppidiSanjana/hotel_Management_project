import { html, raw, mount, esc } from './html.js';
import { tip } from './ui.js';
import { compact } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

/* Occupancy ring: one number, one arc */
export function ring(el, pct) {
  const r = 70, c = 2 * Math.PI * r;
  mount(el, html`
    <svg viewBox="0 0 168 168" role="img" aria-label="Occupancy ${pct} percent">
      <circle class="track" cx="84" cy="84" r="${r}" fill="none" stroke-width="12"/>
      <circle class="fill" cx="84" cy="84" r="${r}" fill="none" stroke-width="12"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - pct / 100)}"/>
    </svg>
    <div class="center"><b>${pct}%</b><span>Occupied</span></div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const f = el.querySelector('.fill');
    if (f) f.style.strokeDashoffset = f.dataset.target;
  }));
}

/* Area/line over time with crosshair + shared tooltip.
   points: [{ label, value, display }] */
export function areaChart(el, points, { height = 190, yMax = 100, yTicks = [0, 50, 100], unit = '%', title = 'Value' } = {}) {
  const W = 640, H = height, m = { l: 34, r: 14, t: 14, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const x = (i) => m.l + (iw * i) / (points.length - 1);
  const y = (v) => m.t + ih - (ih * v) / yMax;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${m.t + ih} L${x(0)},${m.t + ih} Z`;
  const last = points[points.length - 1];
  const ticksX = points.map((p, i) => ({ p, i })).filter(({ i }) => (i % 3 === 0 && i <= points.length - 3) || i === points.length - 1);

  mount(el, html`
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title} over time">
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--chart-line)" stop-opacity=".16"/><stop offset="1" stop-color="var(--chart-line)" stop-opacity="0"/>
      </linearGradient></defs>
      ${yTicks.map((t) => html`<line class="grid-line" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>
        <text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${t}${unit}</text>`)}
      ${ticksX.map(({ p, i }) => html`<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${p.label}</text>`)}
      <path d="${area}" fill="url(#ag)"/>
      <path d="${line}" fill="none" stroke="var(--chart-line)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line class="xhair" y1="${m.t}" y2="${m.t + ih}" stroke="var(--muted)" stroke-width="1" opacity="0"/>
      <circle class="dot" r="5" fill="var(--chart-line)" stroke="var(--surface)" stroke-width="2" opacity="0"/>
      <circle cx="${x(points.length - 1)}" cy="${y(last.value)}" r="5" fill="var(--chart-line)" stroke="var(--surface)" stroke-width="2" class="endcap"/>
      <rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}"/>
    </svg>`);

  const svg = el.querySelector('svg');
  const xhair = svg.querySelector('.xhair'), dot = svg.querySelector('.dot'), endcap = svg.querySelector('.endcap');
  const T = tip();
  const move = (e) => {
    const b = svg.getBoundingClientRect();
    const px = ((e.clientX - b.left) / b.width) * W;
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((px - m.l) / iw) * (points.length - 1))));
    const p = points[i];
    xhair.setAttribute('x1', x(i)); xhair.setAttribute('x2', x(i)); xhair.setAttribute('opacity', 0.5);
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.value)); dot.setAttribute('opacity', 1);
    endcap.setAttribute('opacity', i === points.length - 1 ? 1 : 0);
    T.show(b.left + (x(i) / W) * b.width, b.top + (y(p.value) / H) * b.height, p.full || p.label, p.display);
  };
  const leave = () => {
    xhair.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); endcap.setAttribute('opacity', 1); T.hide();
  };
  svg.querySelector('.hit').addEventListener('pointermove', move);
  svg.querySelector('.hit').addEventListener('pointerleave', leave);
}

/* Columns: thin, 4px rounded tops, square base, value label on the extreme */
export function columnChart(el, items, { height = 210, format = (v) => v, title = 'Value' } = {}) {
  const W = 640, H = height, m = { l: 44, r: 10, t: 22, b: 28 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = niceMax(Math.max(...items.map((d) => d.value)));
  const ticks = [0, max / 2, max];
  const slot = iw / items.length, bw = Math.min(26, slot * 0.5);
  const y = (v) => m.t + ih - (ih * v) / max;
  const peak = items.reduce((a, d, i) => (d.value > items[a].value ? i : a), 0);

  const bar = (d, i) => {
    const bx = m.l + slot * i + (slot - bw) / 2, by = y(d.value), h = m.t + ih - by, r = Math.min(4, h);
    const path = `M${bx},${m.t + ih} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + bw - r} Q${bx + bw},${by} ${bx + bw},${by + r} V${m.t + ih} Z`;
    return html`<path class="bar" d="${path}" fill="var(--chart-line)" opacity="${d.future ? 0.38 : 1}" data-i="${i}"/>
      <rect class="hit" x="${m.l + slot * i}" y="${m.t}" width="${slot}" height="${ih}" data-i="${i}" tabindex="0" role="img" aria-label="${d.label}: ${format(d.value)}"/>`;
  };

  mount(el, html`
    <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${title}">
      ${ticks.map((t) => html`<line class="grid-line" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>
        <text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${t === 0 ? '0' : '$' + compact(t)}</text>`)}
      ${items.map((d, i) => html`<text x="${m.l + slot * i + slot / 2}" y="${H - 8}" text-anchor="middle" ${raw(d.current ? 'style="fill:var(--ink);font-weight:600"' : '')}>${d.label}</text>`)}
      ${items.map(bar)}
      <text x="${m.l + slot * peak + slot / 2}" y="${y(items[peak].value) - 7}" text-anchor="middle" style="fill:var(--ink-2);font-weight:600">${'$' + compact(items[peak].value)}</text>
    </svg>`);

  const svg = el.querySelector('svg'), T = tip();
  const show = (e) => {
    const i = Number(e.target.dataset.i);
    const d = items[i], b = svg.getBoundingClientRect();
    svg.querySelectorAll('.bar').forEach((p) => (p.style.opacity = Number(p.dataset.i) === i ? 1 : 0.55 * (items[p.dataset.i].future ? 0.7 : 1)));
    const cx = b.left + ((m.l + slot * i + slot / 2) / W) * b.width;
    T.show(cx, b.top + (y(d.value) / H) * b.height, d.full || d.label, format(d.value) + (d.extra ? ` · ${d.extra}` : ''));
  };
  const hide = () => { svg.querySelectorAll('.bar').forEach((p) => (p.style.opacity = '')); T.hide(); };
  svg.querySelectorAll('.hit').forEach((h) => {
    h.addEventListener('pointermove', show); h.addEventListener('focus', show);
    h.addEventListener('pointerleave', hide); h.addEventListener('blur', hide);
  });
}
