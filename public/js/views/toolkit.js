/** Toolkit: what this Claude Code installation is actually configured with. */
import { el, count, bytes, skeleton, emptyState, copy, shortPath } from '../ui.js';
import { api } from '../api.js';
import { head } from './overview.js';

export async function toolkit(root) {
  root.append(el('div', { class: 'view' }, skeleton(60), skeleton(400)));
  const inv = await api.inventory();
  root.replaceChildren();

  const tabs = [
    ['Skills', inv.skills.length, () => skillList(inv.skills)],
    ['Slash commands', inv.commands.length, () => commandList(inv.commands)],
    ['Subagents', inv.agents.length, () => agentList(inv.agents)],
    ['MCP servers', inv.mcp.servers.length, () => mcpList(inv.mcp)],
    ['Hooks', inv.hooks.length, () => hookList(inv.hooks)],
    ['Plugins', inv.plugins.length, () => pluginList(inv.plugins)],
    ['Memory', inv.memory.length, () => memoryList(inv.memory)],
    ['Task lists', inv.todos.length, () => todoList(inv.todos)],
  ];

  const body = el('div', {});
  const bar = el('div', { class: 'tabs', role: 'tablist' }, tabs.map(([label, n, render], i) => el('button', {
    role: 'tab', 'aria-selected': i === 0,
    onclick: (e) => {
      [...bar.children].forEach((b) => b.setAttribute('aria-selected', b === e.currentTarget));
      body.replaceChildren(render());
    },
  }, `${label}${n ? ` (${n})` : ''}`)));

  body.replaceChildren(tabs[0][2]());
  root.append(el('div', { class: 'view' }, el('section', { class: 'panel' },
    head('Toolkit', 'everything this installation is configured with'), bar, body)));
}

const wrap = (...kids) => el('div', { class: 'panel__body' }, ...kids);

function cards(items, render) {
  if (!items.length) return null;
  return el('div', { class: 'mods' }, items.map(render));
}

function skillList(skills) {
  if (!skills.length) return wrap(emptyState('No skills installed', 'Skills live in <code>~/.claude/skills/&lt;name&gt;/SKILL.md</code>. Add one and it appears here.'));
  return wrap(cards(skills, (s) => el('div', { class: 'mod' },
    el('div', { class: 'mod__top' }, el('span', { class: 'mod__name' }, s.name),
      el('span', { class: 'mod__state' }, el('span', { class: 'tag' }, s.source))),
    el('p', { class: 'mod__summary' }, s.description || 'No description in the frontmatter.'),
    s.file && el('div', { class: 'mod__meta' }, el('span', {}, `${s.lines || 0} lines`), el('span', {}, bytes(s.bytes || 0))))));
}

function commandList(cmds) {
  if (!cmds.length) return wrap(emptyState('No slash commands', 'Install the <code>commands</code> mod, or drop a markdown file into <code>~/.claude/commands/</code>.'));
  return wrap(cards(cmds, (c) => el('div', { class: 'mod' },
    el('div', { class: 'mod__top' }, el('span', { class: 'mod__name num' }, c.invoke),
      el('button', { class: 'control control--ghost mod__state', onclick: () => copy(c.invoke, 'Command copied') }, 'Copy')),
    el('p', { class: 'mod__summary' }, c.description || ''),
    c.tools && el('div', { class: 'mod__meta' }, el('span', {}, `tools: ${c.tools}`)))));
}

function agentList(agents) {
  if (!agents.length) return wrap(emptyState('No subagents', 'Subagents are markdown files in <code>~/.claude/agents/</code>. The Usage Analyst mod installs one.'));
  return wrap(cards(agents, (a) => el('div', { class: 'mod' },
    el('div', { class: 'mod__top' }, el('span', { class: 'mod__name' }, a.name),
      a.model && el('span', { class: 'mod__state' }, el('span', { class: 'tag' }, a.model))),
    el('p', { class: 'mod__summary' }, a.description || ''),
    a.tools && el('div', { class: 'mod__meta' }, el('span', {}, `tools: ${a.tools}`)))));
}

