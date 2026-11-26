# API reference

Base URL `http://127.0.0.1:7878`. Everything returns JSON unless noted.

Read endpoints are plain `GET`s. Mutating endpoints require the header `X-Claude-Dashboard: 1`, which
a cross-origin page cannot set without a preflight the server does not grant, and are refused
entirely when the server runs with `--read-only`.

When the server was started with `--token`, every request needs the token as `?token=…`, as the
header `X-Dashboard-Token`, or as the `dashboard_token` cookie set on first visit.

---

## Conventions

A usage object always has these four keys:

```json
{ "input": 1234, "output": 567, "cacheWrite": 8910, "cacheRead": 112233 }
```

All costs are USD, floating point, estimated from the price table. All timestamps are ISO 8601.

Errors are returned with the matching status and a single field:

```json
{ "error": "Session 0d3f not found." }
```

---

## `GET /api/health`

Liveness and server facts. Cheap enough to poll.

```json
{
  "ok": true,
  "version": "1.0.0",
  "readOnly": false,
  "claudeHome": "/Users/you/.claude",
  "startedAt": "2026-11-26T09:12:04.188Z",
  "uptimeSec": 842
}
```

---

## `GET /api/overview`

Everything the Overview page draws, in one request.

| Parameter | Default | Meaning |
|---|---|---|
| `days` | `30` | Window for the `window` and `timeline` fields. |

```json
{
  "available": true,
  "claudeHome": "/Users/you/.claude",
  "allTime":  { "sessions": 412, "projects": 9, "messages": 11204, "toolCalls": 5831,
                "errors": 3, "cost": 184.22, "usage": {…}, "totalTokens": 412000000,
                "cacheHitRate": 0.91, "models": [{ "name": "claude-opus-5", "count": 820 }],
                "tools":  [{ "name": "Read", "count": 1902 }] },
  "window":   { "days": 30, "…": "same shape as allTime" },
  "timeline": [{ "key": "2026-11-01", "sessions": 4, "messages": 96, "toolCalls": 51,
                 "cost": 2.18, "usage": {…}, "totalTokens": 5120000 }],
  "heatmap":  [{ "date": "2026-05-31", "weekday": 0, "sessions": 2, "messages": 44,
                 "cost": 0.91, "tokens": 2200000 }],
  "streaks":  { "activeDays": 118, "longest": 21, "current": 4 },
  "forecast": { "last30Days": 42.10, "perActiveDay": 2.10, "projectedMonth": 42.7,
                "projectedYear": 512.2 },
  "topProjects": [{ "key": "/Users/you/src/api", "sessions": 61, "cost": 38.4, "…": "…" }],
  "models":   [{ "key": "claude-opus-5", "sessions": 94, "cost": 102.3, "…": "…" }],
  "hours":    [{ "hour": 0, "sessions": 2, "messages": 51 }],
  "recentSessions": [ "…session summaries…" ],
  "environment": { "claudeHome": "…", "node": "v22.11.0", "platform": "darwin" }
}
```

`available: false` means the transcript directory could not be read at all.

---

## `GET /api/analytics`

| Parameter | Default | Meaning |
|---|---|---|
| `days` | `30` | Window size. |
| `from`, `to` | derived | ISO timestamps; override `days`. |
| `project` | — | Exact project path. |
| `model` | — | Substring matched against model ids. |
| `search` | — | Free text over title, project, branch and id. |

Returns `window`, `summary`, `timeline`, `byProject`, `byModel`, `hours`, `heatmap`, `forecast` and
`tools`.

---

## `GET /api/sessions`

| Parameter | Default | Meaning |
|---|---|---|
| `limit` | `50` | 1–500. |
| `offset` | `0` | For paging. |
| `sort` | `recent` | `recent`, `oldest`, `cost`, `tokens`, `messages`, `duration`. |
| `project`, `model`, `search`, `from`, `to` | — | As above. |

