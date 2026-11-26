#!/usr/bin/env node
/**
 * claude-dashboard :: event-logger  (any event)
 *
 * Writes a compact record of every hook event to
 * `~/.claude/dashboard/events.jsonl`, which is what the dashboard's Live
 * Monitor streams. Keeps the file bounded so it can run forever.
 */
import fs from 'node:fs';
import path from 'node:path';
import { input, allow, claudeHome } from './_hooklib.js';

const MAX_BYTES = 8 * 1024 * 1024;
const d = input();

const record = {
  ts: new Date().toISOString(),
  kind: 'event',
  event: d.hook_event_name || 'Unknown',
  session: d.session_id || null,
  cwd: d.cwd || null,
  tool: d.tool_name || null,
  summary: summarise(d),
  ok: d.tool_response?.success !== false,
};

function summarise(x) {
  const i = x.tool_input || {};
  if (i.command) return String(i.command).slice(0, 240);
  if (i.file_path) return String(i.file_path);
  if (i.pattern) return `pattern: ${i.pattern}`;
  if (i.prompt) return String(i.prompt).slice(0, 160);
  if (x.prompt) return String(x.prompt).slice(0, 160);
  if (x.message) return String(x.message).slice(0, 160);
  return null;
}

try {
  const dir = path.join(claudeHome(), 'dashboard');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'events.jsonl');
  try {
    if (fs.statSync(file).size > MAX_BYTES) {
      const keep = fs.readFileSync(file, 'utf8').split('\n').slice(-20000).join('\n');
      fs.writeFileSync(file, keep);
    }
  } catch { /* first run */ }
  fs.appendFileSync(file, JSON.stringify(record) + '\n');
} catch { /* never block on logging */ }

allow();
