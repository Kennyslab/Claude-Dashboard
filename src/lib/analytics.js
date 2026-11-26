/**
 * Aggregation layer.
 *
 * Everything the UI charts is derived here from the session index, so the
 * frontend never has to do arithmetic over raw transcripts.
 */
import { emptyUsage, addUsage, totalTokens } from './transcripts.js';

const DAY = 86400000;

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const hourOf = (d) => new Date(d).getHours();

function bucketAdd(map, key, session) {
  let b = map.get(key);
  if (!b) {
    b = { key, sessions: 0, messages: 0, toolCalls: 0, cost: 0, usage: emptyUsage() };
    map.set(key, b);
  }
  b.sessions++;
  b.messages += session.messageCount;
  b.toolCalls += session.toolCalls;
  b.cost += session.cost;
  addUsage(b.usage, session.usage);
  return b;
}

const finalise = (b) => ({ ...b, totalTokens: totalTokens(b.usage) });

export function filterSessions(sessions, { from, to, project, model, search } = {}) {
  const needle = search ? String(search).toLowerCase() : null;
  return sessions.filter((s) => {
    const stamp = s.endedAt || s.startedAt;
    if (from && stamp && stamp < from) return false;
    if (to && stamp && stamp > to) return false;
    if (project && s.project !== project) return false;
    if (model && !Object.keys(s.models).some((m) => m.includes(model))) return false;
    if (needle) {
      const hay = `${s.title} ${s.project} ${s.gitBranch || ''} ${s.id}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export function summarise(sessions) {
  const usage = emptyUsage();
  let cost = 0, messages = 0, toolCalls = 0, errors = 0, durationMs = 0;
  const models = new Map();
  const tools = new Map();
  const projects = new Set();

  for (const s of sessions) {
    addUsage(usage, s.usage);
    cost += s.cost;
    messages += s.messageCount;
    toolCalls += s.toolCalls;
    errors += s.errors;
    durationMs += s.durationMs;
    projects.add(s.project);
    for (const [m, n] of Object.entries(s.models)) models.set(m, (models.get(m) || 0) + n);
    for (const [t, n] of Object.entries(s.tools)) tools.set(t, (tools.get(t) || 0) + n);
  }

  const cacheDenom = usage.input + usage.cacheRead + usage.cacheWrite;
  return {
    sessions: sessions.length,
    projects: projects.size,
    messages,
    toolCalls,
    errors,
    cost,
    usage,
    totalTokens: totalTokens(usage),
    durationMs,
    avgCostPerSession: sessions.length ? cost / sessions.length : 0,
    avgTokensPerSession: sessions.length ? totalTokens(usage) / sessions.length : 0,
    cacheHitRate: cacheDenom ? usage.cacheRead / cacheDenom : 0,
    models: [...models.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    tools: [...tools.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

export function timeline(sessions, { days = 30 } = {}) {
  const byDay = new Map();
  for (const s of sessions) {
    const stamp = s.endedAt || s.startedAt;
    if (!stamp) continue;
    bucketAdd(byDay, dayKey(stamp), s);
  }
  const out = [];
  const end = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(end - i * DAY);
    out.push(finalise(byDay.get(key) || { key, sessions: 0, messages: 0, toolCalls: 0, cost: 0, usage: emptyUsage() }));
  }
  return out;
}

/** 53-week x 7-day activity heatmap, GitHub-contributions style. */
export function heatmap(sessions, { weeks = 26 } = {}) {
  const byDay = new Map();
  for (const s of sessions) {
    const stamp = s.endedAt || s.startedAt;
    if (!stamp) continue;
    bucketAdd(byDay, dayKey(stamp), s);
  }
  const cells = [];
  const today = new Date();
  const start = new Date(today.getTime() - (weeks * 7 - 1) * DAY);
  start.setDate(start.getDate() - start.getDay()); // align to Sunday
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    const b = byDay.get(key);
    cells.push({
      date: key,
      weekday: new Date(key).getUTCDay(),
      sessions: b ? b.sessions : 0,
      messages: b ? b.messages : 0,
      cost: b ? b.cost : 0,
      tokens: b ? totalTokens(b.usage) : 0,
    });
  }
  return cells;
}

export function byProject(sessions) {
  const map = new Map();
  for (const s of sessions) bucketAdd(map, s.project || 'unknown', s);
  return [...map.values()].map(finalise).sort((a, b) => b.cost - a.cost);
}

export function byModel(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const names = Object.keys(s.models);
    if (!names.length) continue;
    // Attribute a session's usage to its dominant model.
    const dominant = names.sort((a, b) => s.models[b] - s.models[a])[0];
    bucketAdd(map, dominant, s);
  }
  return [...map.values()].map(finalise).sort((a, b) => b.cost - a.cost);
}

export function hourHistogram(sessions) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, sessions: 0, messages: 0 }));
  for (const s of sessions) {
    const stamp = s.startedAt || s.endedAt;
    if (!stamp) continue;
    const h = hours[hourOf(stamp)];
    h.sessions++;
    h.messages += s.messageCount;
  }
  return hours;
}

export function streaks(sessions) {
  const days = new Set(sessions.map((s) => (s.endedAt || s.startedAt) && dayKey(s.endedAt || s.startedAt)).filter(Boolean));
  const sorted = [...days].sort();
  let longest = 0, run = 0, prev = null;
  for (const d of sorted) {
    run = prev && new Date(d) - new Date(prev) === DAY ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  for (let i = 0; ; i++) {
    const key = dayKey(Date.now() - i * DAY);
    if (days.has(key)) current++;
    else if (i > 0) break;        // allow "today not yet active"
    if (i > 3650) break;
  }
  return { activeDays: days.size, longest, current };
}

export function costForecast(sessions) {
  const last30 = timeline(sessions, { days: 30 });
  const spend = last30.reduce((a, d) => a + d.cost, 0);
  const activeDays = last30.filter((d) => d.sessions > 0).length || 1;
  return {
    last30Days: spend,
    perActiveDay: spend / activeDays,
    projectedMonth: (spend / 30) * 30.44,
    projectedYear: (spend / 30) * 365,
  };
}
