// Shared UI pieces: page shell, bottom sheets, sparklines.
import { esc } from './util.js';

export function page({ title, back = null, action = '', body }) {
  document.getElementById('topbar').innerHTML = `
    ${back ? `<a class="icon-btn back" href="${back}" aria-label="Back">‹</a>` : '<span class="brand-mark">S</span>'}
    <h1>${esc(title)}</h1>
    <div class="top-action">${action}</div>`;
  const view = document.getElementById('view');
  view.innerHTML = body;
  view.scrollTop = 0;
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
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-close]')) close(); });
  document.body.append(overlay);
  onMount?.(overlay, close);
  return { el: overlay, close };
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
