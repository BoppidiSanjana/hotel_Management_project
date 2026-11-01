import { html, raw, mount, $, $$ } from '../lib/html.js';
import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { guard } from '../lib/ui.js';
import { addDays, todayLocal, fmtDate, nights, plural, cap } from '../lib/format.js';
import { bookingDrawer, bookingForm } from '../lib/drawers.js';

export const meta = { title: 'Calendar' };

const SPANS = [14, 21, 30];

export async function render(el) {
  const state = { span: 21, start: addDays(todayLocal(), -3) };
  const today = todayLocal();

  mount(el, html`
    <div class="page">
      <header class="page-head">
        <div><div class="eyebrow">Availability</div><h1>Calendar</h1><p id="range"></p></div>
        <div class="page-actions">
          <div class="seg" id="span">${SPANS.map((n) => html`<button data-n="${n}" class="${n === state.span ? 'on' : ''}">${n} days</button>`)}</div>
          <div class="seg"><button id="prev" aria-label="Earlier">${icon.left}</button><button id="today">Today</button><button id="next" aria-label="Later">${icon.right}</button></div>
        </div>
      </header>
      <div class="toolbar"><div class="legend cal-legend">
        <span><i style="background:var(--blue)"></i>Reserved</span><span><i style="background:var(--accent)"></i>In house</span><span><i style="background:var(--stone)"></i>Checked out</span>
        <span class="muted">Click a free night to book it</span></div></div>
      <div class="card cal-card"><div class="cal-scroll" id="cal"></div></div>
    </div>`);

  const draw = guard(async () => {
    const end = addDays(state.start, state.span);
    const [rooms, bookings] = await Promise.all([api('/rooms'), api(`/bookings?from=${state.start}&to=${end}`)]);
    const live = bookings.filter((b) => b.status !== 'cancelled');
    const days = Array.from({ length: state.span }, (_, i) => addDays(state.start, i));
    const col = (d) => days.indexOf(d) + 2;
    const isWknd = (d) => [0, 6].includes(new Date(d + 'T00:00:00').getDay());
    const active = rooms.filter((r) => r.status === 'active').length;
    const lastRow = rooms.length + 2;

    const head = days.map((d, i) => {
      const dt = new Date(d + 'T00:00:00');
      const showMonth = i === 0 || dt.getDate() === 1;
      return html`<div class="cal-head ${d === today ? 'today' : ''} ${isWknd(d) ? 'wknd' : ''}" style="grid-column:${i + 2};grid-row:1">
        <span class="m">${showMonth ? dt.toLocaleDateString('en-US', { month: 'short' }) : ''}</span>${dt.toLocaleDateString('en-US', { weekday: 'short' })}<br><span class="d">${dt.getDate()}</span></div>`;
    });
    const rows = rooms.map((r, ri) => html`
      <div class="cal-room" style="grid-row:${ri + 2};grid-column:1"><b>${r.number}</b><span>${r.type}</span></div>
      ${days.map((d, di) => html`<div class="cal-cell ${isWknd(d) ? 'wknd' : ''} ${d === today ? 'today' : ''}" style="grid-row:${ri + 2};grid-column:${di + 2}" data-room="${r.id}" data-day="${d}" role="button" tabindex="-1" aria-label="Book room ${r.number} on ${fmtDate(d)}"></div>`)}
      ${live.filter((b) => b.room_id === r.id).map((b) => {
        const s = Math.max(0, nights(state.start, b.check_in)), e = Math.min(state.span, nights(state.start, b.check_out));
        if (e <= 0 || s >= state.span) return '';
        return html`<button class="cal-bar ${b.status}" style="grid-row:${ri + 2};grid-column:${s + 2} / ${e + 2}" data-bk="${b.id}" title="${b.guest_name} · ${fmtDate(b.check_in)} → ${fmtDate(b.check_out)} · ${plural(nights(b.check_in, b.check_out), 'night')}">
          <span>${b.guest_name}</span><small>${plural(nights(b.check_in, b.check_out), 'night')}</small></button>`;
      })}`);
    const occ = days.map((d, i) => {
      const n = new Set(live.filter((b) => b.check_in <= d && b.check_out > d).map((b) => b.room_id)).size;
      return html`<div class="cal-occ" style="grid-row:${lastRow};grid-column:${i + 2}">${active ? Math.round((n / active) * 100) : 0}%</div>`;
    });
    const ti = days.indexOf(today);

    const colMin = state.span > 21 ? 40 : state.span > 14 ? 48 : 64;
    mount($('#cal', el), html`<div class="cal-grid" style="min-width:${132 + state.span * colMin}px;grid-template-columns:132px repeat(${state.span},minmax(${colMin}px,1fr))">
      <div class="cal-corner" style="grid-row:1;grid-column:1">Room</div>${head}${rows}
      <div class="cal-occ lbl" style="grid-row:${lastRow};grid-column:1">Occupancy</div>${occ}</div>`);
    $('#range', el).textContent = `${fmtDate(state.start)} – ${fmtDate(addDays(end, -1))} · ${plural(live.length, 'booking')} in view`;
    el._bookings = bookings;
    if (ti >= 0) {
      const grid = $('.cal-grid', el);
      // position the today marker as a percentage of the day columns
      const line = document.createElement('div');
      line.className = 'today-line';
      grid.appendChild(line);
      const place = () => {
        const cell = $('.cal-head.today', grid);
        if (cell) line.style.left = cell.offsetLeft + cell.offsetWidth / 2 - 1 + 'px';
      };
      place();
    }
  });

  const shift = (n) => () => { state.start = addDays(state.start, n); draw(); };
  $('#prev', el).onclick = shift(-7);
  $('#next', el).onclick = shift(7);
  $('#today', el).onclick = () => { state.start = addDays(today, -3); draw(); };
  $$('#span [data-n]', el).forEach((b) => (b.onclick = () => {
    state.span = Number(b.dataset.n);
    $$('#span [data-n]', el).forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  $('#cal', el).addEventListener('click', (e) => {
    const bar = e.target.closest('[data-bk]');
    if (bar) return bookingDrawer(el._bookings.find((b) => b.id == bar.dataset.bk), draw);
    const cell = e.target.closest('.cal-cell');
    if (cell) {
      if (cell.dataset.day < today) return;
      bookingForm({ roomId: cell.dataset.room, checkIn: cell.dataset.day }, draw);
    }
  });
  await draw();
}
