import { html, mount, $, $$ } from '../lib/html.js';
import { api } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { avatar, statusPill, emptyState, countUp } from '../lib/ui.js';
import { ring, areaChart, columnChart } from '../lib/charts.js';
import { money, fmtDate, fmtMonth, cap, nights, plural } from '../lib/format.js';
import { bookingDrawer, bookingForm } from '../lib/drawers.js';

const STATE_LABEL = { occupied: 'Occupied', arriving: 'Arriving', available: 'Available', maintenance: 'Maintenance' };

export const meta = { title: 'Dashboard' };

export async function render(el) {
  const s = await api('/dashboard/stats');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const counts = Object.fromEntries(['occupied', 'arriving', 'available', 'maintenance'].map((k) => [k, s.roomBoard.filter((r) => r.state === k).length]));
  const delta = (v, suffix = '') => v == null ? '' : html`<span class="delta ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? icon.arrowUp : icon.arrowDown}${Math.abs(v)}${suffix}</span>`;
  const row = (b, kind) => html`
    <div class="list-row click" data-bk="${b.id}" tabindex="0">${avatar(b.guest_name)}
      <div class="grow"><b>${b.guest_name}</b><span>Room ${b.room_number} · ${cap(b.room_type)} · ${plural(nights(b.check_in, b.check_out), 'night')}</span></div>
      ${kind === 'in' ? (b.status === 'checked_in' ? statusPill('checked_in') : html`<span class="pill blue">Expected</span>`)
        : (b.status === 'checked_out' ? statusPill('checked_out') : html`<span class="pill brass">Due out</span>`)}</div>`;

  const all = [...s.arrivals, ...s.departures, ...s.upcoming, ...s.attention.map((a) => a.booking)];
  mount(el, html`
    <div class="page">
      <header class="page-head">
        <div><div class="eyebrow">Overview</div><h1>Good ${greet}, <em>admin</em></h1>
          <p>${new Date(s.today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${s.occupied} of ${s.activeRooms} rooms occupied right now.</p></div>
        <div class="page-actions"><button class="btn primary" id="newBk">${icon.plus} New booking</button></div>
      </header>

      <div class="grid stagger">
        <section class="card pad span-5">
          <div class="card-head"><div><h3>Occupancy today</h3><p>Rooms with a guest in house</p></div>
            ${s.occupancyDelta ? html`<div title="vs. 7 days ago">${delta(s.occupancyDelta, ' pts')}</div>` : ''}</div>
          <div class="occ-split">
            <div class="ring" id="ring"></div>
            <div class="legend-list">
              <div><span class="sw" style="background:var(--accent)"></span>Occupied<b>${counts.occupied}</b></div>
              <div><span class="sw" style="background:var(--blue)"></span>Arriving<b>${counts.arriving}</b></div>
              <div><span class="sw" style="background:var(--surface-2);box-shadow:inset 0 0 0 1.5px var(--muted)"></span>Available<b>${counts.available}</b></div>
              <div><span class="sw" style="background:var(--brass)"></span>Maintenance<b>${counts.maintenance}</b></div>
            </div>
          </div>
        </section>

        <section class="card pad span-7">
          <div class="card-head"><div><h3>Occupancy, last 14 days</h3><p>Share of active rooms occupied each night</p></div>
            <button class="link-btn" data-table="occ">View as table</button></div>
          <div class="chart" id="occChart"></div><div class="hidden" id="occTable"></div>
        </section>

        <div class="card kpi span-3"><div class="label">${icon.wallet} Revenue this month</div>
          <div class="value" data-count="${s.monthRevenue}" data-money>$0</div>
          <div class="foot">${delta(s.monthRevenueDelta, '%')} ${s.monthRevenueDelta == null ? '' : 'vs. last month'}</div></div>
        <div class="card kpi span-3"><div class="label">${icon.login} Arrivals today</div>
          <div class="value" data-count="${s.arrivals.length}">0</div>
          <div class="foot">${s.arrivals.filter((a) => a.status === 'checked_in').length} checked in so far</div></div>
        <div class="card kpi span-3"><div class="label">${icon.logout} Departures today</div>
          <div class="value" data-count="${s.departures.length}">0</div>
          <div class="foot">${s.departures.filter((a) => a.status === 'checked_out').length} checked out so far</div></div>
        <div class="card kpi span-3"><div class="label">${icon.alert} Outstanding balance</div>
          <div class="value" data-count="${s.unpaidAmount}" data-money>$0</div>
          <div class="foot">${plural(s.unpaidCount, 'unpaid stay')}</div></div>

        <section class="card pad span-7">
          <div class="card-head"><div><h3>Rooms right now</h3><p>Live status of every room</p></div>
            <a class="link-btn" href="#/rooms">Manage rooms</a></div>
          <div class="board">${s.roomBoard.map((r) => html`
            <div class="tile ${r.state}" title="${STATE_LABEL[r.state]}">
              <div class="top"><span class="n">${r.number}</span><span class="type">${r.type}</span></div>
              <div class="s">${r.state === 'occupied' ? html`<b>${r.current.guest_name}</b>Until ${fmtDate(r.current.check_out)}`
                : r.state === 'arriving' ? html`<b>${(r.current || r.next).guest_name}</b>Arriving today`
                : r.state === 'maintenance' ? 'Out of service'
                : r.next ? html`<b>Free</b>Next: ${fmtDate(r.next.check_in)}` : html`<b>Free</b>No upcoming`}</div>
            </div>`)}</div>
        </section>

        <section class="card pad span-5">
          <div class="card-head"><div><h3>Today</h3><p>Arrivals and departures</p></div>
            <div class="seg" role="tablist"><button class="on" data-tab="in">Arrivals</button><button data-tab="out">Departures</button><button data-tab="next">Upcoming</button></div></div>
          <div id="tab-in" class="list">${s.arrivals.length ? s.arrivals.map((b) => row(b, 'in')) : emptyState('login', 'No arrivals today')}</div>
          <div id="tab-out" class="list hidden">${s.departures.length ? s.departures.map((b) => row(b, 'out')) : emptyState('logout', 'No departures today')}</div>
          <div id="tab-next" class="list hidden">${s.upcoming.length ? s.upcoming.map((b) => html`
            <div class="list-row click" data-bk="${b.id}" tabindex="0">${avatar(b.guest_name)}<div class="grow"><b>${b.guest_name}</b><span>Room ${b.room_number} · ${cap(b.room_type)} · ${plural(nights(b.check_in, b.check_out), 'night')}</span></div><span class="muted">${fmtDate(b.check_in)}</span></div>`) : emptyState('calendar', 'Nothing in the next 7 days')}</div>
        </section>

        <section class="card pad span-7">
          <div class="card-head"><div><h3>Booked revenue by month</h3><p>By check-in date, excluding cancellations</p></div>
            <div style="display:flex;gap:14px;align-items:center"><div class="legend"><span><i style="background:var(--chart-line);opacity:.38"></i>Upcoming</span></div>
            <button class="link-btn" data-table="rev">View as table</button></div></div>
          <div class="chart" id="revChart"></div><div class="hidden" id="revTable"></div>
        </section>

        <section class="card pad span-5">
          <div class="card-head"><div><h3>Needs attention</h3><p>${s.attention.length ? 'Items that need a decision' : 'Nothing pending'}</p></div></div>
          ${s.attention.length ? s.attention.map((a) => html`
            <div class="attn ${a.kind === 'no_show' ? 'rose' : ''}" data-bk="${a.booking.id}" tabindex="0">${icon.alert}
              <div><b>${a.kind === 'no_show' ? 'Late arrival' : 'Payment due'} · ${a.booking.guest_name}</b>
                <span>${a.kind === 'no_show' ? `Room ${a.booking.room_number} was due ${fmtDate(a.booking.check_in)}` : `Room ${a.booking.room_number} departs ${fmtDate(a.booking.check_out)} · ${money(a.booking.total_amount)} unpaid`}</span></div></div>`)
            : html`<div class="empty compact"><div class="ico">${icon.check}</div><b>All clear</b><span>No late arrivals or overdue payments.</span></div>`}
        </section>
      </div>
    </div>`);

  // charts
  ring($('#ring', el), s.occupancyPct);
  areaChart($('#occChart', el), s.occupancyTrend.map((d) => ({
    label: fmtDate(d.date), full: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    value: d.pct, display: `${d.pct}% · ${d.occupied} of ${s.activeRooms} rooms` })), { title: 'Occupancy' });
  const rev = s.revenueByMonth.map((m) => ({ label: fmtMonth(m.month), full: `${fmtMonth(m.month)} ${m.month.slice(0, 4)}${m.future ? ' (upcoming)' : ''}`, value: m.revenue, future: m.future, current: m.current, extra: plural(m.bookings, 'booking') }));
  columnChart($('#revChart', el), rev, { format: (v) => money(v), title: 'Booked revenue by month', height: 230 });

  // table views (accessible alternative to the charts)
  const tableFor = (id, headers, rows) => mount($(id, el), html`<table class="data-table"><thead><tr>${headers.map((h) => html`<th>${h}</th>`)}</tr></thead><tbody>${rows.map((r) => html`<tr>${r.map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody></table>`);
  tableFor('#occTable', ['Date', 'Occupied rooms', 'Occupancy'], s.occupancyTrend.map((d) => [fmtDate(d.date), d.occupied, d.pct + '%']));
  tableFor('#revTable', ['Month', 'Bookings', 'Revenue'], rev.map((m) => [m.full, m.extra.split(' ')[0], money(m.value)]));
  $$('[data-table]', el).forEach((b) => (b.onclick = () => {
    const k = b.dataset.table, tbl = $(`#${k}Table`, el), ch = $(`#${k}Chart`, el);
    const show = tbl.classList.contains('hidden');
    tbl.classList.toggle('hidden', !show); ch.classList.toggle('hidden', show);
    b.textContent = show ? 'View as chart' : 'View as table';
  }));

  // count-up numbers
  $$('[data-count]', el).forEach((n) => countUp(n, Number(n.dataset.count), n.hasAttribute('data-money') ? (v) => money(v) : undefined));

  // tabs & interactions
  $$('[data-tab]', el).forEach((b) => (b.onclick = () => {
    $$('[data-tab]', el).forEach((x) => x.classList.toggle('on', x === b));
    ['in', 'out', 'next'].forEach((k) => $(`#tab-${k}`, el).classList.toggle('hidden', b.dataset.tab !== k));
  }));
  const reload = () => render(el);
  $$('[data-bk]', el).forEach((n) => {
    const open = async () => {
      bookingDrawer(await api('/bookings/' + n.dataset.bk), reload);
    };
    n.onclick = open;
    n.onkeydown = (e) => e.key === 'Enter' && open();
  });
  $('#newBk', el).onclick = () => bookingForm({}, reload);
}