function mcpList(mcp) {
  if (!mcp.servers.length) return wrap(emptyState('No MCP servers', 'Add one with <code>claude mcp add</code> and it is listed here.'));
  return el('div', { class: 'panel__body panel__body--flush scroll-x' },
    el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Server'), el('th', {}, 'Transport'), el('th', {}, 'Command or URL'), el('th', {}, 'Env keys'))),
      el('tbody', {}, mcp.servers.map((s) => el('tr', {},
        el('td', {}, el('b', {}, s.name)),
        el('td', {}, el('span', { class: 'tag' }, s.transport)),
        el('td', { class: 'table__meta' }, s.url || [s.command, ...(s.args || [])].join(' ')),
        el('td', { class: 'table__meta' }, s.env.length ? s.env.join(', ') : '—'))))));
}

function hookList(hooks) {
  if (!hooks.length) return wrap(emptyState('No hooks configured', 'Hooks run your own commands around Claude\'s tool calls. The Mods page installs several.'));
  return el('div', { class: 'panel__body panel__body--flush scroll-x' },
    el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Event'), el('th', {}, 'Matcher'), el('th', {}, 'Command'), el('th', { class: 'right' }, 'Timeout'))),
      el('tbody', {}, hooks.map((h) => el('tr', {},
        el('td', {}, el('span', { class: 'tag tag--sonnet' }, h.event)),
        el('td', { class: 'table__meta' }, h.matcher),
        el('td', { class: 'table__meta', style: { maxWidth: '52ch', overflow: 'hidden', textOverflow: 'ellipsis' }, title: h.command }, h.command),
        el('td', { class: 'right table__meta' }, h.timeout ?? '—'))))));
}

function pluginList(plugins) {
  if (!plugins.length) return wrap(emptyState('No plugins', 'Plugins bundle skills, commands and agents together.'));
  return wrap(cards(plugins, (p) => el('div', { class: 'mod' },
    el('div', { class: 'mod__top' }, el('span', { class: 'mod__name' }, p.name),
      p.version && el('span', { class: 'mod__state' }, el('span', { class: 'tag num' }, p.version))),
    el('p', { class: 'mod__summary' }, p.description || ''),
    el('div', { class: 'mod__meta' },
      el('span', {}, `${p.skills} skills`), el('span', {}, `${p.commands} commands`), el('span', {}, `${p.agents} agents`)))));
}

function memoryList(files) {
  if (!files.length) return wrap(emptyState('No memory files', 'A <code>CLAUDE.md</code> in your Claude home applies to every project.'));
  return wrap(files.map((f) => el('div', { style: { marginBottom: '16px' } },
    el('div', { class: 'mod__meta', style: { marginBottom: '7px' } },
      el('span', {}, f.path), el('span', {}, `${f.lines} lines`), el('span', {}, bytes(f.bytes))),
    el('pre', { class: 'msg__result', style: { maxHeight: '320px' } }, f.preview))));
}

function todoList(todos) {
  if (!todos.length) return wrap(emptyState('No task lists', 'Task lists appear when Claude uses the todo tool.'));
  return el('div', { class: 'panel__body panel__body--flush scroll-x' },
    el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Session'), el('th', { class: 'right' }, 'Done'), el('th', { class: 'right' }, 'Running'), el('th', { class: 'right' }, 'Pending'), el('th', {}, 'Latest item'))),
      el('tbody', {}, todos.map((t) => el('tr', { onclick: () => { location.hash = `#/sessions/${t.sessionId}`; } },
        el('td', { class: 'table__meta' }, t.sessionId.slice(0, 8)),
        el('td', { class: 'right num', style: { color: 'var(--teal)' } }, t.completed),
        el('td', { class: 'right num', style: { color: 'var(--sand)' } }, t.inProgress),
        el('td', { class: 'right num' }, t.pending),
        el('td', {}, el('span', { class: 'table__title' }, t.items.at(-1)?.content || '')))))));
}
