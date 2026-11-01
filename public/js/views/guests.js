import { html, mount, $ } from '../lib/html.js';
import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { avatar, emptyState, debounce, guard } from '../lib/ui.js';
import { money, fmtDate, plural } from '../lib/format.js';
import { guestDrawer, guestForm } from '../lib/drawers.js';

export const meta = { title: 'Guests' };

export async function render(el) {
  let guests = await api('/guests');
  mount(el, html`
    <div class="page">
      <header class="page-head">
        <div><div class="eyebrow">Directory</div><h1>Guests</h1><p>${plural(guests.length, 'guest')} on record, with their booking history.</p></div>
        <div class="page-actions"><button class="btn primary" id="add">${icon.plus} New guest</button></div>
      </header>
      <div class="toolbar"><div class="input-icon grow">${icon.search}<input id="q" placeholder="Search name, email or phone" aria-label="Search guests"></div></div>
      <div class="card table-card"><div class="table-scroll" id="tbl"></div></div>
    </div>`);

  const draw = () => mount($('#tbl', el), guests.length ? html`
    <table><thead><tr><th>Guest</th><th class="hide-m">Phone</th><th class="right">Bookings</th><th class="right hide-m">Total booked</th><th class="hide-m">Latest stay</th></tr></thead>
      <tbody>${guests.map((g) => html`<tr data-id="${g.id}" tabindex="0">
        <td><div class="cell-person">${avatar(g.name)}<div style="min-width:0"><b>${g.name}</b><span>${g.email}</span></div></div></td>
        <td class="hide-m muted">${g.phone || '—'}</td>
        <td class="right num" style="font-weight:600">${g.stays}</td>
        <td class="right num hide-m" style="font-weight:600">${money(g.spent)}</td>
        <td class="hide-m muted">${g.last_stay ? fmtDate(g.last_stay) : '—'}</td></tr>`)}</tbody></table>`
    : emptyState('guests', 'No guests found', 'Try a different search or add a new guest.'));

  const load = guard(async () => { guests = await api('/guests?q=' + encodeURIComponent($('#q', el).value)); draw(); });
  const open = (id) => guestDrawer(guests.find((g) => g.id == id), load);
  $('#tbl', el).addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr.dataset.id); });
  $('#tbl', el).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) open(e.target.dataset.id); });
  $('#q', el).oninput = debounce(load, 250);
  $('#add', el).onclick = () => guestForm(null, load);
  draw();
}
