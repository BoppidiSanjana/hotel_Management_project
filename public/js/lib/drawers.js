import { html, raw, mount, $, $$ } from './html.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { openDrawer, closeDrawer, confirmDialog, toast, guard, avatar, statusPill } from './ui.js';
import { money, fmtDate, fmtDateLong, fmtStamp, nights, addDays, todayLocal, cap, plural } from './format.js';

/* ---------- booking detail ---------- */
export function bookingDrawer(b, onChange) {
  const n = nights(b.check_in, b.check_out);
  const rate = Number(b.price_per_night);
  const step = (done, bad, title, sub) => html`<div class="tl ${done ? 'done' : ''} ${bad ? 'bad' : ''}"><i></i><div><b>${title}</b><span>${sub}</span></div></div>`;
  const cancelled = b.status === 'cancelled';
  const act = (st, text, cls = '') => html`<button type="button" class="btn ${cls}" data-status="${st}">${text}</button>`;
  const actions = b.status === 'reserved' ? [act('checked_in', 'Check in', 'primary'), act('cancelled', 'Cancel booking', 'danger')]
    : b.status === 'checked_in' ? [act('checked_out', 'Check out', 'primary')] : [];

  const panel = openDrawer({
    title: b.guest_name,
    subtitle: `Booking #${b.id}`,
    lead: avatar(b.guest_name, 'lg'),
    body: html`
      <div style="display:flex;gap:8px;margin-bottom:6px">${statusPill(b.status)}
        <button type="button" class="pill ${b.paid ? 'green' : 'brass'}" data-paid>${b.paid ? 'Paid' : 'Unpaid · mark paid'}</button></div>
      <div class="section-title">Stay</div>
      <div class="kv">
        <div><div class="k">Room</div><div class="v">${b.room_number} · ${cap(b.room_type)}</div></div>
        <div><div class="k">Length</div><div class="v">${plural(n, 'night')}</div></div>
        <div><div class="k">Check-in</div><div class="v">${fmtDateLong(b.check_in)}</div></div>
        <div><div class="k">Check-out</div><div class="v">${fmtDateLong(b.check_out)}</div></div>
      </div>
      <div class="section-title">Charges</div>
      <div class="receipt">
        <div class="r"><span>${money(rate)} × ${plural(n, 'night')}</span><span>${money(rate * n, 2)}</span></div>
        <div class="r total"><span>Total</span><span>${money(b.total_amount, 2)}</span></div>
      </div>
      <div class="section-title">Guest</div>
      <div class="list">
        <div class="list-row"><span class="muted">${icon.mail}</span><div class="grow"><b>${b.guest_email}</b></div></div>
        ${b.guest_phone ? html`<div class="list-row"><span class="muted">${icon.phone}</span><div class="grow"><b>${b.guest_phone}</b></div></div>` : ''}
      </div>
      <div class="section-title">Timeline</div>
      <div class="timeline">
        ${step(true, false, 'Booked', fmtStamp(b.created_at))}
        ${cancelled ? step(true, true, 'Cancelled', 'Booking was cancelled') : ''}
        ${!cancelled ? step(['checked_in', 'checked_out'].includes(b.status), false, 'Check-in', fmtDate(b.check_in)) : ''}
        ${!cancelled ? step(b.status === 'checked_out', false, 'Check-out', fmtDate(b.check_out)) : ''}
      </div>`,
    footer: actions.length ? html`${actions}` : '',
  });

  const changed = () => { closeDrawer(); onChange?.(); };
  $$('[data-status]', panel).forEach((btn) => (btn.onclick = guard(async () => {
    const st = btn.dataset.status;
    if (st === 'cancelled' && !(await confirmDialog({ title: 'Cancel this booking?', message: `${b.guest_name}'s reservation for room ${b.room_number} will be cancelled and the dates freed.`, confirmLabel: 'Cancel booking', danger: true }))) return;
    await api(`/bookings/${b.id}/status`, { method: 'PATCH', body: { status: st } });
    toast(st === 'checked_in' ? `${b.guest_name} checked in` : st === 'checked_out' ? `${b.guest_name} checked out` : 'Booking cancelled');
    changed();
  })));
  $('[data-paid]', panel).onclick = guard(async () => {
    await api(`/bookings/${b.id}/paid`, { method: 'PATCH', body: { paid: !b.paid } });
    toast(b.paid ? 'Marked as unpaid' : 'Payment recorded');
    changed();
  });
}

