# Configuration

## Command-line flags

| Flag | Default | Notes |
|---|---|---|
| `-p, --port <n>` | `7878` | Also settable with `CLAUDE_DASHBOARD_PORT`. |
| `-H, --host <addr>` | `127.0.0.1` | Anything but loopback requires `--token` or `--insecure`. |
| `--home <dir>` | `~/.claude` | Point at a different Claude home. |
| `--token [secret]` | off | With no value, one is generated and printed in the URL. |
| `--read-only` | off | Every mutating endpoint returns `403`. |
| `--no-open` | off | Do not launch a browser. |
| `--poll <ms>` | `2500` | Filesystem fingerprint interval. |
| `--days <n>` | `30` | Window for `stats` and `export`. |
| `--format <fmt>` | `json` | `json` or `csv`, for `export`. |
| `--insecure` | off | Allow a non-loopback bind with no token. Think before using this. |
| `-v, --version` | | |
| `-h, --help` | | |

## Environment variables

| Variable | Effect |
|---|---|
| `CLAUDE_DASHBOARD_HOME` | Claude home directory. Highest precedence after `--home`. |
| `CLAUDE_CONFIG_DIR` | Claude Code's own variable; respected as a fallback. |
| `CLAUDE_DASHBOARD_PORT` | Default port. |
| `CLAUDE_DASHBOARD_CONTEXT_LIMIT` | Context window the status line bar scales against, when the payload does not report one. Default `200000`. |
| `NO_COLOR` | Disables colour in the CLI and the status line. |

Resolution order for the Claude home: `--home` → `CLAUDE_DASHBOARD_HOME` → `CLAUDE_CONFIG_DIR` →
`~/.claude`.

---

## Price overrides

The built-in table, in USD per million tokens:

| Matches | Input | Output | Cache write | Cache read |
|---|---|---|---|---|
| `opus` | 15 | 75 | 18.75 | 1.5 |
| `sonnet` | 3 | 15 | 3.75 | 0.3 |
| `haiku` | 0.8 | 4 | 1.0 | 0.08 |
| `fable` | 15 | 75 | 18.75 | 1.5 |
| `mythos` | 15 | 75 | 18.75 | 1.5 |

Keys are matched as case-insensitive substrings against the model id, and the longest match wins, so
`opus` catches `claude-opus-5` and you can add `claude-opus-5-20260501` to override just that build.
A model matching nothing falls back to the Sonnet rate.

Edit the table in **Settings → Price table**, or write
`~/.claude/dashboard/pricing.json` directly:

```json
{
  "opus":   { "input": 15, "output": 75, "cacheWrite": 18.75, "cacheRead": 1.5 },
  "sonnet": { "input": 3,  "output": 15, "cacheWrite": 3.75,  "cacheRead": 0.3 },
  "haiku":  { "input": 0.8,"output": 4,  "cacheWrite": 1.0,   "cacheRead": 0.08 },
  "my-finetune": { "input": 2, "output": 8, "cacheWrite": 2.5, "cacheRead": 0.2 }
}
```

The file is merged over the defaults, so you only need the keys you are changing. Restart the server
or press **Reindex transcripts** to apply changes made outside the interface.

---

## Security posture

The dashboard is designed to be safe on a laptop with no further configuration.

**Default:** binds `127.0.0.1`, so only processes on your machine can reach it. Reads are open;
writes require a custom header, which means a malicious web page cannot trigger them through a form
or an image tag.

**Shared screen or pairing session:** add `--read-only`. Mods, pricing and reindexing all return
`403`, and the interface disables the buttons.

**Remote access:** prefer an SSH tunnel.

```bash
ssh -N -L 7878:127.0.0.1:7878 you@workstation
```

If you must bind a real interface, use a token:

```bash
claude-dashboard --host 0.0.0.0 --token
```

The token is accepted as `?token=…`, the `X-Dashboard-Token` header or the `dashboard_token` cookie
set on first visit. There is no TLS — put it behind a reverse proxy if it is going anywhere real, and
remember that the API exposes the full text of your transcripts.

---

## Tuning

| Situation | Change |
|---|---|
| Thousands of sessions, first load is slow | Only the first scan is expensive; later ones are incremental. Keep the server running rather than restarting it. |
| Live updates feel laggy | Lower `--poll`, e.g. `--poll 1000`. |
| Battery life on a laptop | Raise it: `--poll 10000`. |
| Event log growing | It self-trims at 8 MB. Delete `~/.claude/dashboard/events.jsonl` any time; it is rebuilt. |
| Running several Claude homes | Start one server per home on different ports with `--home` and `--port`. |
