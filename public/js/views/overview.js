/** Overview: the instrument panel. One trace, one gauge strip, four readings. */
import { el, money, tokens, count, pct, when, duration, skeleton, emptyState, dominantModel, modelTag, shortPath } from '../ui.js';
import { api } from '../api.js';
import { traceChart, barList, donut, heatmapGrid, columns } from '../charts.js';

const MODEL_COLOURS = { opus: 'var(--violet)', sonnet: 'var(--signal)', haiku: 'var(--teal)', other: 'var(--text-3)' };

export async function overview(root, { range, go }) {
  root.append(el('div', { class: 'view' }, skeleton(210), skeleton(84), skeleton(260)));
  const data = await api.overview({ days: range });
  root.replaceChildren();

  if (!data.available || data.allTime.sessions === 0) {
    root.append(el('div', { class: 'view' }, el('div', { class: 'panel' }, emptyState(
      'No sessions yet',
      `Nothing to measure so far. Run Claude Code once in any project and this page fills in.<br><br>Looking in <code>${data.claudeHome}/projects</code>.`
    ))));
    return;
  }

  const w = data.window;
  const half = Math.floor(data.timeline.length / 2);
  const prev = data.timeline.slice(0, half).reduce((a, d) => a + d.cost, 0);
  const curr = data.timeline.slice(half).reduce((a, d) => a + d.cost, 0);
  const change = prev > 0 ? (curr - prev) / prev : 0;

  const trace = el('section', { class: 'panel trace' },
    el('div', { class: 'trace__head' },
      el('div', {},
        el('div', { class: 'trace__label' }, `Spend over the last ${range} days`),
        el('div', { class: 'panel__note', style: { marginTop: '2px' } },
          `${count(w.sessions)} sessions across ${count(w.projects)} project${w.projects === 1 ? '' : 's'}`)),
      el('div', { class: 'trace__reading' },
        el('div', { class: 'trace__value' }, money(w.cost)),
        el('div', { class: 'trace__delta' },
          prev > 0
            ? [el('b', { class: change > 0 ? 'delta-up' : 'delta-down' }, `${change > 0 ? '+' : ''}${(change * 100).toFixed(0)}%`), ' vs the previous half']
            : el('span', {}, `${tokens(w.totalTokens)} tokens`)))),
    el('div', { class: 'trace__chart' }, traceChart(data.timeline))
  );

  const gauges = el('section', { class: 'gauges' },
    gauge('tokens', 'Tokens', tokens(w.totalTokens), `${tokens(Math.round(w.avgTokensPerSession))} per session`),
    gauge('cache', 'Cache hits', pct(w.cacheHitRate, 0), el('span', { class: 'meter' }, el('i', { style: { width: pct(w.cacheHitRate, 0) } }))),
    gauge('cost', 'Projected month', money(data.forecast.projectedMonth), `${money(data.forecast.perActiveDay)} per active day`),
    gauge('', 'Tool calls', count(w.toolCalls), `${count(w.messages)} messages`),
    gauge('', 'Streak', `${data.streaks.current} d`, `best ${data.streaks.longest}, ${data.streaks.activeDays} active days`),
    gauge(w.errors ? 'errors' : '', 'Errors', count(w.errors), w.errors ? 'in this window' : 'none in this window')
  );

  const modelSlices = data.models.map((m) => ({
    label: m.key.replace(/^claude-/, ''),
    value: m.cost,
    colour: MODEL_COLOURS[family(m.key)],
  }));

  const middle = el('div', { class: 'grid grid--trace' },
    el('section', { class: 'panel' },
      head('Where the money goes', 'by model, all time'),
      el('div', { class: 'panel__body' }, modelSlices.length ? donut(modelSlices) : emptyState('No model data', 'Usage is recorded per API request; none has been seen yet.'))),
    el('section', { class: 'panel' },
      head('Daily activity', 'last six months'),
      el('div', { class: 'panel__body' }, heatmapGrid(data.heatmap)))
  );

  const lower = el('div', { class: 'grid grid--2' },
    el('section', { class: 'panel' },
      head('Projects by spend', 'all time',
        el('button', { class: 'control control--ghost', onclick: () => go('#/projects') }, 'All projects')),
      el('div', { class: 'panel__body' }, barList(data.topProjects, { labelKey: 'key', valueKey: 'cost' }))),
    el('section', { class: 'panel' },
      head('When you work', 'sessions by hour of day'),
      el('div', { class: 'panel__body' }, columns(data.hours)))
  );

  const recent = el('section', { class: 'panel' },
    head('Recent sessions', '', el('button', { class: 'control control--ghost', onclick: () => go('#/sessions') }, 'Open explorer')),
    el('div', { class: 'panel__body panel__body--flush' },
      el('table', { class: 'table' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Session'), el('th', {}, 'Project'), el('th', {}, 'Model'),
          el('th', { class: 'right' }, 'Tokens'), el('th', { class: 'right' }, 'Cost'), el('th', { class: 'right' }, 'When'))),
        el('tbody', {}, data.recentSessions.map((s) => el('tr', {
          dataset: { model: dominantModel(s.models) },
          onclick: () => go(`#/sessions/${s.id}`),
        },
          el('td', {}, el('span', { class: 'table__title' }, s.title), el('span', { class: 'table__meta' }, `${duration(s.durationMs)} · ${count(s.messageCount)} msg`)),
          el('td', {}, el('span', { class: 'table__meta' }, shortPath(s.project))),
          el('td', {}, modelTag(dominantModel(s.models) || 'unknown')),
          el('td', { class: 'right num' }, tokens(s.totalTokens)),
          el('td', { class: 'right num', style: { color: 'var(--sand)' } }, money(s.cost)),
          el('td', { class: 'right table__meta' }, when(s.endedAt))
        ))))));

  root.append(el('div', { class: 'view' }, trace, gauges, middle, lower, recent));
}

const family = (n = '') => (n.includes('opus') ? 'opus' : n.includes('sonnet') ? 'sonnet' : n.includes('haiku') ? 'haiku' : 'other');

function gauge(kind, label, value, foot) {
  return el('div', { class: `gauge${kind ? ` gauge--${kind}` : ''}` },
    el('span', { class: 'gauge__label' }, label),
    el('span', { class: 'gauge__value' }, value),
    el('span', { class: 'gauge__foot' }, foot));
}

export function head(title, note, tools) {
  return el('div', { class: 'panel__head' },
    el('h2', { class: 'panel__title' }, title),
    note && el('span', { class: 'panel__note' }, note),
    tools && el('div', { class: 'panel__tools' }, tools));
}
