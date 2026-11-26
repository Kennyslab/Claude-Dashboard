/**
 * HTTP API.
 *
 * Read endpoints are plain GETs. Mutating endpoints (mod install/uninstall,
 * pricing overrides) are POST/PUT only, are refused entirely in `--read-only`
 * mode, and require a same-origin custom header so that a random web page
 * cannot drive the local server from the user's browser.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { paths, readJsonSafe } from '../lib/paths.js';
import { scanSessions, parseSession, findSessionFile, invalidate } from '../lib/transcripts.js';
import * as A from '../lib/analytics.js';
import * as inv from '../lib/inventory.js';
import * as mods from '../lib/mods.js';
import { pricingTable, resetPricingCache, DEFAULT_PRICING } from '../lib/pricing.js';

const json = (body, status = 200, headers = {}) => ({ status, body, headers });
const err = (status, message) => json({ error: message }, status);

async function sessionsFor(q) {
  const { sessions, available } = await scanSessions();
  return { all: sessions, available, filtered: A.filterSessions(sessions, q) };
}

function queryWindow(q) {
  const days = Math.max(1, Math.min(3650, Number(q.days) || 30));
  const from = q.from || new Date(Date.now() - days * 86400000).toISOString();
  return { days, from, to: q.to, project: q.project, model: q.model, search: q.search };
}

export function buildRoutes(ctx) {
  const guardWrite = (req) => {
    if (ctx.readOnly) return err(403, 'This dashboard is running in read-only mode (--read-only).');
    if (req.headers['x-claude-dashboard'] !== '1') {
      return err(403, 'Missing X-Claude-Dashboard header. Mutating requests must come from the dashboard UI or CLI.');
    }
    return null;
  };

  return [
    ['GET', /^\/api\/health$/, async () => json({
      ok: true,
      version: ctx.version,
      readOnly: ctx.readOnly,
      claudeHome: paths().home,
      startedAt: ctx.startedAt,
      uptimeSec: Math.round((Date.now() - new Date(ctx.startedAt)) / 1000),
    })],

    ['GET', /^\/api\/overview$/, async (req, q) => {
      const { all, available } = await sessionsFor({});
      const win = queryWindow(q);
      const recent = A.filterSessions(all, { from: win.from });
      return json({
        available,
        claudeHome: paths().home,
        allTime: A.summarise(all),
        window: { days: win.days, ...A.summarise(recent) },
        timeline: A.timeline(all, { days: win.days }),
        heatmap: A.heatmap(all, { weeks: 26 }),
        streaks: A.streaks(all),
        forecast: A.costForecast(all),
        topProjects: A.byProject(all).slice(0, 8),
        models: A.byModel(all),
        hours: A.hourHistogram(all),
        recentSessions: all.slice(0, 8).map(slim),
        environment: await inv.environment(),
      });
    }],

    ['GET', /^\/api\/analytics$/, async (req, q) => {
      const win = queryWindow(q);
      const { filtered, all } = await sessionsFor(win);
      return json({
        window: win,
        summary: A.summarise(filtered),
        timeline: A.timeline(filtered, { days: win.days }),
        byProject: A.byProject(filtered),
        byModel: A.byModel(filtered),
        hours: A.hourHistogram(filtered),
        heatmap: A.heatmap(filtered, { weeks: 26 }),
        forecast: A.costForecast(all),
        tools: A.summarise(filtered).tools,
      });
    }],

    ['GET', /^\/api\/sessions$/, async (req, q) => {
      const { filtered, available } = await sessionsFor({
        project: q.project, model: q.model, search: q.search, from: q.from, to: q.to,
      });
      const offset = Math.max(0, Number(q.offset) || 0);
      const limit = Math.max(1, Math.min(500, Number(q.limit) || 50));
      const sort = q.sort || 'recent';
      const sorted = [...filtered].sort(sorters[sort] || sorters.recent);
      return json({
        available,
        total: filtered.length,
        offset,
        limit,
        sessions: sorted.slice(offset, offset + limit).map(slim),
      });
    }],

    ['GET', /^\/api\/sessions\/current$/, async () => {
      const { sessions } = await scanSessions();
      const live = sessions[0];
      if (!live) return err(404, 'No sessions found yet.');
      const { session, messages } = await parseSession(live.file, { withMessages: true });
      return json({ session, messages: messages.slice(-40), todos: (await inv.todos()).find((t) => t.sessionId === session.id) || null });
    }],

    ['GET', /^\/api\/sessions\/([\w.-]+)$/, async (req, q, [, id]) => {
      await scanSessions();
      const file = findSessionFile(id);
      if (!file) return err(404, `Session ${id} not found.`);
      const { session, messages } = await parseSession(file, { withMessages: true });
      const limit = Math.max(1, Math.min(5000, Number(q.limit) || 1000));
      return json({
        session,
        messageTotal: messages.length,
        messages: messages.slice(0, limit),
        todos: (await inv.todos()).find((t) => t.sessionId === session.id) || null,
      });
    }],

    ['GET', /^\/api\/sessions\/([\w.-]+)\/raw$/, async (req, q, [, id]) => {
      await scanSessions();
      const file = findSessionFile(id);
      if (!file) return err(404, `Session ${id} not found.`);
      const text = await fsp.readFile(file, 'utf8');
      return { status: 200, raw: text, headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'content-disposition': `attachment; filename="${id}.jsonl"` } };
    }],

    ['GET', /^\/api\/projects$/, async () => {
      const { all } = await sessionsFor({});
      return json({ projects: A.byProject(all) });
    }],

    ['GET', /^\/api\/inventory$/, async () => json({
      skills: await inv.skills(),
      commands: await inv.commands(),
      agents: await inv.agents(),
      plugins: await inv.plugins(),
      mcp: await inv.mcpServers(),
      hooks: await inv.hooks(),
      memory: await inv.memoryFiles(),
      todos: await inv.todos(),
    })],

    ['GET', /^\/api\/settings$/, async () => json(await inv.settings())],

    ['GET', /^\/api\/mods$/, async () => json({
      readOnly: ctx.readOnly,
      modsDir: mods.MODS_DIR,
      claudeHome: paths().home,
      settingsPath: paths().settings,
      mods: mods.list(),
    })],

    ['POST', /^\/api\/mods\/([\w-]+)\/(install|uninstall)$/, async (req, q, [, id, action]) => {
      const denied = guardWrite(req);
      if (denied) return denied;
      try {
        const result = action === 'install' ? await mods.install(id) : await mods.uninstall(id);
        return json({ ok: true, action, ...result, mods: mods.list() });
      } catch (e) {
        return err(400, e.message);
      }
    }],

    ['GET', /^\/api\/events$/, async (req, q) => json({
      events: mods.recentEvents({ limit: Math.min(1000, Number(q.limit) || 200) }),
      logPath: mods.eventLogPath(),
      loggerInstalled: mods.list().find((m) => m.id === 'event-logger')?.status.installed ?? false,
    })],

    ['GET', /^\/api\/pricing$/, async () => json({ pricing: pricingTable(), defaults: DEFAULT_PRICING, path: path.join(paths().dashboardState, 'pricing.json') })],

    ['PUT', /^\/api\/pricing$/, async (req) => {
      const denied = guardWrite(req);
      if (denied) return denied;
      const body = req.jsonBody;
      if (!body || typeof body !== 'object') return err(400, 'Expected a JSON object of { pattern: { input, output, cacheWrite, cacheRead } }.');
      const file = path.join(paths().dashboardState, 'pricing.json');
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await fsp.writeFile(file, JSON.stringify(body, null, 2));
      resetPricingCache();
      invalidate();
      return json({ ok: true, path: file, pricing: pricingTable() });
    }],

    ['POST', /^\/api\/refresh$/, async (req) => {
      const denied = guardWrite(req);
      if (denied) return denied;
      invalidate();
      resetPricingCache();
      const { sessions } = await scanSessions({ force: true });
      return json({ ok: true, sessions: sessions.length });
    }],

    ['GET', /^\/api\/export$/, async (req, q) => {
      const win = queryWindow(q);
      const { filtered } = await sessionsFor(win);
      if ((q.format || 'json') === 'csv') {
        const head = ['id', 'startedAt', 'endedAt', 'project', 'gitBranch', 'messages', 'toolCalls', 'inputTokens', 'outputTokens', 'cacheWrite', 'cacheRead', 'totalTokens', 'costUsd', 'models', 'title'];
        const rows = filtered.map((s) => [
          s.id, s.startedAt, s.endedAt, s.project, s.gitBranch || '', s.messageCount, s.toolCalls,
          s.usage.input, s.usage.output, s.usage.cacheWrite, s.usage.cacheRead, s.totalTokens,
          s.cost.toFixed(6), Object.keys(s.models).join('|'), (s.title || '').replace(/\s+/g, ' '),
        ]);
        const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
        return { status: 200, raw: csv, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="claude-usage.csv"' } };
      }
      return { status: 200, raw: JSON.stringify({ exportedAt: new Date().toISOString(), window: win, summary: A.summarise(filtered), sessions: filtered }, null, 2),
        headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="claude-usage.json"' } };
    }],
  ];
}

const sorters = {
  recent: (a, b) => (b.endedAt || '').localeCompare(a.endedAt || ''),
  oldest: (a, b) => (a.startedAt || '').localeCompare(b.startedAt || ''),
  cost: (a, b) => b.cost - a.cost,
  tokens: (a, b) => b.totalTokens - a.totalTokens,
  messages: (a, b) => b.messageCount - a.messageCount,
  duration: (a, b) => b.durationMs - a.durationMs,
};

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function slim(s) {
  return {
    id: s.id, title: s.title, project: s.project, projectSlug: s.projectSlug, cwd: s.cwd,
    gitBranch: s.gitBranch, version: s.version, startedAt: s.startedAt, endedAt: s.endedAt,
    messageCount: s.messageCount, userMessages: s.userMessages, assistantMessages: s.assistantMessages,
    toolCalls: s.toolCalls, models: s.models, tools: s.tools, usage: s.usage,
    totalTokens: s.totalTokens, cost: s.cost, errors: s.errors, durationMs: s.durationMs,
    sizeBytes: s.sizeBytes,
  };
}
