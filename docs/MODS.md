# Mods

A mod extends Claude Code itself. Each one is a short manifest in
[`mods/registry.json`](../mods/registry.json) describing files to copy and settings to add — nothing
is scripted, so you can read exactly what any mod will do before installing it.

```bash
claude-dashboard mods list
claude-dashboard mods install statusline-pro
claude-dashboard mods remove statusline-pro
```

Or from the Mods page in the interface, where **What it changes** prints the same manifest.

> Hooks and the status line are read when a Claude Code session starts. **Restart Claude Code** after
> installing or removing a mod.

---

## The mods

### `statusline-pro` — Statusline Pro

Replaces the status line with: model name, current directory, git branch, cumulative token burn for
the session, running cost, and a ten-cell bar showing how full the context window is. The bar turns
amber past 60% and coral past 85%.

Claude Code pipes a JSON payload to the script on stdin; the script walks the session transcript,
totals the reported usage and prints one line. It runs on every turn, so it is written to be cheap:
one file read, one short `git` call with a 400 ms timeout.

Sets `statusLine` in `settings.json`. Honours `NO_COLOR`.

### `event-logger` — Event Logger

Appends a compact record of every hook event to `~/.claude/dashboard/events.jsonl`. This is the file
the Live Monitor tails, so without this mod that page has nothing to show.

Binds to `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart` and `Stop`. The log is
trimmed to the last 20 000 lines once it passes 8 MB. Every write is wrapped so that a logging
failure can never block a tool call.

### `guard-bash` — Bash Guard

A `PreToolUse` hook on `Bash` with two lists.

**Blocked outright** (exit 2, Claude sees the reason and stops): recursive force deletes, deletes of
`/`, `mkfs`, raw writes to block devices, `chmod 777 /`, fork bombs, `git push --force` without
`--force-with-lease`, and shell-history wipes.

**Confirmation requested**: `git reset --hard`, `git clean -f`, `npm publish`, `gh release create`,
`docker system prune`, `docker volume rm`, `kubectl delete`, `DROP TABLE`/`DROP DATABASE`, and
anything with `sudo`.

This is a safety net, not a permission system. It matches patterns in the command string and a
determined command can get around it. Use Claude Code's own permission settings for real policy.

### `protect-secrets` — Secret Shield

A `PreToolUse` hook on `Read`, `Edit`, `Write`, `MultiEdit` and `NotebookEdit` that refuses to open
credential material: `.env` files, `.npmrc`, `.netrc`, SSH private keys, anything under `.ssh/`,
`.gnupg/` or `.aws/credentials`, GitHub CLI hosts, service-account JSON, and `.pem`, `.key`, `.p12`,
`.pfx`, `.keystore` and `.jks` files.

`.env.example`, `.env.sample` and `.env.template` stay readable, because those are meant to be.

### `auto-format` — Auto Format

A `PostToolUse` hook on `Edit`, `Write` and `MultiEdit` that formats the file Claude just changed,
using whichever of these is already resolvable: `prettier` (via `npx --no-install`, so only when the
project depends on it), `ruff format`, `black`, `gofmt`, `rustfmt`, `shfmt`, `rubocop -a`.

It installs nothing and does nothing silently when no formatter is present. Marked **medium risk**
because it is the only mod that modifies your source files.

### `notify` — Desktop Notifications

A `Stop` and `Notification` hook that raises a native desktop notification when Claude finishes a
turn or is waiting on you. Uses `osascript` on macOS, `notify-send` on Linux and a `NotifyIcon`
balloon on Windows, falling back to a terminal bell.

### `commands` — Dashboard Slash Commands

Copies four slash commands into `~/.claude/commands/`:

| Command | Does |
|---|---|
| `/dashboard` | Starts the dashboard if needed and summarises the current state. |
| `/cost-report [days] [project]` | A cost and token report with a model breakdown, cache analysis and one concrete saving suggestion. |
| `/session-summary` | A handover note for the session you are in: done, open, decisions, cost. |
| `/mods [list\|install\|remove] [id]` | Manages mods from inside Claude Code. |

### `analyst-agent` — Usage Analyst Subagent

Installs a `dashboard-analyst` subagent that reads the dashboard API and explains your usage. It is
instructed to establish a median before calling anything a trend, to separate the three drivers of
spend (session count, tokens per session, model choice), to check cache efficiency, and to put a
figure next to every claim.

---

## How installing works

### What a manifest looks like

