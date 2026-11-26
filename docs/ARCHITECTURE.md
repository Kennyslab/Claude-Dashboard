# Architecture

## Shape of the thing

```
bin/claude-dashboard.js      CLI: serve, mods, stats, export, doctor, demo
src/
  server.js                  node:http server, static files, SSE
  api/routes.js              every endpoint, as [method, pattern, handler]
  lib/
    paths.js                 where Claude Code keeps things
    transcripts.js           JSONL → session summaries (the core)
    analytics.js             summaries → timelines, heatmaps, breakdowns
    pricing.js               token counts → dollars
    inventory.js             skills, hooks, MCP, agents, plugins, memory
    mods.js                  install / uninstall / status
    watcher.js               change detection and file tailing
    demo.js                  synthetic transcripts for testing
public/                      the interface: no build step, ES modules
mods/                        mod payloads + registry.json
```

## Decisions, and why

### Zero dependencies

The whole server is `node:http`, `node:fs` and `node:readline`. The frontend is ES modules served
straight from disk, with charts drawn as hand-written SVG.

A tool that reads your entire conversation history is exactly the wrong place for a hundred
transitive packages: there is nothing to audit but this repository, nothing to go stale, no lockfile
drift, and `npx claude-dashboard` starts in under a second because there is nothing to download.

The cost is writing our own charts and router. For a dashboard of this size that is a few hundred
lines, and it bought complete control over the colour encoding.

### Incremental indexing

```
scanSessions()
  for each ~/.claude/projects/*/*.jsonl
    if (size, mtime) unchanged since last scan → keep the cached summary
    else stream the file and reduce it to a summary
  drop cache entries whose files are gone
```

Transcripts are append-only and the active one is the only one that usually changes, so after the
first scan a refresh re-reads one file. Summaries are small; a thousand sessions is a few megabytes
of heap.

Files are read with `createReadStream` plus `readline` rather than `readFileSync`, because a long
session transcript can be tens of megabytes and the summary needs one pass, not the whole string.

### Defensive parsing

The transcript format has changed several times across Claude Code releases. Every field is read
with fallbacks (`input_tokens ?? inputTokens`), every line is individually `try`/`catch`ed, and an
unparseable line is skipped rather than failing the file. A session that cannot be read at all is
dropped from the index instead of taking the page down.

### De-duplicating usage

A single API request can appear on more than one transcript line. Naively summing every `usage`
object double-counts. The parser keys on `requestId` (falling back to the message id) and counts each
request once. This is the difference between a plausible number and a wrong one, and it is covered by
a test.

### Polling, not `fs.watch`

`fs.watch` is inconsistent across platforms for deep trees: no recursion on Linux, event coalescing
on macOS, different semantics on network filesystems. Instead a cheap fingerprint — file count, total
bytes, newest mtime across the transcript tree — is computed every 2.5 seconds, and clients are
notified only when it changes. It is a few milliseconds of `stat` calls and it behaves identically
everywhere.

The event log is different: it is one append-only file, so it is tailed properly by remembering the
byte offset and reading only what is new.

### Server-sent events, not WebSockets

Updates only flow server to client. SSE is a plain HTTP response, reconnects on its own, and needs no
handshake, no framing and no library on either side.

### Cost as a layer, not a constant

Prices change. Token counts do not. The parser records the four token classes and nothing else; cost
is computed on top from a table the user can replace. Changing a price and pressing Save recalculates
every figure in the product without re-reading a single transcript line.

### Rendering charts at true pixel width

An SVG with a fixed `viewBox` and `preserveAspectRatio="none"` scales text horizontally along with
the geometry, which makes axis labels look subtly wrong. Instead each chart observes its container
and rebuilds at the real pixel width, so a label is always drawn at its natural proportions.

---

## Request flow

```
browser ──GET /api/overview──▶ server.js
                                 │ match route
                                 ▼
                            routes.js
                                 │ scanSessions()
                                 ▼
                          transcripts.js ──▶ cached summaries
                                 │
                                 ▼
                           analytics.js ──▶ timeline, heatmap, breakdowns
                                 │
                                 ▼
                              JSON ──────▶ views/overview.js ──▶ charts.js
```

The frontend does no arithmetic over raw data. If a number is shown, a server module computed it, and
there is one place to fix it.

---

## The data Claude Code leaves behind

```
~/.claude/
├── projects/
│   └── -Users-you-src-api/          working directory, '/' replaced by '-'
│       └── <session-uuid>.jsonl     one JSON object per line
├── todos/<session>-agent-<id>.json  task lists
├── settings.json                    hooks, status line, model, permissions
├── skills/ commands/ agents/        what the CLI can do
├── plugins/                         bundles of the above
└── CLAUDE.md                        global memory
~/.claude.json                       account, per-project config, MCP servers
```

### A transcript line

```jsonc
{
  "type": "assistant",
  "uuid": "…", "parentUuid": "…",
  "sessionId": "…", "requestId": "req_…",
  "timestamp": "2026-11-24T02:33:29.000Z",
  "cwd": "/Users/you/src/api",
  "gitBranch": "fix/checkout",
  "version": "2.0.31",
  "message": {
    "id": "msg_…", "role": "assistant", "model": "claude-opus-5",
    "content": [
      { "type": "text", "text": "Working through that now." },
      { "type": "tool_use", "id": "…", "name": "Edit", "input": { } }
    ],
    "usage": {
      "input_tokens": 276,
      "cache_creation_input_tokens": 15100,
      "cache_read_input_tokens": 15100,
      "output_tokens": 700
    }
  }
}
```

`type` is `user`, `assistant` or `summary`. User lines carry either a string or an array of content
blocks; an array of nothing but `tool_result` blocks is a tool-result turn rather than something a
person typed, which is why it is excluded when picking a session title.

---

## Performance

Measured on a 2023 laptop against 400 sessions, roughly 180 MB of transcripts:

| Operation | Time |
|---|---|
| First full index | ~1.1 s |
| Incremental rescan | ~15 ms |
| `/api/overview` | ~25 ms |
| `/api/sessions/:id` on a 40 MB transcript | ~380 ms |
| Fingerprint poll | ~4 ms |

Indexing runs 24 files in parallel, which saturates an SSD without exhausting file handles.

---

## Testing

`npm test` runs `node --test` against a temporary Claude home filled by the demo generator, so the
suite never reads or writes real history. It covers path decoding, price matching, cost arithmetic,
indexing, duplicate-request de-duplication, malformed-line tolerance, aggregation consistency, every
API endpoint, the write guard, path-traversal refusal, CSV shape, and the full mod install /
reinstall / uninstall cycle including backup creation.

---

## Things deliberately left out

| Not here | Why |
|---|---|
| A database | The transcripts are the database. A second copy would only go stale. |
| Authentication beyond a token | It binds loopback. Anything more is the job of a reverse proxy. |
| Editing transcripts | Read-only by design. Rewriting your own history would be a strange feature. |
| Calling the Anthropic API | Nothing here needs the network, and keeping it that way is the point. |
| A bundler | Nine ES modules served from disk. A build step would add a dependency and solve nothing. |
