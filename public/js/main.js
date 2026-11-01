import { html, mount, $, $$ } from './lib/html.js';
import { api, setUnauthorizedHandler } from './lib/api.js';
import { icon } from './lib/icons.js';
import { avatar, toast, guard, debounce } from './lib/ui.js';
import { bookingForm, guestForm, roomForm, guestDrawer } from './lib/drawers.js';
import * as dashboard from './views/dashboard.js';
import * as bookings from './views/bookings.js';
import * as calendar from './views/calendar.js';
import * as rooms from './views/rooms.js';
import * as guests from './views/guests.js';

const app = $('#app');
const routes = {
  dashboard: { label: 'Dashboard', icon: icon.dashboard, view: dashboard },
  bookings: { label: 'Bookings', icon: icon.bookings, view: bookings },
  calendar: { label: 'Calendar', icon: icon.calendar, view: calendar },
  rooms: { label: 'Rooms', icon: icon.rooms, view: rooms },
  guests: { label: 'Guests', icon: icon.guests, view: guests },
};

/* ---------- theme ---------- */
const storedTheme = () => { try { return localStorage.getItem('theme'); } catch { return null; } };
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch { /* storage unavailable */ }
  $$('[data-theme-icon]').forEach((n) => mount(n, t === 'dark' ? icon.sun : icon.moon));
}
const toggleTheme = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
document.documentElement.dataset.theme = storedTheme() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/* ---------- login ---------- */
function renderLogin() {
  mount(app, html`
    <div class="login">
      <section class="login-art">
        <div class="brand"><span class="brand-mark">${icon.logo}</span><span class="brand-name">Hotel<small>Management</small></span></div>
        <div><h2>Every stay, <em>perfectly</em> kept.</h2>
          <p>Rooms, guests and reservations in one calm workspace. Double-bookings are impossible by design.</p></div>
        <div class="float-cards">
          <div class="float-card"><small>Occupancy</small><b>86%</b></div>
          <div class="float-card"><small>Arrivals</small><b>12</b></div>
          <div class="float-card"><small>Errors</small><b>−75%</b></div>
        </div>
      </section>
      <section class="login-form-wrap">
        <button class="icon-btn login-theme" id="theme" aria-label="Toggle theme"><span data-theme-icon></span></button>
        <form class="login-form" id="loginForm">
          <h1>Welcome back</h1><p>Sign in to manage your property.</p>
          <div class="field"><label class="lbl" for="u">Username</label><input id="u" name="username" autocomplete="username" required autofocus></div>
          <div class="field"><label class="lbl" for="p">Password</label>
            <div class="pw"><input id="p" name="password" type="password" autocomplete="current-password" required>
              <button type="button" class="icon-btn" id="eye" aria-label="Show password">${icon.eye}</button></div></div>
          <button class="btn primary block" type="submit">Sign in</button>
          <div class="err" id="err" role="alert"></div>
        </form>
      </section>
    </div>`);
  setTheme(document.documentElement.dataset.theme);
  $('#theme').onclick = toggleTheme;
  $('#eye').onclick = () => { const i = $('#p'); i.type = i.type === 'password' ? 'text' : 'password'; };
  const form = $('#loginForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      await api('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      boot();
    } catch (err) {
      $('#err').textContent = err.message;
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      btn.disabled = false;
    }
  };
}

/* ---------- shell ---------- */
function renderShell(user) {
  mount(app, html`
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="#/dashboard"><span class="brand-mark">${icon.logo}</span><span class="brand-name">Hotel<small>Management</small></span></a>
        <div class="nav-label">Workspace</div>
        <nav class="nav" aria-label="Main">${Object.entries(routes).map(([k, r]) => html`<a href="#/${k}" data-r="${k}">${r.icon}<span>${r.label}</span></a>`)}</nav>
        <div class="sidebar-foot">
          <div class="user-chip">${avatar(user.username)}<div class="who"><b>${user.username}</b><span>Administrator</span></div>
            <button class="icon-btn" id="logout" aria-label="Sign out">${icon.logout}</button></div>
        </div>
      </aside>
      <div class="main-wrap">
        <div class="topbar" id="topbar">
          <button class="search-pill" id="open-palette">${icon.search}<span>Search or jump to…</span><kbd>Ctrl K</kbd></button>
          <span class="spacer"></span>
          <span class="date-label">${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <button class="icon-btn" id="theme" aria-label="Toggle theme"><span data-theme-icon></span></button>
        </div>
        <main class="main" id="view" tabindex="-1"></main>
      </div>
    </div>`);
  setTheme(document.documentElement.dataset.theme);
  $('#theme').onclick = toggleTheme;
  $('#logout').onclick = guard(async () => { await api('/auth/logout', { method: 'POST' }); renderLogin(); });
  $('#open-palette').onclick = openPalette;
  addEventListener('scroll', () => $('#topbar')?.classList.toggle('stuck', scrollY > 4), { passive: true });
}