```json
{
  "available": true,
  "total": 412,
  "offset": 0,
  "limit": 50,
  "sessions": [{
    "id": "6f869800-f6d3-49b1-a13a-184cb33a5f82",
    "title": "Fix the failing checkout integration test",
    "project": "/Users/you/src/api",
    "projectSlug": "-Users-you-src-api",
    "cwd": "/Users/you/src/api",
    "gitBranch": "fix/checkout",
    "version": "2.0.31",
    "startedAt": "2026-11-24T02:32:46.000Z",
    "endedAt":   "2026-11-24T02:45:27.000Z",
    "messageCount": 18, "userMessages": 9, "assistantMessages": 9,
    "toolCalls": 7,
    "models": { "claude-opus-5": 9 },
    "tools":  { "Read": 3, "Edit": 2, "Bash": 2 },
    "usage":  { "input": 1900, "output": 5600, "cacheWrite": 24700, "cacheRead": 192400 },
    "totalTokens": 224600,
    "cost": 1.2043,
    "errors": 0,
    "durationMs": 761000,
    "sizeBytes": 8812
  }]
}
```

## `GET /api/sessions/:id`

One session with its messages.

| Parameter | Default | Meaning |
|---|---|---|
| `limit` | `1000` | Maximum messages returned, 1–5000. |

```json
{
  "session": { "…": "as above" },
  "messageTotal": 18,
  "messages": [{
    "uuid": "…", "parentUuid": "…",
    "role": "assistant",
    "timestamp": "2026-11-24T02:33:29.000Z",
    "model": "claude-opus-5",
    "text": "Working through that now.",
    "toolCalls": [{ "name": "Edit", "input": {…} }],
    "toolResult": { "preview": "…", "truncated": false, "bytes": 412 },
    "usage": { "input": 276, "output": 700, "cacheWrite": 15100, "cacheRead": 15100 },
    "isMeta": false,
    "isSidechain": false
  }],
  "todos": { "sessionId": "…", "total": 6, "completed": 5, "inProgress": 1, "pending": 0,
             "items": [{ "content": "…", "status": "completed" }] }
}
```

`404` if no session with that id is indexed.

## `GET /api/sessions/current`

The most recently updated session, with its last 40 messages. `404` when there are none.

## `GET /api/sessions/:id/raw`

The transcript as `application/x-ndjson`, with a download disposition.

---

## `GET /api/projects`

```json
{ "projects": [{ "key": "/Users/you/src/api", "sessions": 61, "messages": 1402,
                 "toolCalls": 806, "cost": 38.4, "usage": {…}, "totalTokens": 91000000 }] }
```

## `GET /api/inventory`

Skills, slash commands, subagents, plugins, MCP servers, hooks, memory files and task lists.

```json
{
  "skills":   [{ "name": "pdf", "description": "…", "source": "user", "file": "…", "lines": 88 }],
  "commands": [{ "name": "cost-report", "invoke": "/cost-report", "description": "…" }],
  "agents":   [{ "name": "dashboard-analyst", "model": "sonnet", "tools": "Bash, Read" }],
  "plugins":  [{ "name": "superpowers", "version": "1.4.0", "skills": 15 }],
  "mcp":      { "servers": [{ "name": "github", "transport": "stdio", "command": "npx",
                              "args": ["-y","@modelcontextprotocol/server-github"], "env": ["TOKEN"] }],
                "perProject": { "/Users/you/src/api": ["postgres"] } },
  "hooks":    [{ "event": "PreToolUse", "matcher": "Bash", "type": "command",
                 "command": "node \"…/guard-bash.js\"", "timeout": null }],
  "memory":   [{ "path": "…/CLAUDE.md", "bytes": 2048, "lines": 61, "preview": "…" }],
  "todos":    [{ "sessionId": "…", "total": 6, "completed": 5 }]
}
```

## `GET /api/settings`

File paths and existence, raw `settings.json`, raw `settings.local.json`, the merged `effective`
object, and an `account` summary read from `~/.claude.json`.

---

## `GET /api/mods`

```json
{
  "readOnly": false,
  "modsDir": "/usr/local/lib/node_modules/claude-dashboard/mods",
  "claudeHome": "/Users/you/.claude",
  "settingsPath": "/Users/you/.claude/settings.json",
  "mods": [{
    "id": "guard-bash", "name": "Bash Guard", "category": "safety",
    "summary": "…", "risk": "low",
    "install": [{ "type": "hook", "event": "PreToolUse", "matcher": "Bash", "command": "…" }],
    "status": { "installed": true, "partial": false,
                "steps": { "present": 1, "expected": 1 },
                "files": [{ "path": "…", "present": true, "shared": false }],
                "installedAt": "2026-11-26T09:40:11.000Z" }
  }]
}
```

