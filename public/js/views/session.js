/** One session: its readings, its todos and the full transcript. */
import { el, money, tokens, count, stamp, duration, skeleton, emptyState, modelTag, dominantModel, copy, icon, bytes, clock } from '../ui.js';
import { api } from '../api.js';
import { usageBar } from '../charts.js';
import { head } from './overview.js';

export async function session(root, { id, go }) {
  root.append(el('div', { class: 'view' }, skeleton(120), skeleton(420)));
  let data;
  try { data = await api.session(id, { limit: 2000 }); }
  catch (e) {
    root.replaceChildren(el('div', { class: 'view' }, el('div', { class: 'panel' },
      emptyState('Session not found', `No transcript with id <code>${id}</code> is indexed. It may have been deleted.`,
        el('button', { class: 'control', style: { marginTop: '14px' }, onclick: () => go('#/sessions') }, 'Back to sessions')))));
    return;
  }
  root.replaceChildren();

  const s = data.session;
  let filter = 'all';

  const summary = el('section', { class: 'panel' },
    el('div', { class: 'panel__head' },
      el('button', { class: 'control control--ghost', onclick: () => go('#/sessions'), title: 'Back' }, icon('back', 'nav__icon')),
      el('h2', { class: 'panel__title', style: { maxWidth: '70ch' } }, s.title),
      el('div', { class: 'panel__tools' },
        el('button', { class: 'control', onclick: () => copy(s.id, 'Session id copied') }, 'Copy id'),
        el('a', { class: 'control', href: api.rawUrl(s.id), download: `${s.id}.jsonl` }, 'Download transcript'))),
    el('div', { class: 'panel__body' },
      el('div', { class: 'grid grid--2' },
        el('dl', { class: 'kv' },
          el('dt', {}, 'Project'), el('dd', {}, s.project),
          el('dt', {}, 'Working directory'), el('dd', {}, s.cwd || '—'),
          el('dt', {}, 'Git branch'), el('dd', {}, s.gitBranch || '—'),
          el('dt', {}, 'Claude Code'), el('dd', {}, s.version || '—'),
          el('dt', {}, 'Started'), el('dd', {}, stamp(s.startedAt)),
          el('dt', {}, 'Ended'), el('dd', {}, stamp(s.endedAt))),
        el('dl', { class: 'kv' },
          el('dt', {}, 'Messages'), el('dd', {}, `${count(s.messageCount)}  (${count(s.userMessages)} you, ${count(s.assistantMessages)} Claude)`),
          el('dt', {}, 'Tool calls'), el('dd', {}, count(s.toolCalls)),
          el('dt', {}, 'Length'), el('dd', {}, duration(s.durationMs)),
          el('dt', {}, 'Transcript size'), el('dd', {}, bytes(s.sizeBytes)),
          el('dt', {}, 'Models'), el('dd', {}, el('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' } }, Object.keys(s.models).map(modelTag))),
          el('dt', {}, 'Estimated cost'), el('dd', { style: { color: 'var(--sand)' } }, money(s.cost)))),
      el('div', { style: { marginTop: '18px' } }, usageBar(s.usage))));

  const toolRows = Object.entries(s.tools).sort((a, b) => b[1] - a[1]);
  const side = el('div', { class: 'grid grid--2' },
    el('section', { class: 'panel' },
      head('Tools used', `${count(s.toolCalls)} calls`),
      el('div', { class: 'panel__body' }, toolRows.length
        ? el('div', { style: { display: 'grid', gap: '7px' } }, toolRows.map(([name, n]) => el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
            el('span', { style: { flex: 1, fontSize: '13px' } }, name),
            el('span', { class: 'bar-cell__track' }, el('i', { class: 'bar-cell__fill', style: { width: `${(n / toolRows[0][1]) * 100}%`, background: 'var(--signal)' } })),
            el('span', { class: 'num', style: { width: '36px', textAlign: 'right', color: 'var(--text-2)' } }, n))))
        : emptyState('No tool calls', 'This session was conversation only.'))),
    el('section', { class: 'panel' },
      head('Task list', data.todos ? `${data.todos.completed}/${data.todos.total} done` : 'none recorded'),
      el('div', { class: 'panel__body' }, data.todos
        ? el('div', { style: { display: 'grid', gap: '7px' } }, data.todos.items.map((t) => el('div', { style: { display: 'flex', gap: '9px', fontSize: '13px' } },
            el('span', { class: `tag tag--${t.status === 'completed' ? 'ok' : t.status === 'in_progress' ? 'warn' : ''}` }, t.status.replace('_', ' ')),
            el('span', { style: { color: 'var(--text-2)' } }, t.content))))
        : emptyState('No task list', 'Claude did not use the todo tool in this session.'))));

  const transcript = el('div', {});
  const panel = el('section', { class: 'panel' },
    el('div', { class: 'panel__head' },
      el('h2', { class: 'panel__title' }, 'Transcript'),
      el('span', { class: 'panel__note' }, `${count(data.messageTotal)} messages`),
      el('div', { class: 'panel__tools' }, el('div', { class: 'seg' },
        ['all', 'you', 'claude', 'tools'].map((f) => el('button', {
          'aria-pressed': filter === f,
          onclick: (e) => {
            filter = f;
            [...e.currentTarget.parentElement.children].forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget));
            render();
          },
        }, f))))),
    transcript);

  root.append(el('div', { class: 'view' }, summary, side, panel));
  render();

  function render() {
    const msgs = data.messages.filter((m) => {
      if (filter === 'you') return m.role === 'user' && !m.isMeta;
      if (filter === 'claude') return m.role === 'assistant';
      if (filter === 'tools') return m.toolCalls.length || m.toolResult;
      return true;
    });
    transcript.replaceChildren(msgs.length
      ? el('div', {}, msgs.map(messageNode))
      : emptyState('Nothing to show', 'No messages match this filter.'));
  }
}

function messageNode(m) {
  return el('article', { class: 'msg', dataset: { role: m.role } },
    el('div', { class: 'msg__who' },
      el('span', { class: 'msg__role' }, m.role === 'user' ? 'You' : 'Claude'),
      el('span', { class: 'num' }, clock(m.timestamp)),
      m.isSidechain && el('span', { class: 'tag', style: { marginTop: '4px' } }, 'subagent')),
    el('div', {},
      m.text && el('div', { class: 'msg__text' }, m.text.length > 6000 ? `${m.text.slice(0, 6000)}\n\n… truncated` : m.text),
      m.toolCalls.length > 0 && el('div', { class: 'msg__tools' }, m.toolCalls.map((t) => el('span', { class: 'tag tag--sonnet' }, t.name))),
      m.toolResult && el('pre', { class: 'msg__result' }, m.toolResult.preview + (m.toolResult.truncated ? '\n… truncated' : '')),
      m.usage && el('div', { class: 'msg__usage' },
        `in ${tokens(m.usage.input)} · out ${tokens(m.usage.output)} · cache read ${tokens(m.usage.cacheRead)} · cache write ${tokens(m.usage.cacheWrite)}`)));
}
