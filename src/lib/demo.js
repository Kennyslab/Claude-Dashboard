/**
 * Synthetic transcript generator.
 *
 * Writes realistic-looking JSONL transcripts into a throwaway Claude home so
 * the dashboard can be demonstrated, screenshotted and tested without touching
 * anybody's real history. Never writes into the default `~/.claude`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MODELS = ['claude-opus-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const TOOLS = ['Read', 'Edit', 'Bash', 'Grep', 'Glob', 'Write', 'WebSearch', 'Task', 'TodoWrite'];
const PROJECTS = ['/Users/dev/apps/payments-api', '/Users/dev/apps/web-console', '/Users/dev/infra/terraform', '/Users/dev/sandbox/claude-dashboard'];
const TITLES = [
  'Fix the failing checkout integration test',
  'Add rate limiting to the public API',
  'Migrate the billing schema to Postgres 16',
  'Refactor the auth middleware',
  'Investigate the memory leak in the worker pool',
  'Write the release notes for 2.4',
  'Add a dark theme to the console',
  'Trace why the nightly job times out',
  'Document the webhook retry policy',
  'Set up CI caching for the monorepo',
];

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const uuid = () => crypto.randomUUID();
const encode = (p) => p.replace(/\//g, '-');

export function generateDemoData(home, { sessions = 60, days = 90 } = {}) {
  if (/(^|[\\/])\.claude$/.test(home) && !process.env.CLAUDE_DASHBOARD_ALLOW_DEMO_IN_HOME) {
    throw new Error(`Refusing to write demo data into ${home}. Use --home /tmp/claude-demo instead.`);
  }
  const projectsRoot = path.join(home, 'projects');
  fs.mkdirSync(projectsRoot, { recursive: true });
  fs.mkdirSync(path.join(home, 'dashboard'), { recursive: true });

  let written = 0;
  for (let i = 0; i < sessions; i++) {
    const project = pick(PROJECTS);
    const dir = path.join(projectsRoot, encode(project));
    fs.mkdirSync(dir, { recursive: true });

    const id = uuid();
    const model = Math.random() < 0.25 ? MODELS[0] : Math.random() < 0.8 ? MODELS[1] : MODELS[2];
    const start = new Date(Date.now() - rand(days) * 86400000 - rand(12) * 3600000);
    const turns = 3 + rand(22);
    const lines = [];
    let cursor = new Date(start);
    let context = 12000 + rand(8000);

    lines.push(JSON.stringify({
      type: 'summary', summary: pick(TITLES), leafUuid: uuid(), timestamp: cursor.toISOString(),
    }));

    for (let t = 0; t < turns; t++) {
      cursor = new Date(cursor.getTime() + (8 + rand(120)) * 1000);
      lines.push(JSON.stringify({
        type: 'user', uuid: uuid(), sessionId: id, timestamp: cursor.toISOString(),
        cwd: project, gitBranch: pick(['main', 'feature/rate-limit', 'fix/checkout', 'chore/ci']),
        version: '2.0.31',
        message: { role: 'user', content: t === 0 ? pick(TITLES) : pick(['Keep going.', 'That broke the build — see the error above.', 'Looks good, now add a test.', 'Why did that change?']) },
      }));

      cursor = new Date(cursor.getTime() + (4 + rand(40)) * 1000);
      const toolCount = rand(3);
      const content = [{ type: 'text', text: 'Working through that now.' }];
      for (let k = 0; k < toolCount; k++) {
        content.push({ type: 'tool_use', id: uuid(), name: pick(TOOLS), input: { note: 'demo' } });
      }
      const output = 150 + rand(900);
      const cacheRead = context;
      const cacheWrite = t === 0 ? context : rand(2500);
      context += output + rand(1800);

      lines.push(JSON.stringify({
        type: 'assistant', uuid: uuid(), sessionId: id, requestId: `req_${uuid()}`,
        timestamp: cursor.toISOString(), cwd: project, version: '2.0.31',
        message: {
          id: `msg_${uuid()}`, role: 'assistant', model, type: 'message', content,
          usage: {
            input_tokens: 20 + rand(400),
            cache_creation_input_tokens: cacheWrite,
            cache_read_input_tokens: cacheRead,
            output_tokens: output,
            service_tier: 'standard',
          },
        },
      }));
    }

    fs.writeFileSync(path.join(dir, `${id}.jsonl`), lines.join('\n') + '\n');
    written++;
  }

  // A plausible settings file and a few hook events for the Live Monitor.
  const settingsPath = path.join(home, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify({ model: 'opus', theme: 'dark', includeCoAuthoredBy: false }, null, 2));
  }
  const events = [];
  for (let i = 0; i < 40; i++) {
    events.push(JSON.stringify({
      ts: new Date(Date.now() - i * 45000).toISOString(),
      kind: 'event', event: pick(['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop']),
      session: uuid(), tool: pick(TOOLS), cwd: pick(PROJECTS), summary: pick(['npm test', 'src/server.js', 'pattern: TODO', 'git status']), ok: Math.random() > 0.1,
    }));
  }
  fs.writeFileSync(path.join(home, 'dashboard', 'events.jsonl'), events.reverse().join('\n') + '\n');

  return { home, sessions: written };
}
