// Small shared helpers: HTML escaping, dates, stats.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Dates are stored as local "YYYY-MM-DD" strings so a session logged at 11pm stays on that day.
export function isoDate(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function weekStart(iso = isoDate()) {
  const d = parseDate(iso);
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return isoDate(d);
}

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return parseDate(iso).toLocaleDateString(undefined, opts);
}

export function fmtRange(from, to) {
  return `${fmtDate(from, { month: 'short', day: 'numeric' })} – ${fmtDate(to, { month: 'short', day: 'numeric' })}`;
}

export function daysAgo(iso) {
  const diff = Math.round((parseDate(isoDate()) - parseDate(iso)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 0) return `in ${-diff}d`;
  return `${diff}d ago`;
}

export function fmtDuration(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function average(nums) {
  const list = nums.filter(n => typeof n === 'number' && !Number.isNaN(n));
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

export function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

export function firstName(name) {
  return name.trim().split(/\s+/)[0] || name;
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2400);
}

// Toast with a button, e.g. "Drill removed [Undo]". The action gets a few seconds.
export function toastAction(message, label, action, ms = 7000) {
  document.querySelector('.toast.with-action')?.remove();
  const el = document.createElement('div');
  el.className = 'toast with-action';
  const text = document.createElement('span');
  text.textContent = message;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  el.append(text, btn);
  document.body.append(el);
  setTimeout(() => el.classList.add('show'), 10);
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); };
  const timer = setTimeout(close, ms);
  btn.addEventListener('click', () => { clearTimeout(timer); close(); action(); });
}

// Weights are stored as plain numbers; the unit is a single setting (see meta 'weightUnit').
export function fmtSets(sets, unit = 'lb') {
  const clean = (sets || []).filter(s => Number(s.weight) > 0 || Number(s.reps) > 0);
  if (!clean.length) return '';
  return clean.map(s => `${s.reps || '?'} × ${s.weight ? `${s.weight} ${unit}` : 'bw'}`).join(', ');
}

export function topSet(sets) {
  const clean = (sets || []).filter(s => Number(s.weight) > 0);
  return clean.length ? clean.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a)) : null;
}
