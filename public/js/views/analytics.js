/** Analytics: the same measurements, cut by time, model, project and tool. */
import { el, money, tokens, count, pct, skeleton, emptyState, shortPath } from '../ui.js';
import { api } from '../api.js';
import { traceChart, barList, donut, columns, heatmapGrid, usageBar } from '../charts.js';
import { head } from './overview.js';

const MODEL_COLOURS = { opus: 'var(--violet)', sonnet: 'var(--signal)', haiku: 'var(--teal)', other: 'var(--text-3)' };
const family = (n = '') => (n.includes('opus') ? 'opus' : n.includes('sonnet') ? 'sonnet' : n.includes('haiku') ? 'haiku' : 'other');

export async function analytics(root, { range }) {
  root.append(el('div', { class: 'view' }, skeleton(200), skeleton(300)));
  const d = await api.analytics({ days: range });
  root.replaceChildren();

  if (!d.summary.sessions) {
    root.append(el('div', { class: 'view' }, el('div', { class: 'panel' },
      emptyState('No data in this window', 'Widen the range in the top bar, or run a session first.'))));
    return;
  }

  const s = d.summary;
  const busiest = [...d.timeline].sort((a, b) => b.cost - a.cost).slice(0, 3);

  const topTrace = el('section', { class: 'panel' },
    head(`Last ${range} days`, `${count(s.sessions)} sessions, ${money(s.cost)} estimated`),
    traceChart(d.timeline));

  const splits = el('div', { class: 'grid grid--trace' },
    el('section', { class: 'panel' },
      head('Cost by model'),
      el('div', { class: 'panel__body' }, donut(d.byModel.map((m) => ({
        label: m.key.replace(/^claude-/, ''), value: m.cost, colour: MODEL_COLOURS[family(m.key)],
      }))))),
    el('section', { class: 'panel' },
      head('Token split', 'where the tokens actually went'),
      el('div', { class: 'panel__body' },
        usageBar(s.usage),
        el('dl', { class: 'kv', style: { marginTop: '18px' } },
          el('dt', {}, 'Cache hit rate'), el('dd', { style: { color: 'var(--teal)' } }, pct(s.cacheHitRate)),
          el('dt', {}, 'Avg cost / session'), el('dd', {}, money(s.avgCostPerSession)),
          el('dt', {}, 'Avg tokens / session'), el('dd', {}, tokens(Math.round(s.avgTokensPerSession))),
          el('dt', {}, 'Projected month'), el('dd', { style: { color: 'var(--sand)' } }, money(d.forecast.projectedMonth)),
          el('dt', {}, 'Projected year'), el('dd', {}, money(d.forecast.projectedYear))))));

  const breakdowns = el('div', { class: 'grid grid--2' },
    el('section', { class: 'panel' },
      head('Projects', 'by estimated cost'),
      el('div', { class: 'panel__body' }, barList(d.byProject.slice(0, 12), { labelKey: 'key', valueKey: 'cost' }))),
    el('section', { class: 'panel' },
      head('Tools', 'by number of calls'),
      el('div', { class: 'panel__body' }, d.tools.length
        ? barList(d.tools.slice(0, 12), { labelKey: 'name', valueKey: 'count', format: count, colour: 'var(--signal)' })
        : emptyState('No tool calls', 'Nothing recorded in this window.'))));

  const rhythm = el('div', { class: 'grid grid--2' },
    el('section', { class: 'panel' },
      head('Hour of day', 'when sessions start'),
      el('div', { class: 'panel__body' }, columns(d.hours))),
    el('section', { class: 'panel' },
      head('Activity', 'last six months'),
      el('div', { class: 'panel__body' }, heatmapGrid(d.heatmap))));

  const table = el('section', { class: 'panel' },
    head('Per-project detail'),
    el('div', { class: 'panel__body panel__body--flush scroll-x' },
      el('table', { class: 'table' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Project'), el('th', { class: 'right' }, 'Sessions'), el('th', { class: 'right' }, 'Messages'),
          el('th', { class: 'right' }, 'Tool calls'), el('th', { class: 'right' }, 'Input'), el('th', { class: 'right' }, 'Output'),
          el('th', { class: 'right' }, 'Cache read'), el('th', { class: 'right' }, 'Tokens'), el('th', { class: 'right' }, 'Cost'))),
        el('tbody', {}, d.byProject.map((p) => el('tr', { onclick: () => { location.hash = `#/sessions?project=${encodeURIComponent(p.key)}`; } },
          el('td', { title: p.key }, shortPath(p.key, 3)),
          el('td', { class: 'right num' }, count(p.sessions)),
          el('td', { class: 'right num' }, count(p.messages)),
          el('td', { class: 'right num' }, count(p.toolCalls)),
          el('td', { class: 'right num' }, tokens(p.usage.input)),
          el('td', { class: 'right num' }, tokens(p.usage.output)),
          el('td', { class: 'right num', style: { color: 'var(--teal)' } }, tokens(p.usage.cacheRead)),
          el('td', { class: 'right num' }, tokens(p.totalTokens)),
          el('td', { class: 'right num', style: { color: 'var(--sand)' } }, money(p.cost))))))));

  const peaks = el('section', { class: 'panel' },
    head('Most expensive days', 'in this window'),
    el('div', { class: 'panel__body' }, el('dl', { class: 'kv' },
      busiest.flatMap((b) => [el('dt', {}, b.key), el('dd', {}, `${money(b.cost)} · ${count(b.sessions)} session${b.sessions === 1 ? '' : 's'} · ${tokens(b.totalTokens)} tokens`)]))));

  root.append(el('div', { class: 'view' }, topTrace, splits, breakdowns, rhythm, table, peaks,
    el('p', { class: 'panel__note' }, 'Costs are estimates computed from local transcripts against a price table you can edit in Settings. They are not billed amounts.')));
}