/* ---------- new booking ---------- */
export async function bookingForm({ guestId = '', roomId = '', checkIn = '' } = {}, onDone) {
  const guests = await api('/guests');
  const t = todayLocal();
  const start = checkIn || t;
  const panel = openDrawer({
    title: 'New booking',
    subtitle: 'Pick dates and the system finds free rooms.',
    onSubmit: async (fd) => {
      if (!fd.get('room_id')) throw new Error('Choose an available room');
      const r = await api('/bookings', { method: 'POST', body: {
        guest_id: fd.get('guest_id'), room_id: fd.get('room_id'),
        check_in: fd.get('check_in'), check_out: fd.get('check_out'), paid: fd.get('paid') === '1' } });
      toast(`Booked · ${money(r.total_amount)} for ${plural(r.nights, 'night')}`);
      onDone?.();
    },
    body: html`
      <div class="field"><label class="lbl" for="bf-guest">Guest</label>
        <select id="bf-guest" name="guest_id" required>
          <option value="">${guests.length ? 'Select a guest…' : 'No guests yet'}</option>
          ${guests.map((g) => html`<option value="${g.id}" ${raw(String(g.id) === String(guestId) ? 'selected' : '')}>${g.name} — ${g.email}</option>`)}
        </select>
        <button type="button" class="btn sm quiet" id="bf-newguest" style="margin-top:6px;padding-left:0">${icon.plus} New guest</button></div>
      <div class="field-row">
        <div class="field"><label class="lbl" for="bf-in">Check-in</label><input id="bf-in" name="check_in" type="date" min="${t}" value="${start}" required></div>
        <div class="field"><label class="lbl" for="bf-out">Check-out</label><input id="bf-out" name="check_out" type="date" min="${addDays(start, 1)}" value="${addDays(start, 1)}" required></div>
      </div>
      <label class="lbl">Available rooms</label>
      <div class="room-choices" id="bf-rooms" aria-live="polite"></div>
      <div class="total-bar hidden" id="bf-total"><div><small id="bf-calc"></small>Total</div><b id="bf-amt"></b></div>
      <label class="check" style="margin-top:14px"><input type="checkbox" name="paid" value="1"> Mark as paid</label>`,
    footer: html`<button class="btn primary" type="submit">Confirm booking</button><button class="btn" type="button" data-close>Cancel</button>`,
  });

  const inD = panel.check_in, outD = panel.check_out, list = $('#bf-rooms', panel);
  let avail = [];
  const sum = () => {
    const chosen = $('input[name=room_id]:checked', panel);
    const box = $('#bf-total', panel);
    const r = chosen && avail.find((x) => String(x.id) === chosen.value);
    box.classList.toggle('hidden', !r);
    if (!r) return;
    const n = nights(inD.value, outD.value);
    $('#bf-calc', panel).textContent = `${plural(n, 'night')} × ${money(r.price_per_night)}`;
    $('#bf-amt', panel).textContent = money(n * r.price_per_night);
  };
  const refresh = guard(async () => {
    if (!inD.value || !outD.value || inD.value >= outD.value) {
      mount(list, html`<div class="muted" style="padding:10px 2px">Choose a valid date range.</div>`);
      return sum();
    }
    mount(list, html`<div class="skel" style="height:56px"></div>`);
    avail = await api(`/rooms/available?from=${inD.value}&to=${outD.value}`);
    mount(list, avail.length ? html`${avail.map((r) => html`
      <label class="room-choice"><input type="radio" name="room_id" value="${r.id}" ${raw(String(r.id) === String(roomId) ? 'checked' : '')}>
        <div><b class="n">${r.number}</b><div class="d">${cap(r.type)}<span>Sleeps ${r.capacity} · ${r.amenities || 'No amenities listed'}</span></div><span class="p">${money(r.price_per_night)}</span></div></label>`)}`
      : html`<div class="muted" style="padding:10px 2px">No rooms are free for these dates.</div>`);
    $$('input[name=room_id]', list).forEach((i) => i.addEventListener('change', sum));
    sum();
  });
  inD.addEventListener('change', () => {
    if (outD.value <= inD.value) outD.value = addDays(inD.value, 1);
    outD.min = addDays(inD.value, 1);
    refresh();
  });
  outD.addEventListener('change', refresh);
  $('#bf-newguest', panel).onclick = () => guestForm(null, (id) => bookingForm({ guestId: id, roomId, checkIn: inD.value }, onDone));
  refresh();
}

/* ---------- guest ---------- */
export function guestForm(guest, onDone) {
  const g = guest || { name: '', email: '', phone: '', id_proof: '' };
  openDrawer({
    title: guest ? 'Edit guest' : 'New guest',
    onSubmit: async (fd) => {
      const body = Object.fromEntries(fd);
      const res = await api(guest ? `/guests/${guest.id}` : '/guests', { method: guest ? 'PUT' : 'POST', body });
      toast(guest ? 'Guest updated' : 'Guest added');
      onDone?.(res.id || guest.id);
    },
    body: html`
      <div class="field"><label class="lbl">Full name</label><input name="name" value="${g.name}" required autocomplete="off"></div>
      <div class="field"><label class="lbl">Email</label><input name="email" type="email" value="${g.email}" required></div>
      <div class="field-row">
        <div class="field"><label class="lbl">Phone</label><input name="phone" value="${g.phone}"></div>
        <div class="field"><label class="lbl">ID proof</label><input name="id_proof" value="${g.id_proof}"></div></div>`,
    footer: html`<button class="btn primary" type="submit">${guest ? 'Save changes' : 'Add guest'}</button><button class="btn" type="button" data-close>Cancel</button>`,
  });
}

