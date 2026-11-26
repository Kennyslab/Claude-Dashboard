#!/usr/bin/env node
/**
 * claude-dashboard CLI
 *
 *   claude-dashboard                       start the dashboard and open a browser
 *   claude-dashboard mods list             show every mod and whether it is active
 *   claude-dashboard mods install <id>     install a mod
 *   claude-dashboard mods remove <id>      remove a mod
 *   claude-dashboard stats [--days 30]     print a summary in the terminal
 *   claude-dashboard export --format csv   write a usage export to stdout
 *   claude-dashboard doctor                check the installation
 *   claude-dashboard demo --home DIR       generate synthetic data to try the UI
 */
import { execFile } from 'node:child_process';
import process from 'node:process';
import { listen, randomToken } from '../src/server.js';

const argv = process.argv.slice(2);

function parseArgs(args) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { out._.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=');
      const next = args[i + 1];
      if (inline !== undefined) out.flags[k] = inline;
      else if (next && !next.startsWith('-')) { out.flags[k] = next; i++; }
      else out.flags[k] = true;
    } else if (a.startsWith('-') && a.length > 1) {
      const map = { p: 'port', h: 'help', v: 'version', H: 'host', d: 'days' };
      const k = map[a.slice(1)] || a.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) { out.flags[k] = next; i++; } else out.flags[k] = true;
    } else out._.push(a);
  }
  return out;
}

const { _: positional, flags } = parseArgs(argv);
const C = process.env.NO_COLOR ? new Proxy({}, { get: () => (s) => s }) : {
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  g: (s) => `\x1b[38;5;114m${s}\x1b[0m`,
  r: (s) => `\x1b[38;5;203m${s}\x1b[0m`,
  y: (s) => `\x1b[38;5;215m${s}\x1b[0m`,
  v: (s) => `\x1b[38;5;141m${s}\x1b[0m`,
};

if (flags.home) process.env.CLAUDE_DASHBOARD_HOME = String(flags.home);

const HELP = `
${C.b('claude-dashboard')} ${C.dim('— analytics, session explorer and mod manager for Claude Code')}

${C.b('USAGE')}
  claude-dashboard [command] [options]

${C.b('COMMANDS')}
  ${C.b('serve')}                    Start the dashboard (default command)
  ${C.b('mods list')}                List every mod and whether it is installed
  ${C.b('mods install <id>')}        Install a mod into ~/.claude
  ${C.b('mods remove <id>')}         Remove a mod and undo its settings changes
  ${C.b('stats')}                    Print a usage summary in the terminal
  ${C.b('export')}                   Write a usage export to stdout
  ${C.b('doctor')}                   Diagnose the installation
  ${C.b('demo')}                     Generate synthetic data for a test drive

${C.b('OPTIONS')}
  -p, --port <n>           Port to listen on                      ${C.dim('(default 7878)')}
  -H, --host <addr>        Address to bind                        ${C.dim('(default 127.0.0.1)')}
      --home <dir>         Use a different Claude home            ${C.dim('(default ~/.claude)')}
      --token [secret]     Require a token; omit the value to generate one
      --read-only          Refuse every mutating API request
      --no-open            Do not open a browser
      --poll <ms>          Filesystem poll interval               ${C.dim('(default 2500)')}
      --days <n>           Window for stats/export                ${C.dim('(default 30)')}
      --format <fmt>       json | csv                             ${C.dim('(export only)')}
      --insecure           Allow a non-loopback bind with no token
  -v, --version            Print the version
  -h, --help               Show this help

${C.b('EXAMPLES')}
  claude-dashboard                                 ${C.dim('# open the dashboard')}
  claude-dashboard --port 9000 --read-only         ${C.dim('# safe to share on a pairing session')}
  claude-dashboard mods install statusline-pro     ${C.dim('# rich status line')}
  claude-dashboard stats --days 7                  ${C.dim('# last week in the terminal')}
  claude-dashboard export --format csv > use.csv   ${C.dim('# spreadsheet export')}
  claude-dashboard demo --home /tmp/claude-demo    ${C.dim('# try it with fake data')}
`;

const fmtMoney = (n) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;
const fmtTokens = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  execFile(cmd[0], cmd[1], () => {});
}

async function cmdServe() {
  const token = flags.token === true ? randomToken() : (typeof flags.token === 'string' ? flags.token : null);
  const { url, port, host } = await listen({
    port: Number(flags.port) || Number(process.env.CLAUDE_DASHBOARD_PORT) || 7878,
    host: String(flags.host || '127.0.0.1'),
    readOnly: !!flags['read-only'],
    insecure: !!flags.insecure,
    pollMs: Number(flags.poll) || 2500,
    token,
  });
  const { paths } = await import('../src/lib/paths.js');
  process.stdout.write(
    `\n  ${C.v('◆')} ${C.b('Claude Dashboard')}\n` +
    `    ${C.dim('url   ')} ${C.g(url)}\n` +
    `    ${C.dim('home  ')} ${paths().home}\n` +
    `    ${C.dim('bind  ')} ${host}:${port}${flags['read-only'] ? C.y('  (read-only)') : ''}\n` +
    `    ${C.dim('stop  ')} Ctrl+C\n\n`
  );
  if (!flags['no-open'] && flags.open !== false) openBrowser(url);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { process.stdout.write('\n  stopped\n'); process.exit(0); });
}

