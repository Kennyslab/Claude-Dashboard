/**
 * Mod manager.
 *
 * A "mod" is a declarative bundle of file copies plus settings patches that
 * extends Claude Code itself: a status line, hooks, slash commands, subagents.
 * Every write is additive and reversible:
 *
 *  - `settings.json` is copied to `settings.json.bak-<timestamp>` before any change
 *  - installed state is tracked in `~/.claude/dashboard/mods.json`
 *  - uninstall removes exactly the hooks and keys this tool added, by matching
 *    the marker path `dashboard/mods/` rather than by position
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths, readJsonSafe } from './paths.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MODS_DIR = path.resolve(here, '..', '..', 'mods');
const MARKER = 'dashboard/mods/';

export function registry() {
  const reg = readJsonSafe(path.join(MODS_DIR, 'registry.json'), null);
  if (!reg) throw new Error(`Mod registry not found at ${MODS_DIR}/registry.json`);
  return reg;
}

function stateFile() { return path.join(paths().dashboardState, 'mods.json'); }

export function installedState() {
  return readJsonSafe(stateFile(), { mods: {} }) || { mods: {} };
}

function writeState(state) {
  const file = stateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function expand(str) {
  return String(str).replaceAll('{{HOME}}', paths().home.replace(/\\/g, '/'));
}

/** Copy settings.json aside before mutating it. Returns the backup path. */
export function backupSettings() {
  const target = paths().settings;
  if (!fs.existsSync(target)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${target}.bak-${stamp}`;
  fs.copyFileSync(target, backup);
  return backup;
}

function readSettings() {
  return readJsonSafe(paths().settings, {}) || {};
}

/** Atomic write: temp file then rename, so a crash cannot truncate settings. */
function writeSettings(obj) {
  const target = paths().settings;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, target);
}

function setDeep(obj, dotted, value) {
  const keys = dotted.split('.');
  let node = obj;
  while (keys.length > 1) {
    const k = keys.shift();
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
    node = node[k];
  }
  node[keys[0]] = value;
}

function deleteDeep(obj, dotted) {
  const keys = dotted.split('.');
  let node = obj;
  while (keys.length > 1) {
    const k = keys.shift();
    if (typeof node?.[k] !== 'object') return;
    node = node[k];
  }
  delete node[keys[0]];
}

function addHook(settings, { event, matcher, command }) {
  settings.hooks ||= {};
  settings.hooks[event] ||= [];
  const list = settings.hooks[event];
  const want = matcher ?? undefined;
  let group = list.find((g) => (g.matcher ?? undefined) === want);
  if (!group) { group = want === undefined ? { hooks: [] } : { matcher: want, hooks: [] }; list.push(group); }
  group.hooks ||= [];
  if (group.hooks.some((h) => h.command === command)) return false;
  group.hooks.push({ type: 'command', command });
  return true;
}

function removeHooksMatching(settings, predicate) {
  let removed = 0;
  for (const [event, groups] of Object.entries(settings.hooks || {})) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const before = (group.hooks || []).length;
      group.hooks = (group.hooks || []).filter((h) => !predicate(h, event, group));
      removed += before - group.hooks.length;
    }
    settings.hooks[event] = groups.filter((g) => (g.hooks || []).length > 0);
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  return removed;
}

export function findMod(id) {
  const mod = registry().mods.find((m) => m.id === id);
  if (!mod) throw new Error(`Unknown mod "${id}". Run "claude-dashboard mods list" to see the available ids.`);
  return mod;
}

/** Decide whether a mod is currently active by inspecting the real settings. */
export function status(mod, settings = readSettings()) {
  const state = installedState();
  const files = [];
  // A mod is "active" based on the hooks and settings keys it binds, because
  // its payload files can be shared with other mods. File-only mods (slash
  // commands, subagents) are judged by their files instead.
  const bindings = mod.install.filter((s) => s.type === 'hook' || s.type === 'settings');
  let present = 0;
  let expected = 0;

  for (const step of mod.install) {
    if (step.type !== 'copy') continue;
    const abs = path.join(paths().home, step.to);
    const ok = fs.existsSync(abs);
    files.push({ path: abs, present: ok, shared: step.to.endsWith('_hooklib.js') });
    if (!bindings.length) { expected++; if (ok) present++; }
  }

  for (const step of bindings) {
    expected++;
    if (step.type === 'hook') {
      const cmd = expand(step.command);
      const found = Object.values(settings.hooks || {}).some((groups) =>
        [].concat(groups).some((g) => (g.hooks || []).some((h) => h.command === cmd)));
      if (found) present++;
    } else {
      const current = step.path.split('.').reduce((o, k) => (o ? o[k] : undefined), settings);
      if (current !== undefined) present++;
    }
  }

  const payloadReady = files.every((f) => f.present);
  return {
    installed: expected > 0 && present === expected && payloadReady,
    partial: present > 0 && !(present === expected && payloadReady),
    steps: { present, expected },
    files,
    installedAt: state.mods?.[mod.id]?.installedAt || null,
  };
}

export function list() {
  const settings = readSettings();
  return registry().mods.map((m) => ({ ...m, status: status(m, settings) }));
}

export async function install(id) {
  const mod = findMod(id);
  const home = paths().home;
  const changes = [];
  let settings = readSettings();
  let backup = null;
  const needsSettings = mod.install.some((s) => s.type === 'hook' || s.type === 'settings');
  if (needsSettings) backup = backupSettings();

  for (const step of mod.install) {
    if (step.type === 'copy') {
      const from = path.join(MODS_DIR, step.from);
      const to = path.join(home, step.to);
      await fsp.mkdir(path.dirname(to), { recursive: true });
      await fsp.copyFile(from, to);
      if (step.mode) await fsp.chmod(to, step.mode);
      changes.push({ action: 'copy', to });
    } else if (step.type === 'hook') {
      const cmd = expand(step.command);
      if (addHook(settings, { event: step.event, matcher: step.matcher, command: cmd })) {
        changes.push({ action: 'hook', event: step.event, matcher: step.matcher ?? '*' });
      }
    } else if (step.type === 'settings') {
      const value = JSON.parse(expand(JSON.stringify(step.value)));
      setDeep(settings, step.path, value);
      changes.push({ action: 'settings', path: step.path });
    }
  }

  if (needsSettings) writeSettings(settings);
  const state = installedState();
  state.mods[mod.id] = { installedAt: new Date().toISOString(), version: registry().version, changes };
  writeState(state);

  return { id: mod.id, name: mod.name, changes, backup, settingsPath: paths().settings };
}

export async function uninstall(id, { keepFiles = false } = {}) {
  const mod = findMod(id);
  const home = paths().home;
  const changes = [];
  const settings = readSettings();
  const needsSettings = mod.install.some((s) => s.type === 'hook' || s.type === 'settings');
  const backup = needsSettings ? backupSettings() : null;

  for (const step of mod.install) {
    if (step.type === 'hook') {
      const cmd = expand(step.command);
      const n = removeHooksMatching(settings, (h) => h.command === cmd);
      if (n) changes.push({ action: 'unhook', event: step.event, count: n });
    } else if (step.type === 'settings') {
      const current = step.path.split('.').reduce((o, k) => (o ? o[k] : undefined), settings);
      const ours = JSON.stringify(current || '').includes(MARKER);
      if (ours) { deleteDeep(settings, step.path); changes.push({ action: 'unset', path: step.path }); }
    }
  }
  if (needsSettings) writeSettings(settings);

  if (!keepFiles) {
    for (const step of mod.install) {
      if (step.type !== 'copy') continue;
      // _hooklib.js is shared; only remove it once nothing else needs it.
      if (step.to.endsWith('_hooklib.js') && stillNeeded(mod.id)) continue;
      const to = path.join(home, step.to);
      try { await fsp.unlink(to); changes.push({ action: 'remove', to }); } catch { /* already gone */ }
    }
  }

  const state = installedState();
  delete state.mods[mod.id];
  writeState(state);
  return { id: mod.id, name: mod.name, changes, backup };
}

function stillNeeded(excludeId) {
  const settings = readSettings();
  return registry().mods.some((m) => m.id !== excludeId
    && m.install.some((s) => s.type === 'copy' && s.to.endsWith('_hooklib.js'))
    && status(m, settings).installed);
}

/** Recent entries from the event stream written by the event-logger mod. */
export function recentEvents({ limit = 200 } = {}) {
  const file = path.join(paths().dashboardState, 'events.jsonl');
  try {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).reverse();
  } catch { return []; }
}

export function eventLogPath() {
  return path.join(paths().dashboardState, 'events.jsonl');
}
