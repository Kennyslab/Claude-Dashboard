/**
 * Transcript indexing.
 *
 * Claude Code appends one JSON object per line to
 * `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`. The schema has
 * changed several times across releases, so every field is read defensively:
 * an unknown or malformed line is skipped rather than failing the index.
 *
 * Indexing is incremental. Each file's (size, mtime) is used as a cache key, so
 * a dashboard refresh only re-reads sessions that actually changed.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { paths, decodeProjectSlug } from './paths.js';
import { costOf } from './pricing.js';

const index = new Map();   // absolute file path -> summary
let lastScan = 0;

export function emptyUsage() {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
}

export function addUsage(target, src) {
  target.input += src.input || 0;
  target.output += src.output || 0;
  target.cacheWrite += src.cacheWrite || 0;
  target.cacheRead += src.cacheRead || 0;
  return target;
}

export function totalTokens(u) {
  return (u.input || 0) + (u.output || 0) + (u.cacheWrite || 0) + (u.cacheRead || 0);
}

function normaliseUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const u = {
    input: num(raw.input_tokens ?? raw.inputTokens),
    output: num(raw.output_tokens ?? raw.outputTokens),
    cacheWrite: num(raw.cache_creation_input_tokens ?? raw.cacheCreationInputTokens),
    cacheRead: num(raw.cache_read_input_tokens ?? raw.cacheReadInputTokens),
  };
  if (!u.input && !u.output && !u.cacheWrite && !u.cacheRead) return null;
  return u;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && (b.type === 'text' || typeof b.text === 'string'))
    .map((b) => b.text || '')
    .join('\n');
}

function toolCallsOf(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((b) => b && b.type === 'tool_use').map((b) => ({
    name: b.name || 'unknown',
    input: b.input,
  }));
}

/**
 * Parse a single transcript file into a session summary plus message list.
 * `withMessages` is false for index scans (cheap) and true for the detail view.
 */
export async function parseSession(file, { withMessages = false } = {}) {
  const stat = await fsp.stat(file);
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const session = {
    id: path.basename(file, '.jsonl'),
    file,
    project: null,
    projectSlug: path.basename(path.dirname(file)),
    cwd: null,
    gitBranch: null,
    version: null,
    title: null,
    summary: null,
    startedAt: null,
    endedAt: null,
    messageCount: 0,
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    tools: {},
    models: {},
    usage: emptyUsage(),
    cost: 0,
    errors: 0,
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
  };
  const messages = [];
  const seenRequests = new Set();
  let lineNo = 0;

  for await (const line of rl) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    let e;
    try { e = JSON.parse(trimmed); } catch { continue; }
    if (!e || typeof e !== 'object') continue;

    const ts = e.timestamp || e.ts || null;
    if (ts) {
      if (!session.startedAt || ts < session.startedAt) session.startedAt = ts;
      if (!session.endedAt || ts > session.endedAt) session.endedAt = ts;
    }
    if (e.cwd && !session.cwd) session.cwd = e.cwd;
    if (e.gitBranch && !session.gitBranch) session.gitBranch = e.gitBranch;
    if (e.version) session.version = e.version;

    if (e.type === 'summary' && typeof e.summary === 'string') {
      session.summary = e.summary;
      if (!session.title) session.title = e.summary;
      continue;
    }

    const msg = e.message;
    const role = e.type === 'user' || e.type === 'assistant' ? e.type : msg?.role;
    if (!role) continue;

    session.messageCount++;
    const body = msg?.content ?? e.content;
    const text = textOf(body);

    if (role === 'user') {
      session.userMessages++;
      const isMeta = e.isMeta === true || (Array.isArray(body) && body.every((b) => b?.type === 'tool_result'));
      if (!session.title && !isMeta && text) {
        session.title = text.replace(/\s+/g, ' ').slice(0, 120);
      }
    } else {
      session.assistantMessages++;
      const model = msg?.model || e.model;
      if (model) session.models[model] = (session.models[model] || 0) + 1;

      // Usage is reported per API request; a request id can repeat across
      // streamed chunks, so de-duplicate before accumulating.
      const usage = normaliseUsage(msg?.usage);
      const reqId = e.requestId || msg?.id || `${lineNo}`;
      if (usage && !seenRequests.has(reqId)) {
        seenRequests.add(reqId);
        addUsage(session.usage, usage);
        session.cost += costOf(usage, model);
      }
      for (const call of toolCallsOf(body)) {
        session.toolCalls++;
        session.tools[call.name] = (session.tools[call.name] || 0) + 1;
      }
    }

    if (e.isApiErrorMessage || e.level === 'error') session.errors++;

    if (withMessages) {
      messages.push({
        uuid: e.uuid || `${lineNo}`,
        parentUuid: e.parentUuid || null,
        role,
        timestamp: ts,
        model: msg?.model || null,
        text,
        toolCalls: toolCallsOf(body),
        toolResult: summariseToolResult(e.toolUseResult ?? (Array.isArray(body) ? body.find((b) => b?.type === 'tool_result') : null)),
        usage: normaliseUsage(msg?.usage),
        isMeta: e.isMeta === true,
        isSidechain: e.isSidechain === true,
      });
    }
  }

  session.project = decodeProjectSlug(session.projectSlug);
  if (!session.cwd) session.cwd = session.project;
  if (!session.title) session.title = `Session ${session.id.slice(0, 8)}`;
  session.totalTokens = totalTokens(session.usage);
  session.durationMs = session.startedAt && session.endedAt
    ? Math.max(0, new Date(session.endedAt) - new Date(session.startedAt))
    : 0;

  return withMessages ? { session, messages } : session;
}

function summariseToolResult(result) {
  if (!result) return null;
  const raw = typeof result === 'string' ? result : (result.content ?? result.stdout ?? result.output ?? JSON.stringify(result));
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return { preview: str.slice(0, 2000), truncated: str.length > 2000, bytes: str.length };
}

/** Walk every project folder and return cached-or-fresh session summaries. */
export async function scanSessions({ force = false } = {}) {
  const root = paths().projects;
  let projectDirs = [];
  try {
    projectDirs = (await fsp.readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => path.join(root, d.name));
  } catch {
    return { sessions: [], scannedAt: Date.now(), available: false };
  }

  const found = new Set();
  const tasks = [];
  for (const dir of projectDirs) {
    let files = [];
    try { files = await fsp.readdir(dir); } catch { continue; }
    for (const name of files) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(dir, name);
      found.add(file);
      tasks.push(file);
    }
  }

  const BATCH = 24;
  for (let i = 0; i < tasks.length; i += BATCH) {
    await Promise.all(tasks.slice(i, i + BATCH).map(async (file) => {
      try {
        const stat = await fsp.stat(file);
        const cached = index.get(file);
        if (!force && cached && cached.sizeBytes === stat.size && cached.mtimeMs === stat.mtimeMs) return;
        if (stat.size === 0) { index.delete(file); return; }
        index.set(file, await parseSession(file));
      } catch {
        index.delete(file);
      }
    }));
  }

  for (const key of index.keys()) if (!found.has(key)) index.delete(key);
  lastScan = Date.now();

  const sessions = [...index.values()].sort((a, b) => (b.endedAt || '').localeCompare(a.endedAt || ''));
  return { sessions, scannedAt: lastScan, available: true };
}

export function findSessionFile(id) {
  for (const [file, s] of index) if (s.id === id) return file;
  return null;
}

export function invalidate() { index.clear(); }
