/**
 * Shared helpers for claude-dashboard hooks.
 *
 * Hook contract used here:
 *   stdin  -> JSON payload describing the event
 *   stdout -> optional JSON response understood by Claude Code
 *   exit 0 -> allow, exit 2 -> block (stderr is shown to the model)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function input() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

export function claudeHome() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

export function allow(extra = {}) {
  if (Object.keys(extra).length) process.stdout.write(JSON.stringify(extra));
  process.exit(0);
}

export function block(reason) {
  process.stderr.write(reason);
  process.exit(2);
}

export function ask(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason },
  }));
  process.exit(0);
}

/** Append a JSON line to the dashboard event stream; never throws. */
export function emit(event) {
  try {
    const dir = path.join(claudeHome(), 'dashboard');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n');
  } catch { /* observability must never break a tool call */ }
}
