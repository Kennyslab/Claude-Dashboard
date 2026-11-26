/** Settings: what Claude Code is configured with, plus the price table. */
import { el, skeleton, toast, copy, count, stamp, icon } from '../ui.js';
import { api } from '../api.js';
import { head } from './overview.js';

export async function settings(root) {
  root.append(el('div', { class: 'view' }, skeleton(200), skeleton(240)));
  const [cfg, pricing, health] = await Promise.all([api.settings(), api.pricing(), api.health()]);
  root.replaceChildren();

  const account = el('section', { class: 'panel' },
    head('This installation'),
    el('div', { class: 'panel__body' },
      el('div', { class: 'grid grid--2' },
        el('dl', { class: 'kv' },
          el('dt', {}, 'Claude home'), el('dd', {}, health.claudeHome),
          el('dt', {}, 'Dashboard version'), el('dd', {}, health.version),
          el('dt', {}, 'Mode'), el('dd', {}, health.readOnly ? 'read-only' : 'read & write'),
          el('dt', {}, 'Serving since'), el('dd', {}, stamp(health.startedAt))),
        el('dl', { class: 'kv' },
          el('dt', {}, 'Claude Code version'), el('dd', {}, cfg.account.version || '—'),
          el('dt', {}, 'Install method'), el('dd', {}, cfg.account.installMethod || '—'),
          el('dt', {}, 'Default model'), el('dd', {}, cfg.account.model || 'not pinned'),
          el('dt', {}, 'Theme'), el('dd', {}, cfg.account.theme || '—'),
          el('dt', {}, 'Launches'), el('dd', {}, cfg.account.numStartups !== null ? count(cfg.account.numStartups) : '—')))));

  const files = el('section', { class: 'panel' },
    head('Configuration files'),
    el('div', { class: 'panel__body panel__body--flush' },
      el('table', { class: 'table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'File'), el('th', {}, 'Path'), el('th', { class: 'right' }, 'Present'))),
        el('tbody', {}, Object.entries(cfg.files).map(([name, f]) => el('tr', { onclick: () => copy(f.path, 'Path copied') },
          el('td', {}, name),
          el('td', { class: 'table__meta' }, f.path),
          el('td', { class: 'right' }, f.exists ? el('span', { class: 'tag tag--ok' }, 'yes') : el('span', { class: 'tag' }, 'no'))))))));

  const effective = el('section', { class: 'panel' },
    head('Effective settings', 'settings.json merged with settings.local.json'),
    el('div', { class: 'panel__body' },
      el('pre', { class: 'msg__result', style: { maxHeight: '420px' } }, JSON.stringify(cfg.effective, null, 2) || '{}')));

  // ---- editable price table -------------------------------------------
  const rows = el('tbody', {});
  const draft = structuredClone(pricing.pricing);

  const numberCell = (pattern, field) => el('input', {
    class: 'control', type: 'number', step: '0.01', min: '0',
    value: draft[pattern][field], style: { width: '92px', textAlign: 'right' },
    oninput: (e) => { draft[pattern][field] = Number(e.target.value); },
  });

  const paint = () => rows.replaceChildren(...Object.keys(draft).map((pattern) => el('tr', {},
    el('td', {}, el('b', { class: 'num' }, pattern)),
    el('td', { class: 'right' }, numberCell(pattern, 'input')),
    el('td', { class: 'right' }, numberCell(pattern, 'output')),
    el('td', { class: 'right' }, numberCell(pattern, 'cacheWrite')),
    el('td', { class: 'right' }, numberCell(pattern, 'cacheRead')))));
  paint();

  const priceTable = el('section', { class: 'panel' },
    head('Price table', 'USD per million tokens, matched against the model id',
      el('div', { style: { display: 'flex', gap: '7px' } },
        el('button', { class: 'control', onclick: () => {
          for (const k of Object.keys(draft)) delete draft[k];
          Object.assign(draft, structuredClone(pricing.defaults));
          paint();
          toast('Reset to defaults', 'Not saved yet — press Save to apply.');
        } }, 'Reset'),
        el('button', { class: 'control control--primary', disabled: health.readOnly, onclick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            await api.savePricing(draft);
            await api.refresh();
            toast('Saved', 'Every cost figure has been recalculated.');
          } catch (err) { toast('Could not save', err.message, 'error'); }
          e.currentTarget.disabled = false;
        } }, 'Save'))),
    el('div', { class: 'panel__body' },
      el('div', { class: 'note' }, icon('alert', ''),
        el('div', {}, 'Costs shown anywhere in this dashboard are estimates: token counts come from your own transcripts and are multiplied by this table. They are not billed amounts. Saved overrides live in ',
          el('b', {}, pricing.path), '.'))),
    el('div', { class: 'panel__body panel__body--flush scroll-x' },
      el('table', { class: 'table' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Model matches'), el('th', { class: 'right' }, 'Input'), el('th', { class: 'right' }, 'Output'),
          el('th', { class: 'right' }, 'Cache write'), el('th', { class: 'right' }, 'Cache read'))),
        rows)));

  const data = el('section', { class: 'panel' },
    head('Your data', 'nothing leaves this machine'),
    el('div', { class: 'panel__body' },
      el('p', { style: { color: 'var(--text-2)', maxWidth: '72ch', margin: '0 0 14px' } },
        'The dashboard reads your Claude Code files from disk and serves them to this browser over localhost. It makes no outbound network requests and stores no copy of your transcripts.'),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        el('a', { class: 'control', href: api.exportUrl({ days: 3650, format: 'json' }), download: 'claude-usage.json' }, 'Export everything as JSON'),
        el('a', { class: 'control', href: api.exportUrl({ days: 3650, format: 'csv' }), download: 'claude-usage.csv' }, 'Export everything as CSV'),
        el('button', { class: 'control', onclick: async (e) => {
          e.currentTarget.disabled = true;
          const r = await api.refresh().catch((err) => ({ error: err.message }));
          toast(r.error ? 'Could not reindex' : 'Reindexed', r.error || `${count(r.sessions)} sessions read from disk`, r.error ? 'error' : 'ok');
          e.currentTarget.disabled = false;
        } }, 'Reindex transcripts'))));

  root.append(el('div', { class: 'view' }, account, priceTable, files, effective, data));
}