## `POST /api/mods/:id/install`
## `POST /api/mods/:id/uninstall`

Requires `X-Claude-Dashboard: 1`. Refused with `403` in read-only mode, `400` for an unknown id.

```json
{
  "ok": true,
  "action": "install",
  "id": "guard-bash",
  "name": "Bash Guard",
  "changes": [{ "action": "copy", "to": "/Users/you/.claude/dashboard/mods/guard-bash.js" },
              { "action": "hook", "event": "PreToolUse", "matcher": "Bash" }],
  "backup": "/Users/you/.claude/settings.json.bak-2026-11-26T09-40-11-004Z",
  "settingsPath": "/Users/you/.claude/settings.json",
  "mods": [ "…the full list again, with updated status…" ]
}
```

---

## `GET /api/events`

Recent hook events, newest first. Needs the `event-logger` mod to produce anything.

| Parameter | Default |
|---|---|
| `limit` | `200`, max `1000` |

```json
{
  "events": [{ "ts": "2026-11-26T09:41:02.113Z", "kind": "event", "event": "PreToolUse",
               "session": "…", "cwd": "/Users/you/src/api", "tool": "Bash",
               "summary": "npm test", "ok": true }],
  "logPath": "/Users/you/.claude/dashboard/events.jsonl",
  "loggerInstalled": true
}
```

## `GET /api/stream`

Server-sent events. Three event types:

| Event | Payload | When |
|---|---|---|
| `hello` | `{ "at": "…" }` | On connect. |
| `data` | `{ "sessions": 412, "at": "…" }` | A transcript or settings file changed. |
| `hook` | one event-log record | A hook fired. |

```js
const es = new EventSource('/api/stream');
es.addEventListener('hook', (e) => console.log(JSON.parse(e.data)));
```

A comment ping is sent every 20 seconds so proxies do not close the connection.

---

## `GET /api/pricing` · `PUT /api/pricing`

`GET` returns the active table, the built-in defaults and the override file path.

`PUT` replaces the overrides and reindexes. Requires `X-Claude-Dashboard: 1`.

```bash
curl -X PUT http://127.0.0.1:7878/api/pricing \
  -H 'content-type: application/json' \
  -H 'x-claude-dashboard: 1' \
  -d '{"opus":{"input":15,"output":75,"cacheWrite":18.75,"cacheRead":1.5}}'
```

Keys are matched as substrings against the model id; the longest match wins. Unmatched models fall
back to the Sonnet rate.

## `POST /api/refresh`

Drops the index and price cache and rereads everything. Requires the header.

## `GET /api/export`

| Parameter | Default |
|---|---|
| `format` | `json`, or `csv` |
| `days`, `from`, `to`, `project`, `model`, `search` | as on `/api/analytics` |

CSV columns: `id, startedAt, endedAt, project, gitBranch, messages, toolCalls, inputTokens,
outputTokens, cacheWrite, cacheRead, totalTokens, costUsd, models, title`.

---

## Status codes

| Code | Meaning |
|---|---|
| `200` | Fine. |
| `400` | Bad input — unknown mod id, malformed JSON body. |
| `401` | Token required or wrong. |
| `403` | Read-only mode, or the `X-Claude-Dashboard` header is missing. |
| `404` | No such endpoint or session. |
| `405` | Wrong method for that path. |
| `500` | Something broke; the message is in `error` and the stack is on the server's stderr. |

---

## Using the API from a script

```bash
# Spend this month, as a number
curl -s 'http://127.0.0.1:7878/api/analytics?days=30' | jq '.summary.cost'

# The five most expensive sessions ever
curl -s 'http://127.0.0.1:7878/api/sessions?sort=cost&limit=5' \
  | jq -r '.sessions[] | "\(.cost|.*100|round/100)\t\(.title)"'

# Alert if cache efficiency drops below 50%
rate=$(curl -s 'http://127.0.0.1:7878/api/analytics?days=7' | jq '.summary.cacheHitRate')
awk -v r="$rate" 'BEGIN { if (r < 0.5) print "cache hit rate is only " r }'
```
