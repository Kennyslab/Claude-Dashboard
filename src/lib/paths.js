/**
 * Filesystem layout discovery for Claude Code.
 *
 * Claude Code keeps all of its local state under a single home directory
 * (`~/.claude` by default, overridable via CLAUDE_CONFIG_DIR). This module is
 * the single source of truth for every path the dashboard touches, so that a
 * non-standard installation only has to be described in one place.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/** Resolve the Claude Code home directory. */
export function claudeHome() {
  const override = process.env.CLAUDE_DASHBOARD_HOME || process.env.CLAUDE_CONFIG_DIR;
  if (override) return path.resolve(expandTilde(override));
  return path.join(os.homedir(), '.claude');
}

export function expandTilde(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function paths() {
  const home = claudeHome();
  return {
    home,
    projects: path.join(home, 'projects'),
    todos: path.join(home, 'todos'),
    shellSnapshots: path.join(home, 'shell-snapshots'),
    statsig: path.join(home, 'statsig'),
    settings: path.join(home, 'settings.json'),
    localSettings: path.join(home, 'settings.local.json'),
    globalConfig: path.join(os.homedir(), '.claude.json'),
    claudeMd: path.join(home, 'CLAUDE.md'),
    skills: path.join(home, 'skills'),
    commands: path.join(home, 'commands'),
    agents: path.join(home, 'agents'),
    plugins: path.join(home, 'plugins'),
    hooks: path.join(home, 'hooks'),
    ide: path.join(home, 'ide'),
    history: path.join(home, 'history.jsonl'),
    dashboardState: path.join(home, 'dashboard'),
  };
}

/** Claude Code encodes a project's working directory into its folder name. */
export function decodeProjectSlug(slug) {
  // "-Users-ada-src-api" -> "/Users/ada/src/api"
  if (!slug) return '';
  if (/^[A-Za-z]--/.test(slug)) {
    // Windows style: "C--Users-ada-src"
    const drive = slug[0];
    return `${drive}:\\` + slug.slice(3).replace(/-/g, '\\');
  }
  return slug.replace(/^-/, '/').replace(/-/g, '/');
}

export function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

export function readJsonSafe(p, fallback = null) {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