let navToken = 0;
async function route() {
  const view = $('#view');
  if (!view) return;
  const key = location.hash.replace(/^#\//, '') || 'dashboard';
  const r = routes[key] || routes.dashboard;
  const token = ++navToken;
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === (routes[key] ? key : 'dashboard')));
  document.title = `${r.view.meta.title} · Hotel Management`;
  // Each navigation gets its own container, so a slow earlier page can never paint over a newer one
  // and a view can safely re-render itself into the container it was given.
  const holder = document.createElement('div');
  mount(holder, html`<div class="skel h1"></div><div class="grid"><div class="skel span-5" style="height:240px"></div><div class="skel span-7" style="height:240px"></div></div>`);
  view.replaceChildren(holder);
  scrollTo(0, 0);
  try {
    await r.view.render(holder);
  } catch (e) {
    if (!e.silent && token === navToken) mount(holder, html`<div class="card"><div class="empty"><div class="ico">${icon.alert}</div><b>Couldn't load this page</b><span>${e.message}</span></div></div>`);
  }
}
addEventListener('hashchange', route);

/* ---------- command palette ---------- */
let paletteGuests = null;
function openPalette() {
  if ($('.palette')) return;
  const wrap = document.createElement('div');
  mount(wrap, html`<div class="scrim palette-scrim"></div>
    <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <div class="palette-in">${icon.search}<input id="pq" placeholder="Search guests, jump to a page, or run a command…" autocomplete="off"></div>
      <div class="palette-list" id="pl"></div></div>`);
  document.body.appendChild(wrap);
  const input = $('#pq', wrap), list = $('#pl', wrap);
  let items = [], sel = 0;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); };
  const run = (i) => { close(); i?.run(); };

  const commands = [
    ...Object.entries(routes).map(([k, r]) => ({ group: 'Go to', label: r.label, icon: r.icon, run: () => (location.hash = `#/${k}`) })),
    { group: 'Actions', label: 'New booking', icon: icon.plus, run: () => bookingForm({}, route) },
    { group: 'Actions', label: 'New guest', icon: icon.plus, run: () => guestForm(null, route) },
    { group: 'Actions', label: 'Add room', icon: icon.plus, run: () => roomForm(null, route) },
    { group: 'Actions', label: 'Toggle theme', icon: icon.moon, run: toggleTheme },
  ];
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    items = commands.filter((c) => !q || c.label.toLowerCase().includes(q));
    if (q && paletteGuests) {
      items = items.concat(paletteGuests.filter((g) => `${g.name} ${g.email}`.toLowerCase().includes(q)).slice(0, 6)
        .map((g) => ({ group: 'Guests', label: g.name, hint: g.email, icon: icon.users, run: () => guestDrawer(g, route) })));
    }
    sel = Math.min(sel, Math.max(0, items.length - 1));
    let last = '';
    mount(list, items.length ? html`${items.map((c, i) => html`${c.group !== last && (last = c.group) ? html`<div class="palette-group">${c.group}</div>` : ''}
      <button class="palette-item ${i === sel ? 'on' : ''}" data-i="${i}">${c.icon}<span>${c.label}</span>${c.hint ? html`<small>${c.hint}</small>` : ''}</button>`)}`
      : html`<div class="empty">No results</div>`);
    $('.palette-item.on', list)?.scrollIntoView({ block: 'nearest' });
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % items.length; draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(items[sel]); }
  };
  document.addEventListener('keydown', onKey, true);
  $('.scrim', wrap).onclick = close;
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) run(items[b.dataset.i]); });
  input.addEventListener('input', () => { sel = 0; draw(); });
  draw();
  input.focus();
  api('/guests').then((g) => { paletteGuests = g; draw(); }).catch(() => {});
}
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && $('#view')) { e.preventDefault(); openPalette(); }
});

/* ---------- boot ---------- */
setUnauthorizedHandler(renderLogin);
async function boot() {
  let user;
  try { user = await api('/auth/me'); } catch { return renderLogin(); }
  renderShell(user);
  route();
}
boot();
