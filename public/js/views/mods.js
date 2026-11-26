/** Mods: install, inspect and remove the extensions this project ships. */
import { el, skeleton, toast, icon, stamp, copy } from '../ui.js';
import { api } from '../api.js';
import { head } from './overview.js';

const RISK = {
  none: { tag: '', label: 'safe' },
  low: { tag: 'tag--ok', label: 'low risk' },
  medium: { tag: 'tag--warn', label: 'changes your files' },
  high: { tag: 'tag--bad', label: 'high risk' },
};

const CATEGORY_ORDER = ['statusline', 'observability', 'safety', 'workflow', 'commands', 'agents'];
const CATEGORY_COPY = {
  statusline: 'What Claude Code shows at the bottom of every turn.',
  observability: 'Record what happens so the dashboard can show it.',
  safety: 'Guard rails that sit in front of a tool call and can stop it.',
  workflow: 'Small conveniences around the edges of a session.',
  commands: 'Slash commands you can run inside Claude Code.',
  agents: 'Subagents Claude can delegate to.',
};

export async function mods(root) {
  const host = el('div', { class: 'view' }, skeleton(70), skeleton(300));
  root.append(host);
  const data = await api.mods();
  render(data);

  function render(d) {
    const groups = CATEGORY_ORDER
      .map((c) => [c, d.mods.filter((m) => m.category === c)])
      .filter(([, list]) => list.length);
    const active = d.mods.filter((m) => m.status.installed).length;

    host.replaceChildren(
      el('section', { class: 'panel' },
        head('Mods', `${active} of ${d.mods.length} installed`,
          el('button', { class: 'control', onclick: () => copy(d.settingsPath, 'Path copied') }, 'Copy settings path')),
        el('div', { class: 'panel__body' },
          el('div', { class: 'note' }, icon('alert', ''),
            el('div', {}, 'Installing a mod copies a script into ', el('b', {}, d.claudeHome),
              ' and adds an entry to ', el('b', {}, 'settings.json'), '. The settings file is copied to a timestamped backup first, and removing a mod takes out exactly what it added. Hook and status line changes apply to ',
              el('b', {}, 'new'), ' Claude Code sessions.')),
          d.readOnly && el('div', { class: 'note', style: { marginTop: '10px' } }, icon('alert', ''),
            el('div', {}, 'This dashboard is running in read-only mode, so installing is disabled. Restart without ', el('b', {}, '--read-only'), ' to make changes.')),
          ...groups.flatMap(([category, list]) => [
            el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', margin: '26px 0 12px' } },
              el('h3', { class: 'panel__title', style: { margin: 0 } }, label(category)),
              el('span', { class: 'panel__note' }, CATEGORY_COPY[category])),
            el('div', { class: 'mods' }, list.map((m) => card(m, d.readOnly))),
          ])))
    );
  }

  function card(m, readOnly) {
    const on = m.status.installed;
    const risk = RISK[m.risk] || RISK.none;
    const busy = el('span', { class: 'panel__note' });

    const act = async (fn, verb) => {
      busy.textContent = `${verb}…`;
      try {
        const res = await fn(m.id);
        toast(verb === 'Installing' ? 'Installed' : 'Removed', `${m.name}${res.backup ? ` · settings backed up` : ''}`);
        render(res.mods ? { ...await api.mods(), mods: res.mods } : await api.mods());
      } catch (e) {
        toast('Could not change this mod', e.message, 'error', 7000);
        busy.textContent = '';
      }
    };

    return el('div', { class: 'mod', dataset: { on: String(on) } },
      el('div', { class: 'mod__top' },
        el('span', { class: 'mod__name' }, m.name),
        el('span', { class: 'mod__state' }, on
          ? el('span', { class: 'tag tag--ok' }, 'installed')
          : m.status.partial ? el('span', { class: 'tag tag--warn' }, 'partly installed') : el('span', { class: 'tag' }, 'not installed'))),
      el('p', { class: 'mod__summary' }, m.summary),
      el('div', { class: 'mod__meta' },
        el('span', { class: `tag ${risk.tag}` }, risk.label),
        el('span', {}, m.id),
        m.status.installedAt && el('span', {}, `since ${stamp(m.status.installedAt)}`)),
      el('div', { class: 'mod__actions' },
        on
          ? el('button', { class: 'control control--danger', disabled: readOnly, onclick: () => act(api.uninstallMod, 'Removing') }, 'Remove')
          : el('button', { class: 'control control--primary', disabled: readOnly, onclick: () => act(api.installMod, 'Installing') }, 'Install'),
        el('button', { class: 'control control--ghost', onclick: (e) => {
          const next = e.currentTarget.closest('.mod').querySelector('.mod__detail');
          if (next) { next.remove(); e.currentTarget.textContent = 'What it changes'; return; }
          e.currentTarget.textContent = 'Hide details';
          e.currentTarget.closest('.mod').append(detail(m));
        } }, 'What it changes'),
        busy));
  }
}

function detail(m) {
  return el('pre', { class: 'msg__result mod__detail' }, m.install.map((s) => {
    if (s.type === 'copy') return `copy   ${s.from}  →  ~/.claude/${s.to}`;
    if (s.type === 'hook') return `hook   ${s.event}${s.matcher ? ` [${s.matcher}]` : ''}  →  ${s.command}`;
    return `set    settings.${s.path} = ${JSON.stringify(s.value)}`;
  }).join('\n'));
}

const label = (c) => c.charAt(0).toUpperCase() + c.slice(1);
