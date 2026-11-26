#!/usr/bin/env node
/**
 * claude-dashboard :: guard-bash  (PreToolUse, matcher "Bash")
 *
 * Refuses a short list of genuinely destructive shell patterns and asks for
 * confirmation on a second, merely risky list. Everything else passes through
 * untouched, so this is a safety net and not a permission system.
 */
import { input, block, ask, allow, emit } from './_hooklib.js';

const DENY = [
  { re: /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rR][a-zA-Z]*f|\brm\s+-fr?\b/, why: 'recursive force delete' },
  { re: /\brm\s+-[rfRF]{1,3}\s+\/(\s|$)/, why: 'delete of filesystem root' },
  { re: /\bmkfs(\.\w+)?\b/, why: 'filesystem format' },
  { re: /\bdd\b[^|;]*\bof=\/dev\/(sd|nvme|disk)/, why: 'raw write to a block device' },
  { re: />\s*\/dev\/(sd|nvme|disk)/, why: 'raw write to a block device' },
  { re: /\bchmod\s+(-R\s+)?777\s+\//, why: 'world-writable root' },
  { re: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, why: 'fork bomb' },
  { re: /\bgit\s+push\b[^|;]*--force(?!-with-lease)/, why: 'force push without lease' },
  { re: /\bhistory\s+-c\b|\btruncate\s+-s\s*0\s+.*\.bash_history/, why: 'shell history wipe' },
];

const CONFIRM = [
  { re: /\bgit\s+reset\s+--hard\b/, why: 'discards uncommitted work' },
  { re: /\bgit\s+clean\s+-[a-z]*f/, why: 'deletes untracked files' },
  { re: /\bnpm\s+publish\b|\bgh\s+release\s+create\b/, why: 'publishes a release' },
  { re: /\bdocker\s+(system\s+prune|volume\s+rm)/, why: 'removes container state' },
  { re: /\bkubectl\s+delete\b/, why: 'deletes cluster resources' },
  { re: /\bDROP\s+(TABLE|DATABASE)\b/i, why: 'destructive SQL' },
  { re: /\bsudo\b/, why: 'runs with elevated privileges' },
];

const d = input();
const cmd = String(d.tool_input?.command || '');
if (!cmd) allow();

const denied = DENY.find((r) => r.re.test(cmd));
if (denied) {
  emit({ kind: 'guard.block', session: d.session_id, tool: 'Bash', reason: denied.why, command: cmd.slice(0, 400) });
  block(`[claude-dashboard guard] Blocked: ${denied.why}.\nCommand: ${cmd.slice(0, 300)}\nIf this is intentional, run it yourself or disable the "guard-bash" mod.`);
}

const risky = CONFIRM.find((r) => r.re.test(cmd));
if (risky) {
  emit({ kind: 'guard.ask', session: d.session_id, tool: 'Bash', reason: risky.why, command: cmd.slice(0, 400) });
  ask(`claude-dashboard guard: this command ${risky.why}.`);
}

emit({ kind: 'tool.pre', session: d.session_id, tool: 'Bash', command: cmd.slice(0, 200) });
allow();
