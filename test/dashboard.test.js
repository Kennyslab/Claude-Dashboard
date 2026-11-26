/**
 * Smoke tests. Run with: npm test
 *
 * Every test works against a throwaway Claude home filled with synthetic
 * transcripts, so running the suite never touches real history.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-dashboard-test-'));
process.env.CLAUDE_DASHBOARD_HOME = HOME;

const { generateDemoData } = await import('../src/lib/demo.js');
const { scanSessions, parseSession, invalidate } = await import('../src/lib/transcripts.js');
const A = await import('../src/lib/analytics.js');
const { costOf, rateFor } = await import('../src/lib/pricing.js');
const mods = await import('../src/lib/mods.js');
const { listen } = await import('../src/server.js');
const { decodeProjectSlug } = await import('../src/lib/paths.js');

let server;
let base;

before(async () => {
  generateDemoData(HOME, { sessions: 12, days: 20 });
  invalidate();
  const started = await listen({ port: 0, host: '127.0.0.1' });
  server = started.server;
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server?.close(); fs.rmSync(HOME, { recursive: true, force: true }); });

test('project slugs decode back to paths', () => {
  assert.equal(decodeProjectSlug('-Users-ada-src-api'), '/Users/ada/src/api');
});

test('pricing picks the most specific model match', () => {
  assert.equal(rateFor('claude-opus-5').input, 15);
  assert.equal(rateFor('claude-haiku-5-5').input, 0.8);
  assert.equal(rateFor('something-unknown').input, 3, 'falls back to the sonnet rate');
});

test('cost counts cache reads and writes separately', () => {
  const cheap = costOf({ input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 0 }, 'sonnet');
  const dear = costOf({ input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }, 'sonnet');
  assert.ok(cheap < dear, 'a cached token must cost less than a fresh input token');
  assert.equal(Number(dear.toFixed(2)), 3);
});

test('scanning finds every generated session', async () => {
  const { sessions, available } = await scanSessions({ force: true });
  assert.equal(available, true);
  assert.equal(sessions.length, 12);
  for (const s of sessions) {
    assert.ok(s.messageCount > 0, 'session has messages');
    assert.ok(s.cost > 0, 'session has a cost');
    assert.ok(s.project.startsWith('/'), 'project decoded to a path');
  }
});

test('usage is not double counted across duplicate request ids', async () => {
  const file = path.join(HOME, 'projects', 'dupe-test', 'aaa.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const line = JSON.stringify({
    type: 'assistant', requestId: 'req_same', timestamp: new Date().toISOString(),
    message: { role: 'assistant', model: 'claude-sonnet-5-5', content: [], usage: { input_tokens: 100, output_tokens: 50 } },
  });
  fs.writeFileSync(file, `${line}\n${line}\n${line}\n`);
  const s = await parseSession(file);
  assert.equal(s.usage.input, 100, 'repeated request ids are counted once');
  fs.rmSync(path.dirname(file), { recursive: true });
  invalidate();
});

test('malformed lines are skipped rather than fatal', async () => {
  const file = path.join(HOME, 'projects', 'broken-test', 'bbb.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'not json\n{"type":"user","message":{"role":"user","content":"hi"}}\n{oops\n');
  const s = await parseSession(file);
  assert.equal(s.messageCount, 1);
  fs.rmSync(path.dirname(file), { recursive: true });
  invalidate();
});

test('analytics aggregate consistently', async () => {
  const { sessions } = await scanSessions({ force: true });
  const summary = A.summarise(sessions);
  const perProject = A.byProject(sessions);
  const sum = perProject.reduce((a, p) => a + p.cost, 0);
  assert.ok(Math.abs(sum - summary.cost) < 1e-6, 'project costs add up to the total');
  assert.equal(A.timeline(sessions, { days: 7 }).length, 7);
  assert.equal(A.hourHistogram(sessions).length, 24);
  assert.ok(A.streaks(sessions).activeDays > 0);
});

test('filters narrow the session set', async () => {
  const { sessions } = await scanSessions();
  const project = sessions[0].project;
  const filtered = A.filterSessions(sessions, { project });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((s) => s.project === project));
});

test('API serves the core endpoints', async () => {
  for (const ep of ['/api/health', '/api/overview', '/api/analytics', '/api/sessions', '/api/projects', '/api/inventory', '/api/mods', '/api/settings', '/api/events', '/api/pricing']) {
    const res = await fetch(base + ep);
    assert.equal(res.status, 200, `${ep} should answer 200`);
    await res.json();
  }
});

test('unknown API routes answer 404, not HTML', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /No such endpoint/);
});

test('mutating requests need the dashboard header', async () => {
  const res = await fetch(`${base}/api/mods/notify/install`, { method: 'POST' });
  assert.equal(res.status, 403);
});

test('static files are served and traversal is refused', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/css/app.css`)).status, 200);
  const esc = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
  assert.notEqual(esc.status, 200);
});

test('CSV export has a header row and one line per session', async () => {
  const res = await fetch(`${base}/api/export?format=csv&days=3650`);
  const text = await res.text();
  const lines = text.trim().split('\n');
  assert.match(lines[0], /^id,startedAt,endedAt,project/);
  assert.ok(lines.length > 1);
});

test('a mod installs, reports installed, and uninstalls cleanly', async () => {
  const before = mods.list().find((m) => m.id === 'guard-bash');
  assert.equal(before.status.installed, false);

  await mods.install('guard-bash');
  const after = mods.list().find((m) => m.id === 'guard-bash');
  assert.equal(after.status.installed, true);

  const settings = JSON.parse(fs.readFileSync(path.join(HOME, 'settings.json'), 'utf8'));
  const commands = Object.values(settings.hooks.PreToolUse).flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(commands.some((c) => c.includes('guard-bash.js')));

  await mods.uninstall('guard-bash');
  const gone = mods.list().find((m) => m.id === 'guard-bash');
  assert.equal(gone.status.installed, false);
  const restored = JSON.parse(fs.readFileSync(path.join(HOME, 'settings.json'), 'utf8'));
  assert.ok(!JSON.stringify(restored).includes('guard-bash.js'), 'the hook entry is gone');
});

test('installing twice does not duplicate the hook', async () => {
  await mods.install('guard-bash');
  await mods.install('guard-bash');
  const settings = JSON.parse(fs.readFileSync(path.join(HOME, 'settings.json'), 'utf8'));
  const commands = Object.values(settings.hooks.PreToolUse).flatMap((g) => g.hooks.map((h) => h.command));
  assert.equal(commands.filter((c) => c.includes('guard-bash.js')).length, 1);
  await mods.uninstall('guard-bash');
});

test('settings are backed up before a mod writes to them', async () => {
  await mods.install('notify');
  const backups = fs.readdirSync(HOME).filter((f) => f.startsWith('settings.json.bak-'));
  assert.ok(backups.length > 0);
  await mods.uninstall('notify');
});

test('the demo generator refuses to write into a real Claude home', () => {
  assert.throws(() => generateDemoData(path.join(os.tmpdir(), 'x', '.claude')), /Refusing to write demo data/);
});