```json
{
  "id": "guard-bash",
  "name": "Bash Guard",
  "category": "safety",
  "summary": "Blocks a short list of destructive shell commands…",
  "risk": "low",
  "install": [
    { "type": "copy", "from": "hooks/_hooklib.js",   "to": "dashboard/mods/_hooklib.js" },
    { "type": "copy", "from": "hooks/guard-bash.js", "to": "dashboard/mods/guard-bash.js", "mode": 493 },
    { "type": "hook", "event": "PreToolUse", "matcher": "Bash",
      "command": "node \"{{HOME}}/dashboard/mods/guard-bash.js\"" }
  ]
}
```

| Step | Fields | Effect |
|---|---|---|
| `copy` | `from`, `to`, optional `mode` | Copies a file from the package into your Claude home. `to` is relative to it. `mode` is decimal (493 = `0755`). |
| `hook` | `event`, optional `matcher`, `command` | Adds one hook entry under `settings.hooks[event]`. |
| `settings` | `path` (dotted), `value` | Sets a key in `settings.json`. |

`{{HOME}}` expands to your Claude home directory.

`risk` is `none`, `low`, `medium` or `high` and only drives the badge in the interface.

### Safety properties

- **Backup first.** `settings.json` is copied to `settings.json.bak-<timestamp>` before any write.
- **Atomic write.** The new settings are written to a temp file and renamed, so an interrupted write
  cannot truncate the file.
- **Idempotent.** Installing twice does not add a second hook — entries are matched by command string.
- **Precise removal.** Uninstalling removes the exact commands and keys the manifest declares. A
  settings key is only deleted if its value still points into `dashboard/mods/`, so a value you
  changed by hand is left alone.
- **Shared files survive.** `_hooklib.js` is used by several mods and is only deleted once no mod that
  needs it is still installed.
- **Honest status.** A mod is reported installed based on what is actually in `settings.json` and on
  disk, not on a record of what was installed. Remove a hook by hand and the dashboard notices.

### Where things go

```
~/.claude/
├── settings.json                       modified (and backed up)
├── settings.json.bak-<timestamp>       one per write
├── commands/*.md                       the commands mod
├── agents/dashboard-analyst.md         the analyst mod
└── dashboard/
    ├── mods/*.js                       mod scripts
    ├── mods.json                       install record
    └── events.jsonl                    the event log
```

---

## Writing your own mod

1. Put your script in `mods/hooks/your-mod.js`. Import the helpers:

   ```js
   #!/usr/bin/env node
   import { input, allow, block, ask, emit } from './_hooklib.js';

   const d = input();                         // the hook payload from stdin
   if (somethingWrong(d)) block('why this was refused');
   emit({ kind: 'mine', session: d.session_id });  // show up in the Live Monitor
   allow();
   ```

   | Helper | Effect |
   |---|---|
   | `input()` | Parses the JSON payload on stdin; `{}` if there is none. |
   | `allow(extra?)` | Exit 0. Any object passed is written to stdout as the hook response. |
   | `block(reason)` | Exit 2 with the reason on stderr, which Claude reads. |
   | `ask(reason)` | Returns a `permissionDecision: "ask"` response. |
   | `emit(event)` | Appends to the dashboard event log. Never throws. |

2. Add an entry to `mods/registry.json`.

3. Test it against a throwaway home before touching your real one:

   ```bash
   export CLAUDE_DASHBOARD_HOME=/tmp/mod-test
   mkdir -p $CLAUDE_DASHBOARD_HOME
   claude-dashboard mods install your-mod
   cat $CLAUDE_DASHBOARD_HOME/settings.json
   echo '{"tool_input":{"command":"ls"}}' | node mods/hooks/your-mod.js; echo "exit=$?"
   claude-dashboard mods remove your-mod
   ```

### Rules worth following

- **Be fast.** A `PreToolUse` hook runs before every matching tool call. Keep it under ~50 ms.
- **Fail open.** If your hook cannot do its job, let the call through. A logging bug should never
  stop someone working.
- **Say why.** The string you pass to `block()` is what Claude reads. Explain the problem and what to
  do instead.
- **Touch nothing you did not declare.** Everything a mod changes belongs in its manifest, otherwise
  uninstall cannot undo it.

---

## Removing everything

```bash
for id in $(claude-dashboard mods list | grep -oE '^\s+[●◐○]\s+\S+' | awk '{print $2}'); do
  claude-dashboard mods remove "$id"
done
```

Or restore the most recent backup by hand:

```bash
ls -t ~/.claude/settings.json.bak-* | head -1 | xargs -I{} cp {} ~/.claude/settings.json
```
