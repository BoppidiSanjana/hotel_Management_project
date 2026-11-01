import { html, esc, mount, $ } from './html.js';
import { icon } from './icons.js';
import { initials, hue, label } from './format.js';

/* ---------- small renderers ---------- */
export const avatar = (name, size = '') => html`<span class="avatar ${size} av${hue(name)}" aria-hidden="true">${initials(name)}</span>`;

const STATUS_TONE = { reserved: 'blue', checked_in: 'green', checked_out: '', cancelled: 'rose', active: 'green', maintenance: 'brass' };
export const statusPill = (s) => html`<span class="pill ${STATUS_TONE[s] || ''}">${label(s)}</span>`;

export const emptyState = (iconName, title, text = '') => html`
  <div class="empty"><div class="ico">${icon[iconName]}</div><b>${title}</b>${text ? html`<span>${text}</span>` : ''}</div>`;

export const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

/* ---------- toasts ---------- */
export function toast(msg, type = 'ok') {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  mount(el, html`${type === 'error' ? icon.alert : icon.check}<span>${msg}</span>`);
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 3400);
}

// Wraps an async handler so failures surface as toasts instead of unhandled rejections
export const guard = (fn) => async (...args) => {
  try { return await fn(...args); } catch (e) { if (!e.silent) toast(e.message, 'error'); }
};

/* ---------- tooltip (one shared element) ---------- */
let tipEl;
export function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
  }
  return {
    show(x, y, title, value) {
      tipEl.textContent = '';
      const t = document.createElement('div'); t.className = 't-title'; t.textContent = title;
      const v = document.createElement('div'); v.className = 't-val';
      const k = document.createElement('span'); k.className = 't-key';
      v.append(k, document.createTextNode(value));
      tipEl.append(t, v);
      tipEl.classList.add('on');
      const r = tipEl.getBoundingClientRect();
      const left = Math.min(Math.max(8, x - r.width / 2), innerWidth - r.width - 8);
      tipEl.style.left = left + 'px';
      tipEl.style.top = Math.max(8, y - r.height - 12) + 'px';
    },
    hide() { tipEl?.classList.remove('on'); },
  };
}

/* ---------- drawer ---------- */
let current = null;
export function closeDrawer() {
  if (!current) return;
  const { wrap, restore } = current;
  current = null;
  wrap.remove();
  restore?.focus?.();
}

export function openDrawer({ title, subtitle = '', body, footer = '', onSubmit, wide = false, lead = '' }) {
  closeDrawer();
  const wrap = document.createElement('div');
  const asForm = !!onSubmit;
  const tag = asForm ? 'form' : 'div';
  const inner = html`
      <div class="drawer-head">
        <div style="display:flex;gap:14px;align-items:center;min-width:0">${lead}<div style="min-width:0"><h2>${title}</h2>${subtitle ? html`<p>${subtitle}</p>` : ''}</div></div>
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon.x}</button>
      </div>
      <div class="drawer-body">${body}</div>
      ${footer ? html`<div class="drawer-foot">${footer}</div>` : ''}`;
  const width = wide ? ' style="width:min(560px,calc(100vw - 20px))"' : '';
  wrap.innerHTML = `<div class="scrim" data-close></div><${tag} class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"${width}>${inner.s}</${tag}>`;
  document.body.appendChild(wrap);
  const panel = $('.drawer', wrap);
  const me = { wrap, restore: document.activeElement };
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });
  if (asForm) {
    panel.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', panel);
      btn.disabled = true;
      try {
        const keep = await onSubmit(new FormData(panel), panel);
        if (keep !== false && current === me) closeDrawer(); // a follow-up drawer may already be open
      } catch (err) {
        if (!err.silent) toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }
  current = me;
  const first = $('input:not([type=hidden]), select', panel);
  (first || panel).focus?.({ preventScroll: true });
  return panel;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

/* ---------- confirm dialog ---------- */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    mount(wrap, html`
      <div class="scrim strong"></div>
      <div class="modal" role="alertdialog" aria-modal="true" aria-label="${title}">
        <h3>${title}</h3><p>${message}</p>
        <div class="row"><button class="btn" data-no>Cancel</button>
          <button class="btn ${danger ? 'danger solid' : 'primary'}" data-yes>${confirmLabel}</button></div>
      </div>`);
    document.body.appendChild(wrap);
    const done = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    document.addEventListener('keydown', onKey, true);
    $('[data-yes]', wrap).onclick = () => done(true);
    $('[data-no]', wrap).onclick = () => done(false);
    $('.scrim', wrap).onclick = () => done(false);
    $('[data-no]', wrap).focus();
  });
}

/* ---------- count-up numbers ---------- */
export function countUp(el, to, fmt = (n) => Math.round(n).toLocaleString('en-US'), ms = 900) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = fmt(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
