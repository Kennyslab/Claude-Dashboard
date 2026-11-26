/**
 * Application shell: navigation rail, top bar, hash router, command palette,
 * theme, and the live connection indicator.
 */
import { el, icon, clear, toast, count, shortPath } from './ui.js';
import { api, connectStream } from './api.js';
import { overview } from './views/overview.js';
import { sessions } from './views/sessions.js';
import { session } from './views/session.js';
import { analytics } from './views/analytics.js';
import { projects } from './views/projects.js';
import { live, detachLive } from './views/live.js';
import { toolkit } from './views/toolkit.js';
import { mods } from './views/mods.js';
import { settings } from './views/settings.js';

const NAV = [
  { id: 'overview', label: 'Overview', route: '#/', icon: 'overview' },
  { id: 'sessions', label: 'Sessions', route: '#/sessions', icon: 'sessions' },
  { id: 'analytics', label: 'Analytics', route: '#/analytics', icon: 'analytics' },
  { id: 'projects', label: 'Projects', route: '#/projects', icon: 'projects' },
  { id: 'live', label: 'Live monitor', route: '#/live', icon: 'live' },
  { id: 'toolkit', label: 'Toolkit', route: '#/toolkit', icon: 'toolkit' },
  { id: 'mods', label: 'Mods', route: '#/mods', icon: 'mods' },
  { id: 'settings', label: 'Settings', route: '#/settings', icon: 'settings' },
];

const RANGES = [7, 30, 90, 365];
const store = {
  get theme() { return localStorage.getItem('cd.theme') || 'dark'; },
  set theme(v) { localStorage.setItem('cd.theme', v); },
  get range() { return Number(localStorage.getItem('cd.range')) || 30; },
  set range(v) { localStorage.setItem('cd.range', String(v)); },
};

const bus = { onHook: null };
let current = { view: null };

/* ----------------------------------------------------------------- chrome */

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const titleEl = el('span', { class: 'topbar__title' });
const subEl = el('span', { class: 'topbar__sub' });
const viewHost = el('main', { id: 'view', tabindex: '-1' });
const liveDot = el('span', { class: 'live-dot', dataset: { state: 'off' } }, el('i', {}), el('span', {}, 'connecting'));
const navCounts = {};

const rail = el('aside', { class: 'rail', 'aria-label': 'Sections' },
  el('div', { class: 'brand' },
    el('span', { class: 'brand__mark' }, '◆'),
    el('span', {}, el('div', { class: 'brand__name' }, 'Claude Dashboard'), el('div', { class: 'brand__ver' }, 'loading'))),
  el('nav', { class: 'nav' }, NAV.map((n) => {
    const badge = el('span', { class: 'nav__count' });
    navCounts[n.id] = badge;
    return el('button', {
      class: 'nav__item', dataset: { nav: n.id },
      onclick: () => { go(n.route); rail.dataset.open = 'false'; },
    }, icon(n.icon), el('span', {}, n.label), badge);
  })),
  el('div', { class: 'rail__foot' }, liveDot, el('div', { class: 'rail__home' }, '…'))
);

const rangeSeg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Time range' },
  RANGES.map((d) => el('button', {
    'aria-pressed': d === store.range,
    onclick: () => {
      store.range = d;
      [...rangeSeg.children].forEach((b) => b.setAttribute('aria-pressed', Number(b.textContent.replace(/\D/g, '')) === d));
      route();
    },
  }, `${d}d`)));

const topbar = el('header', { class: 'topbar' },
  el('button', { class: 'control control--ghost rail-toggle', 'aria-label': 'Open navigation', onclick: () => { rail.dataset.open = rail.dataset.open === 'true' ? 'false' : 'true'; } }, icon('menu', 'nav__icon')),
  el('div', {}, titleEl, el('div', {}, subEl)),
  el('div', { class: 'topbar__spacer' }),
  rangeSeg,
  el('button', { class: 'control', onclick: () => openPalette(), title: 'Command palette' }, icon('search', 'nav__icon'), el('kbd', {}, isMac() ? '⌘K' : 'Ctrl K')),
  el('button', { class: 'control control--ghost', title: 'Reindex transcripts', onclick: reindex }, icon('refresh', 'nav__icon')),
  el('button', { class: 'control control--ghost', title: 'Switch theme', onclick: toggleTheme }, icon('theme', 'nav__icon'))
);

