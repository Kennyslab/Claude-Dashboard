/** Small DOM and formatting helpers shared by every view. */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const svg = (tag, props = {}, ...children) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    node.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) if (c) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
};

export const clear = (node) => { while (node.firstChild) node.firstChild.remove(); return node; };

/* ---------------------------------------------------------- formatting --- */

export function money(n) {
  if (!n) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1000) return `$${n.toFixed(2)}`;
  return `$${(n / 1000).toFixed(1)}k`;
}

export function tokens(n) {
  if (!n) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export const count = (n) => (n || 0).toLocaleString();
export const pct = (n, digits = 1) => `${((n || 0) * 100).toFixed(digits)}%`;

export function duration(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function bytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'kB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export const stamp = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour12: false }) : '');

export const shortPath = (p, keep = 2) => {
  if (!p) return '—';
  const parts = String(p).split(/[\\/]/).filter(Boolean);
  return parts.length <= keep ? p : `…/${parts.slice(-keep).join('/')}`;
};

export function modelFamily(name = '') {
  const n = name.toLowerCase();
  if (n.includes('opus')) return 'opus';
  if (n.includes('sonnet')) return 'sonnet';
  if (n.includes('haiku')) return 'haiku';
  return 'other';
}

export const dominantModel = (models = {}) => Object.keys(models).sort((a, b) => models[b] - models[a])[0] || '';

export function modelTag(name) {
  const fam = modelFamily(name);
  return el('span', { class: `tag tag--${fam}`, title: name }, name.replace(/^claude-/, ''));
}

/* --------------------------------------------------------------- icons --- */

const ICONS = {
  overview: 'M3 13h4v8H3zM10 3h4v18h-4zM17 9h4v12h-4z',
  sessions: 'M4 4h16v4H4zM4 10h16v4H4zM4 16h10v4H4z',
  analytics: 'M4 19V5M4 19h16M8 15l4-6 3 3 4-7',
  projects: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  live: 'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8',
  toolkit: 'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.1-2.1z',
  mods: 'M12 3l2.5 5.2 5.5.8-4 3.9.9 5.6L12 15.9 7.1 18.5l.9-5.6-4-3.9 5.5-.8z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11h.1a2 2 0 1 1 0 4H21z',
  refresh: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  download: 'M12 3v12M7 11l5 5 5-5M4 21h16',
  back: 'M15 18l-6-6 6-6',
  theme: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  alert: 'M12 3l9 16H3zM12 9v5M12 17h.01',
  check: 'M20 6L9 17l-5-5',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  external: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5',
};

export function icon(name, cls = 'nav__icon') {
  const d = ICONS[name] || ICONS.overview;
  return svg('svg', { class: cls, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, svg('path', { d }));
}

/* -------------------------------------------------------------- toasts --- */

const toastHost = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
document.addEventListener('DOMContentLoaded', () => document.body.append(toastHost));

export function toast(title, detail = '', kind = 'ok', ms = 4200) {
  const node = el('div', { class: 'toast', dataset: { kind } }, el('b', {}, title), detail && el('span', {}, detail));
  toastHost.append(node);
  setTimeout(() => node.remove(), ms);
  return node;
}

export function copy(text, label = 'Copied') {
  navigator.clipboard?.writeText(text).then(
    () => toast(label, text.length > 80 ? `${text.slice(0, 77)}…` : text),
    () => toast('Could not copy', 'Your browser blocked clipboard access.', 'error')
  );
}

export const skeleton = (h = 120) => el('div', { class: 'skeleton', style: { height: `${h}px` } });

export function emptyState(title, body, extra) {
  return el('div', { class: 'empty' }, el('h3', {}, title), el('p', { html: body }), extra);
}
