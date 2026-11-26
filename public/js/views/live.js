/**
 * Live monitor: hook events as they happen, plus the session in progress.
 * Needs the event-logger mod, which is what writes the event stream.
 */
import { el, count, money, tokens, clock, skeleton, emptyState, icon, shortPath, when } from '../ui.js';
import { api } from '../api.js';
import { head } from './overview.js';

let feed = null;
let paused = false;

export async function live(root, { go, bus }) {
  root.append(el('div', { class: 'view' }, skeleton(90), skeleton(300)));
  const [events, current] = await Promise.all([
    api.events({ limit: 300 }),
    api.currentSession().catch(() => null),
  ]);
  root.replaceChildren();

  const now = el('section', { class: 'panel' },
    head('Session in progress', current ? when(current.session.endedAt) : 'nothing running',
      current && el('button', { class: 'control control--ghost', onclick: () => go(`#/sessions/${current.session.id}`) }, 'Open session')),
    el('div', { class: 'panel__body' }, current
      ? el('div', { class: 'grid grid--2' },
          el('dl', { class: 'kv' },
            el('dt', {}, 'Title'), el('dd', { style: { fontFamily: 'var(--sans)' } }, current.session.title),
            el('dt', {}, 'Directory'), el('dd', {}, current.session.cwd || '—'),
            el('dt', {}, 'Branch'), el('dd', {}, current.session.gitBranch || '—')),
          el('dl', { class: 'kv' },
            el('dt', {}, 'Messages'), el('dd', {}, count(current.session.messageCount)),
            el('dt', {}, 'Tokens'), el('dd', {}, tokens(current.session.totalTokens)),
            el('dt', {}, 'Cost so far'), el('dd', { style: { color: 'var(--sand)' } }, money(current.session.cost))))
      : emptyState('No recent session', 'Start Claude Code and this panel follows along.')));

  feed = el('div', { class: 'stream' });

  const pauseBtn = el('button', { class: 'control', onclick: () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    pauseBtn.classList.toggle('control--primary', paused);
  } }, 'Pause');

  const stream = el('section', { class: 'panel' },
    head('Hook events', events.loggerInstalled ? `tailing ${events.logPath}` : 'event logger not installed',
      el('div', { style: { display: 'flex', gap: '7px' } },
        pauseBtn,
        el('button', { class: 'control', onclick: () => { feed.replaceChildren(); } }, 'Clear'))),
    !events.loggerInstalled && el('div', { class: 'panel__body' },
      el('div', { class: 'note' }, icon('alert', ''),
        el('div', {}, 'Live events need the ', el('b', {}, 'Event Logger'), ' mod, which writes every hook event to a log this page tails. ',
          el('a', { href: '#/mods' }, 'Install it from Mods'), '.'))),
    el('div', { class: 'panel__head', style: { paddingBottom: '8px' } },
      el('span', { class: 'panel__note' }, 'time · event · tool · detail')),
    feed);

  if (events.events.length) feed.append(...events.events.map((e) => row(e, false)));
  else if (events.loggerInstalled) feed.append(emptyState('Waiting for events', 'Nothing logged yet. Run a tool in Claude Code and it shows up here within a second.'));

  root.append(el('div', { class: 'view' }, now, stream));

  bus.onHook = (entry) => {
    if (paused || !feed.isConnected) return;
    feed.prepend(row(entry, true));
    while (feed.children.length > 400) feed.lastChild.remove();
  };
}

export function detachLive(bus) { bus.onHook = null; feed = null; }

function row(e, isNew) {
  const bad = e.ok === false || e.kind === 'guard.block';
  return el('div', { class: `stream__row${isNew ? ' stream__row--new' : ''}`, dataset: { bad: String(bad) } },
    el('span', { class: 'stream__ts' }, clock(e.ts)),
    el('span', { class: 'stream__event' }, e.event || e.kind || 'event'),
    el('span', { class: 'stream__tool' }, e.tool || '—'),
    el('span', { class: 'stream__what', title: e.summary || e.reason || '' }, e.reason ? `blocked: ${e.reason}` : (e.summary || shortPath(e.cwd) || '')));
}
