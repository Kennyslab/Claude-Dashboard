# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-11-26

First release.

### Dashboard

- **Overview** — daily spend trace with token volume behind it, a six-reading gauge strip
  (tokens, cache hit rate, projected month, tool calls, streak, errors), cost split by model, a
  six-month activity heatmap, project ranking and hour-of-day distribution.
- **Sessions** — every transcript, sortable by cost, tokens, messages, duration or recency,
  filterable by project, branch or free text, with CSV export.
- **Session detail** — full transcript with tool calls, tool results, per-message token usage, the
  task list Claude kept, a token-split bar and a raw JSONL download.
- **Analytics** — per-model and per-project breakdowns, cache analysis, monthly and yearly
  forecasts, tool ranking and the most expensive days in the window.
- **Projects** — spend and volume grouped by working directory.
- **Live monitor** — hook events streamed over server-sent events, plus the session in progress.
- **Toolkit** — inventory of skills, slash commands, subagents, MCP servers, hooks, plugins, memory
  files and task lists.
- **Settings** — editable price table, configuration file inspector, effective settings, exports.
- Dark and light themes, command palette, keyboard shortcuts, responsive down to mobile, reduced
  motion respected.

### Mods

- `statusline-pro`, `event-logger`, `guard-bash`, `protect-secrets`, `auto-format`, `notify`,
  `commands` (`/dashboard`, `/cost-report`, `/session-summary`, `/mods`) and `analyst-agent`.
- Declarative manifests, timestamped backups before any settings write, atomic writes, idempotent
  installs and precise uninstalls.

### CLI

- `serve`, `mods list|install|remove`, `stats`, `export`, `doctor`, `demo`.

### Engineering

- Zero runtime dependencies; no build step.
- Incremental transcript indexing keyed on file size and mtime.
- Usage de-duplicated by request id so cached turns are not double counted.
- Cost computed per token class, so cache reads and writes are priced correctly.
- Loopback-only by default; mutating endpoints gated behind a custom header; `--read-only` mode.
- 17 tests running against synthetic data in a temporary directory.
