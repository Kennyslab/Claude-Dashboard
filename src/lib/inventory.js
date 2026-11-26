/**
 * Configuration inventory.
 *
 * Reads the parts of a Claude Code installation that are configuration rather
 * than history: settings files, hooks, MCP servers, skills, slash commands,
 * subagents, plugins and the memory files. Everything is read-only here; writes
 * live in mods.js.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { paths, readJsonSafe, exists } from './paths.js';

async function listDir(dir, { ext = null, dirs = false } = {}) {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => (dirs ? e.isDirectory() : e.isFile()))
      .filter((e) => (ext ? e.name.endsWith(ext) : true))
      .map((e) => e.name);
  } catch { return []; }
}

/** Pull the YAML-ish frontmatter block out of a markdown file. */
export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    let v = kv[2].trim().replace(/^["']|["']$/g, '');
    out[kv[1]] = v;
  }
  return out;
}

async function readMarkdownMeta(file) {
  try {
    const text = await fsp.readFile(file, 'utf8');
    const fm = frontmatter(text);
    const body = text.replace(/^---[\s\S]*?---\r?\n?/, '').trim();
    return {
      name: fm.name || path.basename(file).replace(/\.md$/, ''),
      description: fm.description || body.split('\n').find((l) => l.trim())?.slice(0, 200) || '',
      model: fm.model || null,
      tools: fm.tools || fm['allowed-tools'] || null,
      file,
      bytes: Buffer.byteLength(text),
      lines: text.split('\n').length,
    };
  } catch { return null; }
}

export async function settings() {
  const p = paths();
  const global = readJsonSafe(p.settings, {}) || {};
  const local = readJsonSafe(p.localSettings, {}) || {};
  const cfg = readJsonSafe(p.globalConfig, {}) || {};
  return {
    files: {
      settings: { path: p.settings, exists: exists(p.settings) },
      localSettings: { path: p.localSettings, exists: exists(p.localSettings) },
      globalConfig: { path: p.globalConfig, exists: exists(p.globalConfig) },
    },
    settings: global,
    localSettings: local,
    effective: { ...global, ...local },
    account: {
      userId: cfg.userID || cfg.userId || null,
      numStartups: cfg.numStartups ?? null,
      installMethod: cfg.installMethod || null,
      version: cfg.version || null,
      theme: global.theme || cfg.theme || null,
      model: global.model || cfg.model || null,
      hasCompletedOnboarding: cfg.hasCompletedOnboarding ?? null,
    },
  };
}

export async function hooks() {
  const s = await settings();
  const defs = { ...(s.settings.hooks || {}), ...(s.localSettings.hooks || {}) };
  const out = [];
  for (const [event, matchers] of Object.entries(defs)) {
    for (const matcher of [].concat(matchers || [])) {
      for (const hook of [].concat(matcher.hooks || [])) {
        out.push({
          event,
          matcher: matcher.matcher ?? '*',
          type: hook.type || 'command',
          command: hook.command || '',
          timeout: hook.timeout ?? null,
        });
      }
    }
  }
  return out;
}

export async function mcpServers() {
  const p = paths();
  const cfg = readJsonSafe(p.globalConfig, {}) || {};
  const s = await settings();
  const merged = { ...(cfg.mcpServers || {}), ...(s.effective.mcpServers || {}) };
  const perProject = {};
  for (const [dir, entry] of Object.entries(cfg.projects || {})) {
    if (entry && entry.mcpServers && Object.keys(entry.mcpServers).length) perProject[dir] = Object.keys(entry.mcpServers);
  }
  return {
    servers: Object.entries(merged).map(([name, def]) => ({
      name,
      transport: def.type || (def.url ? 'http' : 'stdio'),
      command: def.command || null,
      args: def.args || [],
      url: def.url || null,
      env: Object.keys(def.env || {}),
      scope: 'user',
    })),
    perProject,
  };
}

export async function skills() {
  const p = paths();
  const out = [];
  for (const name of await listDir(p.skills, { dirs: true })) {
    const meta = await readMarkdownMeta(path.join(p.skills, name, 'SKILL.md'));
    out.push(meta ? { ...meta, name: meta.name || name, source: 'user' } : { name, description: '(no SKILL.md found)', source: 'user' });
  }
  for (const plugin of await listDir(p.plugins, { dirs: true })) {
    const dir = path.join(p.plugins, plugin, 'skills');
    for (const name of await listDir(dir, { dirs: true })) {
      const meta = await readMarkdownMeta(path.join(dir, name, 'SKILL.md'));
      if (meta) out.push({ ...meta, source: `plugin:${plugin}` });
    }
  }
  return out;
}

export async function commands() {
  const p = paths();
  const out = [];
  for (const name of await listDir(p.commands, { ext: '.md' })) {
    const meta = await readMarkdownMeta(path.join(p.commands, name));
    if (meta) out.push({ ...meta, invoke: `/${name.replace(/\.md$/, '')}`, source: 'user' });
  }
  return out;
}

export async function agents() {
  const p = paths();
  const out = [];
  for (const name of await listDir(p.agents, { ext: '.md' })) {
    const meta = await readMarkdownMeta(path.join(p.agents, name));
    if (meta) out.push({ ...meta, source: 'user' });
  }
  return out;
}

export async function plugins() {
  const p = paths();
  const out = [];
  for (const name of await listDir(p.plugins, { dirs: true })) {
    const manifest = readJsonSafe(path.join(p.plugins, name, 'plugin.json'), null)
      || readJsonSafe(path.join(p.plugins, name, '.claude-plugin', 'plugin.json'), null);
    out.push({
      name: manifest?.name || name,
      version: manifest?.version || null,
      description: manifest?.description || '',
      skills: (await listDir(path.join(p.plugins, name, 'skills'), { dirs: true })).length,
      commands: (await listDir(path.join(p.plugins, name, 'commands'), { ext: '.md' })).length,
      agents: (await listDir(path.join(p.plugins, name, 'agents'), { ext: '.md' })).length,
      dir: path.join(p.plugins, name),
    });
  }
  return out;
}

export async function memoryFiles() {
  const p = paths();
  const out = [];
  for (const file of [p.claudeMd, path.join(p.home, 'CLAUDE.local.md')]) {
    try {
      const text = await fsp.readFile(file, 'utf8');
      out.push({ path: file, bytes: Buffer.byteLength(text), lines: text.split('\n').length, preview: text.slice(0, 4000) });
    } catch { /* absent */ }
  }
  return out;
}

export async function todos() {
  const p = paths();
  const out = [];
  for (const name of await listDir(p.todos, { ext: '.json' })) {
    const items = readJsonSafe(path.join(p.todos, name), []) || [];
    if (!Array.isArray(items) || !items.length) continue;
    const sessionId = name.split('-agent-')[0].replace(/\.json$/, '');
    out.push({
      sessionId,
      file: path.join(p.todos, name),
      total: items.length,
      completed: items.filter((i) => i.status === 'completed').length,
      inProgress: items.filter((i) => i.status === 'in_progress').length,
      pending: items.filter((i) => i.status === 'pending').length,
      items: items.map((i) => ({ content: i.content || i.subject || '', status: i.status || 'pending', activeForm: i.activeForm || null })),
    });
  }
  return out.sort((a, b) => b.total - a.total);
}

export async function environment() {
  const p = paths();
  return {
    claudeHome: p.home,
    homeExists: exists(p.home),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    uptimeSec: Math.round(process.uptime()),
    dashboardVersion: readJsonSafe(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'package.json'), {})?.version || '1.0.0',
  };
}