document.body.append(el('div', { class: 'shell' }, rail, el('div', { class: 'main' }, topbar, viewHost)));

/* ----------------------------------------------------------------- router */

function parseHash() {
  const raw = location.hash || '#/';
  const [pathPart, queryPart] = raw.slice(1).split('?');
  const segs = pathPart.split('/').filter(Boolean);
  return { segs, query: Object.fromEntries(new URLSearchParams(queryPart || '')) };
}

export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route() {
  const { segs, query } = parseHash();
  const name = segs[0] || 'overview';
  if (current.view === 'live') detachLive(bus);
  current.view = name;

  for (const n of NAV) {
    const btn = rail.querySelector(`[data-nav="${n.id}"]`);
    btn?.setAttribute('aria-current', routeMatches(n, name) ? 'page' : 'false');
  }

  clear(viewHost);
  const ctx = { range: store.range, go, query, bus };

  try {
    if (name === 'overview') { setTitle('Overview', 'Your Claude Code instrument panel'); await overview(viewHost, ctx); }
    else if (name === 'sessions' && segs[1]) { setTitle('Session', segs[1]); await session(viewHost, { ...ctx, id: segs[1] }); }
    else if (name === 'sessions') { setTitle('Sessions', 'Every transcript on this machine'); await sessions(viewHost, ctx); }
    else if (name === 'analytics') { setTitle('Analytics', `Last ${store.range} days`); await analytics(viewHost, ctx); }
    else if (name === 'projects') { setTitle('Projects', 'Grouped by working directory'); await projects(viewHost, ctx); }
    else if (name === 'live') { setTitle('Live monitor', 'Hook events as they happen'); await live(viewHost, ctx); }
    else if (name === 'toolkit') { setTitle('Toolkit', 'Skills, commands, agents, MCP and hooks'); await toolkit(viewHost, ctx); }
    else if (name === 'mods') { setTitle('Mods', 'Extend Claude Code itself'); await mods(viewHost, ctx); }
    else if (name === 'settings') { setTitle('Settings', 'Configuration and price table'); await settings(viewHost, ctx); }
    else { setTitle('Not found', name); viewHost.append(el('div', { class: 'view' }, el('div', { class: 'panel' },
      el('div', { class: 'empty' }, el('h3', {}, 'No such page'), el('p', {}, 'Use the navigation on the left.'))))); }
  } catch (e) {
    viewHost.append(el('div', { class: 'view' }, el('div', { class: 'panel' },
      el('div', { class: 'empty' },
        el('h3', {}, 'This view could not load'),
        el('p', {}, e.message),
        el('button', { class: 'control', style: { marginTop: '14px' }, onclick: route }, 'Try again')))));
  }
  viewHost.scrollTo?.({ top: 0 });
}

const routeMatches = (nav, name) => nav.id === name || (nav.id === 'overview' && name === 'overview');

function setTitle(title, sub) {
  titleEl.textContent = title;
  subEl.textContent = sub || '';
  document.title = `${title} — Claude Dashboard`;
}

window.addEventListener('hashchange', route);

/* ------------------------------------------------------------ chrome bits */

function applyTheme() {
  document.documentElement.dataset.theme = store.theme === 'light' ? 'light' : 'dark';
}
function toggleTheme() {
  store.theme = store.theme === 'light' ? 'dark' : 'light';
  applyTheme();
}
applyTheme();

async function reindex(e) {
  const btn = e?.currentTarget;
  if (btn) btn.disabled = true;
  try {
    const r = await api.refresh();
    toast('Reindexed', `${count(r.sessions)} sessions read from disk`);
    route();
  } catch (err) {
    toast('Could not reindex', err.message, 'error');
  }
  if (btn) btn.disabled = false;
}

/* -------------------------------------------------------- command palette */

let paletteOpen = false;

