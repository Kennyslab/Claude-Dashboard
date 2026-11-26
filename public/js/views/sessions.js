/** Session explorer: a sortable, filterable index of every transcript. */
import { el, money, tokens, count, when, duration, skeleton, emptyState, dominantModel, modelTag, shortPath, bytes } from '../ui.js';
import { api } from '../api.js';
import { head } from './overview.js';

const state = { sort: 'recent', project: '', search: '', limit: 60, offset: 0 };

export async function sessions(root, { go, query }) {
  if (query.project !== undefined) state.project = query.project;
  if (query.q !== undefined) state.search = query.q;

  const body = el('div', { class: 'panel__body panel__body--flush' }, skeleton(320));
  const projectSelect = el('select', { class: 'control', onchange: (e) => { state.project = e.target.value; state.offset = 0; load(); } });
  const searchBox = el('div', { class: 'search' },
    el('input', { type: 'search', placeholder: 'Filter by title, project or branch', value: state.search,
      oninput: debounce((e) => { state.search = e.target.value; state.offset = 0; load(); }, 220) }));

  const counter = el('span', { class: 'panel__note' });
  const pager = el('div', { class: 'panel__body', style: { display: 'flex', gap: '8px', alignItems: 'center', borderTop: '1px solid var(--line-soft)' } });

  const panel = el('section', { class: 'panel' },
    head('Sessions', '', el('div', { style: { display: 'flex', gap: '8px' } },
      searchBox, projectSelect,
      el('a', { class: 'control', href: api.exportUrl({ days: 3650, format: 'csv' }), download: 'claude-sessions.csv' }, 'Export CSV'))),
    el('div', { class: 'panel__head', style: { paddingBottom: '10px' } }, counter),
    body, pager);

  root.append(el('div', { class: 'view' }, panel));

  const projects = await api.projects().catch(() => ({ projects: [] }));
  projectSelect.replaceChildren(
    el('option', { value: '' }, 'All projects'),
    ...projects.projects.map((p) => el('option', { value: p.key, selected: p.key === state.project }, `${shortPath(p.key, 2)} (${p.sessions})`))
  );

  await load();

  async function load() {
    body.replaceChildren(skeleton(320));
    const data = await api.sessions({ ...state, search: state.search });
    counter.textContent = data.total
      ? `${count(data.total)} sessions · showing ${data.offset + 1}–${Math.min(data.offset + data.limit, data.total)}`
      : '';
    if (!data.sessions.length) {
      body.replaceChildren(emptyState('Nothing matches', 'Clear the filter or widen the project selection to see more sessions.'));
      pager.replaceChildren();
      return;
    }

    const th = (label, key, cls = '') => el('th', {
      class: cls, dataset: { sort: key },
      'aria-sort': state.sort === key ? 'descending' : null,
      onclick: () => { state.sort = key; state.offset = 0; load(); },
    }, label);

    body.replaceChildren(el('div', { class: 'scroll-x' }, el('table', { class: 'table' },
      el('thead', {}, el('tr', {},
        th('Session', 'recent'), el('th', {}, 'Project'), el('th', {}, 'Branch'), el('th', {}, 'Model'),
        th('Messages', 'messages', 'right'), th('Tools', 'messages', 'right'),
        th('Tokens', 'tokens', 'right'), th('Cost', 'cost', 'right'), th('Length', 'duration', 'right'),
        el('th', { class: 'right' }, 'Ended'))),
      el('tbody', {}, data.sessions.map((s) => el('tr', {
        dataset: { model: dominantModel(s.models) },
        onclick: () => go(`#/sessions/${s.id}`),
        tabindex: 0,
        onkeydown: (e) => { if (e.key === 'Enter') go(`#/sessions/${s.id}`); },
      },
        el('td', {},
          el('span', { class: 'table__title', title: s.title }, s.title),
          el('span', { class: 'table__meta' }, `${s.id.slice(0, 8)} · ${bytes(s.sizeBytes)}`)),
        el('td', {}, el('span', { class: 'table__meta', title: s.project }, shortPath(s.project))),
        el('td', {}, s.gitBranch ? el('span', { class: 'tag' }, s.gitBranch) : el('span', { class: 'table__meta' }, '—')),
        el('td', {}, modelTag(dominantModel(s.models) || 'unknown')),
        el('td', { class: 'right num' }, count(s.messageCount)),
        el('td', { class: 'right num' }, count(s.toolCalls)),
        el('td', { class: 'right num' }, tokens(s.totalTokens)),
        el('td', { class: 'right num', style: { color: 'var(--sand)' } }, money(s.cost)),
        el('td', { class: 'right num table__meta' }, duration(s.durationMs)),
        el('td', { class: 'right table__meta' }, when(s.endedAt))
      ))))));

    pager.replaceChildren(
      el('button', { class: 'control', disabled: data.offset === 0, onclick: () => { state.offset = Math.max(0, state.offset - state.limit); load(); } }, 'Previous'),
      el('button', { class: 'control', disabled: data.offset + data.limit >= data.total, onclick: () => { state.offset += state.limit; load(); } }, 'Next'),
      el('span', { class: 'panel__note' }, `sorted by ${state.sort}`)
    );
  }
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