export async function guestDrawer(g, onChange) {
  const bookings = await api(`/bookings?guest_id=${g.id}`);
  const panel = openDrawer({
    title: g.name,
    subtitle: `Guest since ${fmtDate(g.created_at)}`,
    lead: avatar(g.name, 'lg'),
    body: html`
      <div class="kv">
        <div><div class="k">Bookings</div><div class="v">${bookings.filter((b) => b.status !== 'cancelled').length}</div></div>
        <div><div class="k">Total booked</div><div class="v">${money(g.spent)}</div></div></div>
      <div class="section-title">Contact</div>
      <div class="list">
        <div class="list-row"><span class="muted">${icon.mail}</span><div class="grow"><b>${g.email}</b></div></div>
        <div class="list-row"><span class="muted">${icon.phone}</span><div class="grow"><b>${g.phone || '—'}</b></div></div>
        <div class="list-row"><span class="muted">${icon.users}</span><div class="grow"><b>${g.id_proof || '—'}</b></div></div></div>
      <div class="section-title">Stay history</div>
      ${bookings.length ? html`<div class="list">${bookings.map((b) => html`
        <div class="list-row click" data-bk="${b.id}"><div class="grow"><b>Room ${b.room_number} · ${fmtDate(b.check_in)} → ${fmtDate(b.check_out)}</b>
          <span>${plural(nights(b.check_in, b.check_out), 'night')} · ${money(b.total_amount)}</span></div>${statusPill(b.status)}</div>`)}</div>`
        : html`<div class="muted">No bookings yet.</div>`}`,
    footer: html`<button class="btn primary" type="button" data-book>${icon.plus} New booking</button>
      <button class="btn" type="button" data-edit>${icon.edit} Edit</button>
      <button class="btn danger" type="button" data-del aria-label="Delete guest">${icon.trash}</button>`,
  });
  $$('[data-bk]', panel).forEach((r) => (r.onclick = () => bookingDrawer(bookings.find((b) => b.id == r.dataset.bk), onChange)));
  $('[data-book]', panel).onclick = () => bookingForm({ guestId: g.id }, onChange);
  $('[data-edit]', panel).onclick = () => guestForm(g, onChange);
  $('[data-del]', panel).onclick = guard(async () => {
    if (!(await confirmDialog({ title: `Delete ${g.name}?`, message: 'Guests with bookings cannot be deleted.', confirmLabel: 'Delete', danger: true }))) return;
    await api(`/guests/${g.id}`, { method: 'DELETE' });
    toast('Guest deleted');
    closeDrawer();
    onChange?.();
  });
}

/* ---------- room ---------- */
export function roomForm(room, onDone) {
  const r = room || { number: '', type: 'double', price_per_night: '', capacity: 2, amenities: '', status: 'active' };
  const opts = (list, cur) => list.map((v) => html`<option value="${v}" ${raw(v === cur ? 'selected' : '')}>${cap(v)}</option>`);
  openDrawer({
    title: room ? `Room ${room.number}` : 'Add room',
    subtitle: room ? 'Edit details and availability' : 'Add a room to your inventory',
    onSubmit: async (fd) => {
      await api(room ? `/rooms/${room.id}` : '/rooms', { method: room ? 'PUT' : 'POST', body: Object.fromEntries(fd) });
      toast(room ? 'Room updated' : 'Room added');
      onDone?.();
    },
    body: html`
      <div class="field-row">
        <div class="field"><label class="lbl">Room number</label><input name="number" value="${r.number}" required></div>
        <div class="field"><label class="lbl">Type</label><select name="type">${opts(['single', 'double', 'suite'], r.type)}</select></div></div>
      <div class="field-row">
        <div class="field"><label class="lbl">Price per night ($)</label><input name="price_per_night" type="number" min="1" step="0.01" value="${r.price_per_night}" required></div>
        <div class="field"><label class="lbl">Capacity</label><input name="capacity" type="number" min="1" max="10" value="${r.capacity}" required></div></div>
      <div class="field"><label class="lbl">Amenities</label><input name="amenities" value="${r.amenities}" placeholder="WiFi, Balcony, Mini bar"></div>
      <div class="field"><label class="lbl">Status</label><select name="status">${opts(['active', 'maintenance'], r.status)}</select></div>`,
    footer: html`<button class="btn primary" type="submit">${room ? 'Save changes' : 'Add room'}</button><button class="btn" type="button" data-close>Cancel</button>`,
  });
}
