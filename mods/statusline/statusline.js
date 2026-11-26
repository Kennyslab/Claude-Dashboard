#!/usr/bin/env node
/**
 * claude-dashboard :: statusline-pro
 *
 * Claude Code pipes a JSON payload on stdin and renders whatever this script
 * prints on stdout as the status line. We show: model, directory, git branch,
 * live session cost, token burn and context pressure.
 *
 * Install with:  claude-dashboard mods install statusline-pro
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  blue: '\x1b[38;5;75m', violet: '\x1b[38;5;141m', green: '\x1b[38;5;114m',
  amber: '\x1b[38;5;215m', red: '\x1b[38;5;203m', grey: '\x1b[38;5;245m',
};
const NO_COLOR = !!process.env.NO_COLOR;
const c = (code, s) => (NO_COLOR ? s : `${code}${s}${C.reset}`);

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function gitBranch(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', timeout: 400,
    }).trim();
  } catch { return null; }
}

const RATES = {
  opus:   { i: 15, o: 75, cw: 18.75, cr: 1.5 },
  sonnet: { i: 3,  o: 15, cw: 3.75,  cr: 0.3 },
  haiku:  { i: 0.8, o: 4, cw: 1.0,   cr: 0.08 },
};
const rateFor = (m = '') => RATES[Object.keys(RATES).find((k) => m.toLowerCase().includes(k))] || RATES.sonnet;

/** Walk the transcript once and total up the usage reported by the API. */
function transcriptStats(file) {
  const out = { cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, lastContext: 0, turns: 0 };
  if (!file || !fs.existsSync(file)) return out;
  const seen = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const u = e?.message?.usage;
    if (!u) continue;
    const id = e.requestId || e.message?.id;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const r = rateFor(e.message?.model || '');
    const input = u.input_tokens || 0, output = u.output_tokens || 0;
    const cw = u.cache_creation_input_tokens || 0, cr = u.cache_read_input_tokens || 0;
    out.input += input; out.output += output; out.cacheWrite += cw; out.cacheRead += cr;
    out.cost += (input * r.i + output * r.o + cw * r.cw + cr * r.cr) / 1e6;
    out.lastContext = input + cr + cw;
    out.turns++;
  }
  return out;
}

const fmtTokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

function contextBar(used, limit) {
  const pct = Math.min(1, used / limit);
  const width = 10;
  const filled = Math.round(pct * width);
  const colour = pct > 0.85 ? C.red : pct > 0.6 ? C.amber : C.green;
  return c(colour, '█'.repeat(filled) + c(C.dim, '░'.repeat(width - filled))) + c(C.grey, ` ${Math.round(pct * 100)}%`);
}

const d = readStdin();
const cwd = d.workspace?.current_dir || d.cwd || process.cwd();
const modelName = d.model?.display_name || d.model?.id || 'claude';
const limit = Number(d.model?.context_window || process.env.CLAUDE_DASHBOARD_CONTEXT_LIMIT || 200000);
const stats = transcriptStats(d.transcript_path);
const branch = gitBranch(cwd);

const parts = [
  c(C.violet, `◆ ${modelName}`),
  c(C.blue, `${path.basename(cwd)}`),
  branch ? c(C.green, ` ${branch}`) : null,
  stats.turns ? c(C.grey, `⇅ ${fmtTokens(stats.input + stats.output + stats.cacheRead + stats.cacheWrite)}`) : null,
  stats.cost ? c(stats.cost > 5 ? C.red : C.amber, `$${stats.cost.toFixed(stats.cost < 1 ? 3 : 2)}`) : null,
  stats.lastContext ? contextBar(stats.lastContext, limit) : null,
  d.output_style?.name && d.output_style.name !== 'default' ? c(C.dim, d.output_style.name) : null,
].filter(Boolean);

process.stdout.write(parts.join(c(C.dim, ' │ ')));
