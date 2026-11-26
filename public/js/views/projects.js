/** Projects: every working directory Claude Code has been run in. */
import { el, money, tokens, count, when, skeleton, emptyState } from '../ui.js';
import { api } from '../api.js';
import { barList } from '../charts.js';
import { head } from './overview.js';

export async function projects(root, { go }) {
  const rows = list.map((p) => el('tr', { onclick: () => go(`#/sessions?project=${encodeURIComponent(p.key)}`) },
    el('td', {}, el('span', { class: 'table__title', title: p.key }, p.key)),
    el('td', { class: 'right num' }, count(p.sessions)),
    el('td', { class: 'right num' }, count(p.messages)),
    el('td', { class: 'right num' }, count(p.toolCalls)),
    el('td', { class: 'right num' }, tokens(p.totalTokens)),
    el('td', { class: 'right num', style: { color: 'var(--sand)' } }, money(p.cost)),
    el('td', { class: 'right table__meta' }, when(lastSeen.get(p.key)))
  ));

  const head_row = el('tr', {},
    el('th', {}, 'Directory'),
    el('th', { class: 'right' }, 'Sessions'),
    el('th', { class: 'right' }, 'Messages'),
    el('th', { class: 'right' }, 'Tool calls'),
    el('th', { class: 'right' }, 'Tokens'),
    el('th', { class: 'right' }, 'Cost'),
    el('th', { class: 'right' }, 'Last session')
  );

  const spendPanel = el('section', { class: 'panel' },
    head('Spend by project', `${list.length} project${list.length === 1 ? '' : 's'}`),
    el('div', { class: 'panel__body' }, barList(list, { labelKey: 'key', valueKey: 'cost' }))
  );

  const tablePanel = el('section', { class: 'panel' },
    head('All projects'),
    el('div', { class: 'panel__body panel__body--flush scroll-x' },
      el('table', { class: 'table' }, el('thead', {}, head_row), el('tbody', {}, rows))
    )
  );

  root.append(el('div', { class: 'view' }, spendPanel, tablePanel));
}