async function cmdMods() {
  const mods = await import('../src/lib/mods.js');
  const action = positional[1] || 'list';
  const id = positional[2];

  if (action === 'list') {
    const all = mods.list();
    const width = Math.max(...all.map((m) => m.id.length));
    process.stdout.write(`\n  ${C.b('Mods')} ${C.dim(`— ${mods.MODS_DIR}`)}\n\n`);
    for (const m of all) {
      const badge = m.status.installed ? C.g('● on ') : m.status.partial ? C.y('◐ part') : C.dim('○ off');
      process.stdout.write(`  ${badge}  ${C.b(m.id.padEnd(width))}  ${C.dim(m.category)}\n         ${m.summary}\n\n`);
    }
    process.stdout.write(`  ${C.dim('install with')} claude-dashboard mods install <id>\n\n`);
    return;
  }

  if (!id) { process.stderr.write(`  ${C.r('error')} missing mod id. Run "claude-dashboard mods list".\n`); process.exit(1); }

  if (action === 'install') {
    const r = await mods.install(id);
    process.stdout.write(`\n  ${C.g('installed')} ${C.b(r.name)}\n`);
    for (const c of r.changes) process.stdout.write(`    ${C.dim('·')} ${c.action} ${c.to || c.path || `${c.event}${c.matcher ? ` [${c.matcher}]` : ''}`}\n`);
    if (r.backup) process.stdout.write(`    ${C.dim('backup')} ${r.backup}\n`);
    process.stdout.write(`\n  ${C.y('note')} hook and status line changes apply to ${C.b('new')} Claude Code sessions.\n\n`);
    return;
  }

  if (action === 'remove' || action === 'uninstall') {
    const r = await mods.uninstall(id);
    process.stdout.write(`\n  ${C.g('removed')} ${C.b(r.name)}\n`);
    for (const c of r.changes) process.stdout.write(`    ${C.dim('·')} ${c.action} ${c.to || c.path || c.event || ''}\n`);
    if (r.backup) process.stdout.write(`    ${C.dim('backup')} ${r.backup}\n`);
    process.stdout.write('\n');
    return;
  }

  process.stderr.write(`  ${C.r('error')} unknown action "${action}". Use list, install or remove.\n`);
  process.exit(1);
}

async function cmdStats() {
  const { scanSessions } = await import('../src/lib/transcripts.js');
  const A = await import('../src/lib/analytics.js');
  const days = Number(flags.days) || 30;
  const { sessions, available } = await scanSessions();
  if (!available) { process.stderr.write(`  ${C.r('error')} no Claude Code history found. Looked in ${(await import('../src/lib/paths.js')).paths().projects}\n`); process.exit(1); }
  const win = A.filterSessions(sessions, { from: new Date(Date.now() - days * 86400000).toISOString() });
  const s = A.summarise(win);
  const all = A.summarise(sessions);
  const st = A.streaks(sessions);
  const f = A.costForecast(sessions);

  const row = (k, v) => `    ${C.dim(k.padEnd(20))} ${v}\n`;
  process.stdout.write(`\n  ${C.b(`Last ${days} days`)}\n`);
  process.stdout.write(row('sessions', s.sessions));
  process.stdout.write(row('messages', s.messages));
  process.stdout.write(row('tool calls', s.toolCalls));
  process.stdout.write(row('tokens', fmtTokens(s.totalTokens)));
  process.stdout.write(row('cost (est.)', C.y(fmtMoney(s.cost))));
  process.stdout.write(row('cache hit rate', `${(s.cacheHitRate * 100).toFixed(1)}%`));
  process.stdout.write(`\n  ${C.b('All time')}\n`);
  process.stdout.write(row('sessions', all.sessions));
  process.stdout.write(row('projects', all.projects));
  process.stdout.write(row('tokens', fmtTokens(all.totalTokens)));
  process.stdout.write(row('cost (est.)', C.y(fmtMoney(all.cost))));
  process.stdout.write(row('active days', `${st.activeDays}  ${C.dim(`streak ${st.current}, best ${st.longest}`)}`));
  process.stdout.write(row('projected / month', fmtMoney(f.projectedMonth)));

  if (all.models.length) {
    process.stdout.write(`\n  ${C.b('Models')}\n`);
    for (const m of all.models.slice(0, 6)) process.stdout.write(row(m.name, `${m.count} messages`));
  }
  if (all.tools.length) {
    process.stdout.write(`\n  ${C.b('Top tools')}\n`);
    for (const t of all.tools.slice(0, 8)) process.stdout.write(row(t.name, `${t.count}`));
  }
  process.stdout.write(`\n  ${C.dim('Costs are estimates derived from local transcripts, not billed amounts.')}\n\n`);
}