async function openPalette() {
  if (paletteOpen) return;
  paletteOpen = true;

  const results = el('ul', { role: 'listbox' });
  const input = el('input', { type: 'text', placeholder: 'Jump to a page or search your sessions', 'aria-label': 'Command palette' });
  const box = el('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' }, input, results);
  const backdrop = el('div', { class: 'palette-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, box);
  document.body.append(backdrop);
  input.focus();

  let items = [];
  let cursor = 0;
  let sessionCache = null;

  const baseItems = [
    ...NAV.map((n) => ({ label: n.label, hint: 'page', run: () => go(n.route) })),
    { label: 'Switch theme', hint: 'action', run: toggleTheme },
    { label: 'Reindex transcripts', hint: 'action', run: () => reindex() },
    { label: 'Export usage as CSV', hint: 'action', run: () => { location.href = api.exportUrl({ days: 3650, format: 'csv' }); } },
  ];

  const paint = () => {
    results.replaceChildren(...items.slice(0, 40).map((it, i) => el('li', {
      role: 'option', 'aria-selected': i === cursor,
      onmouseenter: () => { cursor = i; paint(); },
      onclick: () => { close(); it.run(); },
    }, el('span', {}, it.label), el('small', {}, it.hint))));
  };

  const search = async (q) => {
    const needle = q.trim().toLowerCase();
    if (!needle) { items = baseItems; cursor = 0; paint(); return; }
    const matches = baseItems.filter((i) => i.label.toLowerCase().includes(needle));
    if (!sessionCache) sessionCache = (await api.sessions({ limit: 300 }).catch(() => ({ sessions: [] }))).sessions;
    const hits = sessionCache
      .filter((s) => `${s.title} ${s.project} ${s.gitBranch || ''}`.toLowerCase().includes(needle))
      .slice(0, 24)
      .map((s) => ({ label: s.title, hint: shortPath(s.project), run: () => go(`#/sessions/${s.id}`) }));
    items = [...matches, ...hits];
    cursor = 0;
    paint();
  };

  await search('');

  input.addEventListener('input', () => search(input.value));
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { cursor = Math.min(cursor + 1, items.length - 1); paint(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { cursor = Math.max(cursor - 1, 0); paint(); e.preventDefault(); }
    if (e.key === 'Enter' && items[cursor]) { const it = items[cursor]; close(); it.run(); }
  };
  input.addEventListener('keydown', onKey);

  function close() { paletteOpen = false; backdrop.remove(); }
}

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (paletteOpen || /input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
  const jump = { g: null, 1: '#/', 2: '#/sessions', 3: '#/analytics', 4: '#/projects', 5: '#/live', 6: '#/toolkit', 7: '#/mods', 8: '#/settings' }[e.key];
  if (jump) go(jump);
  if (e.key === '/') { e.preventDefault(); openPalette(); }
  if (e.key === 't') toggleTheme();
  if (e.key === 'r') reindex();
});

/* ------------------------------------------------------------------- boot */

(async function boot() {
  try {
    const [health, index] = await Promise.all([api.health(), api.sessions({ limit: 1 }).catch(() => ({ total: 0 }))]);
    rail.querySelector('.brand__ver').textContent = `v${health.version}${health.readOnly ? ' · read-only' : ''}`;
    rail.querySelector('.rail__home').textContent = health.claudeHome;
    navCounts.sessions.textContent = index.total ? count(index.total) : '';
    const [inv, modList] = await Promise.all([api.inventory().catch(() => null), api.mods().catch(() => null)]);
    if (inv) navCounts.toolkit.textContent = count(inv.skills.length + inv.commands.length + inv.agents.length + inv.mcp.servers.length);
    if (modList) navCounts.mods.textContent = `${modList.mods.filter((m) => m.status.installed).length}/${modList.mods.length}`;
    if (inv) navCounts.projects.textContent = '';
  } catch (e) {
    toast('Cannot reach the dashboard server', e.message, 'error', 9000);
  }

  route();

  connectStream({
    onState: (s) => {
      liveDot.dataset.state = s === 'live' ? 'on' : 'off';
      liveDot.lastChild.textContent = s === 'live' ? 'live' : 'reconnecting';
    },
    onData: (d) => {
      navCounts.sessions.textContent = count(d.sessions);
      if (['overview', 'live'].includes(current.view)) route();
    },
    onHook: (entry) => bus.onHook?.(entry),
  });
})();
