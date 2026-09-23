// Shared UI pieces: page shell, bottom sheets, sparklines.
import { esc } from './util.js';

export function page({ title, back = null, action = '', body }) {
  document.getElementById('topbar').innerHTML = `
    ${back ? `<a class="icon-btn back" href="${back}" aria-label="Back">‹</a>` : '<span class="brand-mark">S</span>'}
    <h1>${esc(title)}</h1>
    <div class="top-action">${action}</div>`;

  // A sheet or the voice recorder floats above the page, so it would otherwise sit on top of the next
  // screen — with the microphone still running. Each one leaves a dismiss handle for exactly this.
  for (const overlay of document.querySelectorAll('.sheet-backdrop')) (overlay.dismiss || (() => overlay.remove()))();

  // Swap in a fresh container rather than refilling the old one: any listener a screen attached to its
  // container dies with it, instead of stacking up every time that screen is opened.
  const old = document.getElementById('view');
  const view = document.createElement('main');
  view.id = 'view';
  view.innerHTML = body;
  old.replaceWith(view);
  window.scrollTo(0, 0);
  return view;
}

export function openSheet({ title, body, onMount }) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-backdrop';
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="sheet-body">${body}</div>
    </div>`;
  const close = () => overlay.remove();
  overlay.dismiss = close; // page() calls this when the screen changes
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', function onKey(e) {
    if (!overlay.isConnected) return document.removeEventListener('keydown', onKey);
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
  document.body.append(overlay);
  onMount?.(overlay, close);
  return { el: overlay, close };
}

// Editable list of names: tap ✕ to remove, tap a suggestion or type one to add.
// Used for a client's rating categories and for session types.
export function listEditor(container, { items, suggestions = [], placeholder = 'Add…', emptyText = 'Nothing yet.', onChange }) {
  let list = [...items];
  const render = (focus = false) => {
    const extra = [...new Set(suggestions)].filter(s => !list.includes(s));
    container.innerHTML = `
      <div class="chips">${list.map((s, i) => `<span class="chip-on">${esc(s)}<button type="button" class="chip-x" data-remove="${i}" aria-label="Remove ${esc(s)}">✕</button></span>`).join('') || `<span class="muted small">${esc(emptyText)}</span>`}</div>
      ${extra.length ? `<div class="chips">${extra.map(s => `<button type="button" class="chip-btn" data-suggest="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div>` : ''}
      <div class="row gap"><input class="grow" data-new placeholder="${esc(placeholder)}" enterkeyhint="done"><button type="button" class="btn ghost" data-add>Add</button></div>`;
    if (focus) container.querySelector('[data-new]').focus();
  };
  const changed = focus => { render(focus); onChange?.([...list]); };
  const add = (name, focus) => {
    name = name.trim();
    if (!name || list.some(x => x.toLowerCase() === name.toLowerCase())) return;
    list.push(name);
    changed(focus);
  };
  container.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.remove !== undefined) { list.splice(Number(btn.dataset.remove), 1); changed(); }
    else if (btn.dataset.suggest) add(btn.dataset.suggest);
    else if (btn.dataset.add !== undefined) add(container.querySelector('[data-new]').value, true);
  });
  container.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('[data-new]')) return;
    e.preventDefault(); // don't submit the surrounding form
    add(e.target.value, true);
  });
  render();
  return { get: () => [...list] };
}

export function sparkline(series, { width = 120, height = 34 } = {}) {
  if (!series.length) return '<span class="muted small">no ratings yet</span>';
  const pts = series.slice(-12);
  const x = i => (pts.length === 1 ? width / 2 : 4 + (i * (width - 8)) / (pts.length - 1));
  const y = v => height - 4 - ((v - 1) / 4) * (height - 8);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    <line x1="0" x2="${width}" y1="${y(3)}" y2="${y(3)}" class="spark-mid"/>
    <path d="${path}" class="spark-line"/>
    <circle cx="${x(pts.length - 1)}" cy="${y(last.value)}" r="3" class="spark-dot"/>
  </svg>`;
}

export function trendArrow(delta) {
  if (delta > 0.25) return '<span class="trend up" title="Improving">▲</span>';
  if (delta < -0.25) return '<span class="trend down" title="Slipping">▼</span>';
  return '<span class="trend flat" title="Steady">—</span>';
}

export function catDot(category) {
  return `<span class="cat-dot" data-cat="${esc(category)}"></span>`;
}

export function emptyState(icon, title, text, action = '') {
  return `<div class="empty"><div class="empty-icon">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}
