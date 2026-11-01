import { html, mount, $, $$ } from '../lib/html.js';
import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { emptyState, guard, toast, confirmDialog } from '../lib/ui.js';
import { money, fmtDate, cap, plural } from '../lib/format.js';
import { roomForm } from '../lib/drawers.js';

export const meta = { title: 'Rooms' };

export async function render(el) {
  const rooms = await api('/rooms');
  let filter = 'all';
  const types = ['all', 'single', 'double', 'suite'];

  const stateLine = (r) => {
    if (r.status === 'maintenance') return html`<b>Under maintenance</b> · not bookable`;
    if (r.current?.status === 'checked_in') return html`<b>${r.current.guest_name}</b> in house until ${fmtDate(r.current.check_out)}`;
    if (r.current) return html`<b>${r.current.guest_name}</b> arriving ${fmtDate(r.current.check_in)}`;
    if (r.next) return html`Free now · next guest <b>${fmtDate(r.next.check_in)}</b>`;
    return html`<b>Available</b> · nothing booked ahead`;
  };
  const tone = (r) => r.status === 'maintenance' ? 'maintenance' : r.current?.status === 'checked_in' ? 'checked_in' : r.current ? 'reserved' : 'active';
  const tag = (r) => r.status === 'maintenance' ? 'Maintenance' : r.current?.status === 'checked_in' ? 'Occupied' : r.current ? 'Arriving' : 'Available';

  mount(el, html`
    <div class="page">
      <header class="page-head">
        <div><div class="eyebrow">Inventory</div><h1>Rooms</h1><p>${plural(rooms.length, 'room')} · ${rooms.filter((r) => r.status === 'active').length} bookable.</p></div>
        <div class="page-actions"><button class="btn primary" id="add">${icon.plus} Add room</button></div>
      </header>
      <div class="toolbar"><div class="seg" id="types">${types.map((t) => html`<button data-t="${t}" class="${t === 'all' ? 'on' : ''}">${cap(t)}</button>`)}</div></div>
      <div class="rooms stagger" id="grid"></div>
    </div>`);

  const draw = () => {
    const list = rooms.filter((r) => filter === 'all' || r.type === filter);
    mount($('#grid', el), list.length ? html`${list.map((r) => html`
      <article class="card room ${r.type}">
        <div class="room-art">
          <div class="row"><span class="type">${r.type}</span><span class="pill ${{ checked_in: 'green', reserved: 'blue', maintenance: 'brass', active: '' }[tone(r)]}">${tag(r)}</span></div>
          <div class="no">${r.number}</div><span class="bed">${icon.bed}</span>
        </div>
        <div class="room-body">
          <div class="room-price"><b>${money(r.price_per_night)}</b><span>/ night</span><span class="cap">${icon.users} ${r.capacity}</span></div>
          <div class="chips">${(r.amenities || '').split(',').map((a) => a.trim()).filter(Boolean).map((a) => html`<span class="tag">${a}</span>`)}</div>
          <div class="room-state">${stateLine(r)}</div>
        </div>
        <div class="room-foot"><button class="btn sm" data-edit="${r.id}">${icon.edit} Edit</button><button class="btn sm danger" data-del="${r.id}" aria-label="Delete room ${r.number}">${icon.trash}</button></div>
      </article>`)}` : html`<div class="card" style="grid-column:1/-1">${emptyState('rooms', 'No rooms of this type')}</div>`);
    $$('[data-edit]', el).forEach((b) => (b.onclick = () => roomForm(rooms.find((r) => r.id == b.dataset.edit), reload)));
    $$('[data-del]', el).forEach((b) => (b.onclick = guard(async () => {
      const r = rooms.find((x) => x.id == b.dataset.del);
      if (!(await confirmDialog({ title: `Delete room ${r.number}?`, message: 'Rooms with booking history cannot be deleted — set them to maintenance instead.', confirmLabel: 'Delete', danger: true }))) return;
      await api(`/rooms/${r.id}`, { method: 'DELETE' });
      toast('Room deleted');
      reload();
    })));
  };
  const reload = guard(async () => { rooms.splice(0, rooms.length, ...(await api('/rooms'))); draw(); });
  $$('#types [data-t]', el).forEach((b) => (b.onclick = () => {
    filter = b.dataset.t;
    $$('#types [data-t]', el).forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  $('#add', el).onclick = () => roomForm(null, reload);
  draw();
}
