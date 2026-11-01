import { html, mount, $, $$ } from '../lib/html.js';
import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { avatar, statusPill, emptyState, debounce, guard, toast } from '../lib/ui.js';
import { money, fmtDate, nights, plural, cap } from '../lib/format.js';
import { bookingDrawer, bookingForm } from '../lib/drawers.js';

export const meta = { title: 'Bookings' };

const TABS = [
  ['all', 'All', () => true],
  ['reserved', 'Upcoming', (b) => b.status === 'reserved'],
  ['checked_in', 'In house', (b) => b.status === 'checked_in'],
  ['checked_out', 'Completed', (b) => b.status === 'checked_out'],
  ['cancelled', 'Cancelled', (b) => b.status === 'cancelled'],
];
const PAGE = 25;

export async function render(el) {
  const all = await api('/bookings');
  const state = { tab: 'all', q: '', shown: PAGE };

  const visible = () => {
    const q = state.q.trim().toLowerCase();
    const pred = TABS.find((t) => t[0] === state.tab)[2];
    const rows = all.filter((b) => pred(b) && (!q || `${b.guest_name} ${b.guest_email} ${b.room_number} ${b.id}`.toLowerCase().includes(q)));
    // Upcoming reads best soonest-first, everything else newest-first.
    // "All" leads with what needs action today: in house, then upcoming, then history.
    const asc = (a, b) => a.check_in.localeCompare(b.check_in);
    if (state.tab === 'reserved') return rows.sort(asc);
    if (state.tab !== 'all') return rows.sort((a, b) => asc(b, a));
    const rank = (b) => (b.status === 'checked_in' ? 0 : b.status === 'reserved' ? 1 : 2);
    return rows.sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? asc(a, b) : asc(b, a)));
  };

  const rowHtml = (b) => html`
    <tr data-id="${b.id}" tabindex="0">
      <td><div class="cell-person">${avatar(b.guest_name)}<div style="min-width:0"><b>${b.guest_name}</b><span>${b.guest_email}</span></div></div></td>
      <td class="hide-m"><b style="font-weight:600">${b.room_number}</b> <span class="muted">${cap(b.room_type)}</span></td>
      <td><div class="stay">${fmtDate(b.check_in)} → ${fmtDate(b.check_out)}<small>${plural(nights(b.check_in, b.check_out), 'night')}</small></div></td>
      <td class="num hide-m" style="font-weight:600">${money(b.total_amount)}</td>
      <td>${statusPill(b.status)}</td>
      <td class="hide-m"><span class="pill plain ${b.paid ? 'green' : b.status === 'cancelled' ? '' : 'brass'}">${b.status === 'cancelled' ? '—' : b.paid ? 'Paid' : 'Unpaid'}</span></td>
      <td class="right hide-m">${quick(b)}</td>
    </tr>`;
  const quick = (b) => b.status === 'reserved' ? html`<button class="btn sm" data-q="checked_in" data-id="${b.id}">Check in</button>`
    : b.status === 'checked_in' ? html`<button class="btn sm" data-q="checked_out" data-id="${b.id}">Check out</button>` : '';

  mount(el, html`
    <div class="page">
      <header class="page-head">
        <div><div class="eyebrow">Reservations</div><h1>Bookings</h1><p>Every reservation, check-in and check-out in one place.</p></div>
        <div class="page-actions"><button class="btn primary" id="newBk">${icon.plus} New booking</button></div>
      </header>
      <div class="toolbar">
        <div class="seg" id="tabs">${TABS.map(([k, name, p]) => html`<button data-tab="${k}" class="${k === 'all' ? 'on' : ''}">${name}<span class="n">${all.filter(p).length}</span></button>`)}</div>
        <div class="input-icon grow" style="margin-left:auto">${icon.search}<input id="q" placeholder="Search guest, email or room" aria-label="Search bookings"></div>
      </div>
      <div class="card table-card"><div class="table-scroll" id="tbl"></div></div>
    </div>`);

  const draw = () => {
    const rows = visible();
    mount($('#tbl', el), rows.length ? html`
      <table><thead><tr><th>Guest</th><th class="hide-m">Room</th><th>Stay</th><th class="hide-m">Total</th><th>Status</th><th class="hide-m">Payment</th><th class="hide-m"></th></tr></thead>
        <tbody>${rows.slice(0, state.shown).map(rowHtml)}</tbody></table>
      ${rows.length > state.shown ? html`<div class="more"><button class="btn" id="more">Show ${Math.min(PAGE, rows.length - state.shown)} more <span class="muted">· ${rows.length - state.shown} remaining</span></button></div>` : ''}`
      : emptyState('bookings', 'No bookings found', state.q ? 'Try a different search.' : 'New reservations will appear here.'));
    $('#more', el)?.addEventListener('click', () => { state.shown += PAGE; draw(); });
  };

  const reload = async () => { all.splice(0, all.length, ...(await api('/bookings'))); draw(); $$('#tabs [data-tab]', el).forEach((b) => ($('.n', b).textContent = all.filter(TABS.find((t) => t[0] === b.dataset.tab)[2]).length)); };

  $('#tbl', el).addEventListener('click', guard(async (e) => {
    const q = e.target.closest('[data-q]');
    if (q) {
      e.stopPropagation();
      const b = all.find((x) => x.id == q.dataset.id);
      await api(`/bookings/${b.id}/status`, { method: 'PATCH', body: { status: q.dataset.q } });
      toast(q.dataset.q === 'checked_in' ? `${b.guest_name} checked in` : `${b.guest_name} checked out`);
      return reload();
    }
    const tr = e.target.closest('tr[data-id]');
    if (tr) bookingDrawer(all.find((x) => x.id == tr.dataset.id), reload);
  }));
  $('#tbl', el).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('tr[data-id]')) bookingDrawer(all.find((x) => x.id == e.target.dataset.id), reload);
  });
  $$('#tabs [data-tab]', el).forEach((b) => (b.onclick = () => {
    state.tab = b.dataset.tab; state.shown = PAGE;
    $$('#tabs [data-tab]', el).forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  $('#q', el).oninput = debounce((e) => { state.q = e.target.value; state.shown = PAGE; draw(); }, 150);
  $('#newBk', el).onclick = () => bookingForm({}, reload);
  draw();
}
