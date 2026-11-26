#!/usr/bin/env node
/**
 * claude-dashboard :: auto-format  (PostToolUse, matcher "Edit|Write|MultiEdit")
 *
 * Runs the project's own formatter on a file Claude just changed. A formatter
 * is only used when it is already resolvable, so this never installs anything
 * and silently does nothing in a project without one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { input, allow, emit } from './_hooklib.js';

const FORMATTERS = [
  { ext: /\.(js|jsx|ts|tsx|mjs|cjs|json|css|scss|less|html|md|yaml|yml|graphql)$/i, cmd: 'npx', args: ['--no-install', 'prettier', '--write'] },
  { ext: /\.py$/i, cmd: 'ruff', args: ['format'] },
  { ext: /\.py$/i, cmd: 'black', args: ['-q'] },
  { ext: /\.go$/i, cmd: 'gofmt', args: ['-w'] },
  { ext: /\.rs$/i, cmd: 'rustfmt', args: ['--edition', '2021'] },
  { ext: /\.(sh|bash)$/i, cmd: 'shfmt', args: ['-w'] },
  { ext: /\.(rb)$/i, cmd: 'rubocop', args: ['-a', '--no-color'] },
];

const d = input();
const file = d.tool_input?.file_path;
if (!file || !fs.existsSync(file)) allow();

const cwd = d.cwd || path.dirname(file);
for (const f of FORMATTERS) {
  if (!f.ext.test(file)) continue;
  try {
    execFileSync(f.cmd, [...f.args, file], { cwd, stdio: 'ignore', timeout: 20000 });
    emit({ kind: 'format.ok', session: d.session_id, formatter: f.cmd, file });
    allow({ systemMessage: `Formatted with ${f.cmd}.` });
  } catch { /* try the next candidate */ }
}
allow();