async function cmdExport() {
  const { scanSessions } = await import('../src/lib/transcripts.js');
  const A = await import('../src/lib/analytics.js');
  const days = Number(flags.days) || 30;
  const { sessions } = await scanSessions();
  const win = A.filterSessions(sessions, { from: new Date(Date.now() - days * 86400000).toISOString() });
  if ((flags.format || 'json') === 'csv') {
    const head = ['id', 'startedAt', 'endedAt', 'project', 'gitBranch', 'messages', 'toolCalls', 'inputTokens', 'outputTokens', 'cacheWrite', 'cacheRead', 'totalTokens', 'costUsd', 'models', 'title'];
    const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    process.stdout.write(head.join(',') + '\n');
    for (const s of win) {
      process.stdout.write([s.id, s.startedAt, s.endedAt, s.project, s.gitBranch || '', s.messageCount, s.toolCalls,
        s.usage.input, s.usage.output, s.usage.cacheWrite, s.usage.cacheRead, s.totalTokens, s.cost.toFixed(6),
        Object.keys(s.models).join('|'), (s.title || '').replace(/\s+/g, ' ')].map(cell).join(',') + '\n');
    }
    return;
  }
  process.stdout.write(JSON.stringify({ exportedAt: new Date().toISOString(), days, summary: A.summarise(win), sessions: win }, null, 2) + '\n');
}

async function cmdDoctor() {
  const { paths, exists } = await import('../src/lib/paths.js');
  const { scanSessions } = await import('../src/lib/transcripts.js');
  const mods = await import('../src/lib/mods.js');
  const inv = await import('../src/lib/inventory.js');
  const p = paths();
  const checks = [];
  const add = (ok, label, detail) => checks.push({ ok, label, detail });

  add(Number(process.versions.node.split('.')[0]) >= 18, `Node ${process.version}`, 'Node 18 or newer is required');
  add(exists(p.home), `Claude home at ${p.home}`, 'Not found — is Claude Code installed?');
  add(exists(p.projects), `Transcript directory`, `${p.projects} is missing; run a Claude Code session first`);
  const { sessions, available } = await scanSessions();
  add(available && sessions.length > 0, `${sessions.length} session(s) indexed`, 'No transcripts could be parsed');
  add(exists(p.settings), `settings.json`, 'No user settings file yet — mods will create one');

  let writable = false;
  try { const fs = await import('node:fs'); fs.accessSync(p.home, fs.constants.W_OK); writable = true; } catch {}
  add(writable, 'Claude home is writable', 'Mods cannot be installed without write access');

  const installed = mods.list().filter((m) => m.status.installed);
  add(true, `${installed.length} mod(s) installed`, '');
  const hooks = await inv.hooks();
  add(true, `${hooks.length} hook(s) configured`, '');

  process.stdout.write(`\n  ${C.b('claude-dashboard doctor')}\n\n`);
  let failed = 0;
  for (const c of checks) {
    process.stdout.write(`  ${c.ok ? C.g('✔') : C.r('✖')}  ${c.label}\n`);
    if (!c.ok && c.detail) { failed++; process.stdout.write(`     ${C.dim(c.detail)}\n`); }
  }
  if (installed.length) process.stdout.write(`\n  ${C.dim('active mods:')} ${installed.map((m) => m.id).join(', ')}\n`);
  process.stdout.write(`\n  ${failed ? C.y(`${failed} issue(s) found`) : C.g('everything looks good')}\n\n`);
  process.exit(failed ? 1 : 0);
}

async function cmdDemo() {
  const { generateDemoData } = await import('../src/lib/demo.js');
  const { paths } = await import('../src/lib/paths.js');
  const home = String(flags.home || '/tmp/claude-dashboard-demo');
  process.env.CLAUDE_DASHBOARD_HOME = home;
  const r = generateDemoData(home, { sessions: Number(flags.sessions) || 60, days: Number(flags.days) || 90 });
  process.stdout.write(`\n  ${C.g('generated')} ${r.sessions} synthetic sessions in ${C.b(r.home)}\n`);
  process.stdout.write(`\n  Start the dashboard against it:\n    ${C.b(`claude-dashboard --home ${home}`)}\n\n`);
  void paths;
}

async function main() {
  if (flags.help || positional[0] === 'help') { process.stdout.write(HELP); return; }
  if (flags.version) {
    const { readJsonSafe } = await import('../src/lib/paths.js');
    const path = await import('node:path');
    const url = await import('node:url');
    const pkg = readJsonSafe(path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'package.json'), {});
    process.stdout.write(`${pkg.version || 'unknown'}\n`);
    return;
  }
  const cmd = positional[0] || 'serve';
  const table = { serve: cmdServe, mods: cmdMods, stats: cmdStats, export: cmdExport, doctor: cmdDoctor, demo: cmdDemo };
  const fn = table[cmd];
  if (!fn) { process.stderr.write(`  ${C.r('error')} unknown command "${cmd}"\n${HELP}`); process.exit(1); }
  await fn();
}

main().catch((e) => {
  process.stderr.write(`\n  ${C.r('error')} ${e.message}\n\n`);
  process.exit(1);
});
