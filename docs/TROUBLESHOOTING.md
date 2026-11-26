# Troubleshooting

Start with `claude-dashboard doctor` — it checks the Node version, the Claude home, the transcript
directory, whether anything could be indexed, write access and the installed mods, and it prints the
reason next to any failure.

---

## Nothing shows up

### "No sessions yet"

The dashboard found no transcripts. Check where it is looking:

```bash
claude-dashboard doctor
ls ~/.claude/projects
```

If `~/.claude/projects` is empty, Claude Code has not written anything yet — run one session and
refresh. If your Claude home is somewhere else:

```bash
claude-dashboard --home /path/to/your/.claude
```

### The page is blank

Open the browser console. If module loading failed, the install is incomplete — reinstall:

```bash
npm install -g claude-dashboard --force
```

### "Cannot reach the dashboard server"

The server stopped, or something else took the port. Check:

```bash
curl -s http://127.0.0.1:7878/api/health
```

---

## Port problems

```
error Port 7878 is already in use. Try --port 7879.
```

Either another copy is running — which is fine, just open it — or something else holds the port:

```bash
lsof -i :7878          # macOS, Linux
netstat -ano | findstr :7878   # Windows
claude-dashboard --port 8900
```

---

## The numbers look wrong

### Costs do not match my bill

They will not match exactly, and are not meant to. These are estimates computed from the token
counts in your transcripts against a price table. They know nothing about your plan, included usage,
subscription pricing or discounts. Use them to compare projects, models and days; use the Anthropic
Console for what you were billed.

If they are wrong by a large factor, the price table is probably out of date. Fix it in
**Settings → Price table**, or in `~/.claude/dashboard/pricing.json`, and every figure recalculates.

### Costs look far too low

Check the cache hit rate on the Overview. A heavily cached session genuinely is cheap: cache reads
cost about a tenth of fresh input tokens. That is the system working.

### Costs look far too high

Sort Sessions by cost and open the most expensive one. The usual causes are a very large file read
into context, a loop that re-read the same thing repeatedly, or Opus on a task that did not need it.
The token split bar on the session page shows which.

### A session is missing

- It must be under `~/.claude/projects/*/` and end in `.jsonl`.
- Empty files are skipped.
- Press **Reindex transcripts** in Settings, or `r`, to force a full re-read.

### Token counts seem doubled

They should not be — the parser de-duplicates by request id, and a test covers it. If you can
reproduce a doubled count, please open an issue with a redacted transcript line.

---

## Mods

### A mod installed but nothing changed

**Restart Claude Code.** Hooks and the status line are read at session start.

### "Could not change this mod"

The toast carries the real message. Usually one of:

| Message | Fix |
|---|---|
| `read-only mode` | Restart without `--read-only`. |
| `EACCES` / permission denied | Your Claude home is not writable: `ls -la ~/.claude`. |
| `Unknown mod` | `claude-dashboard mods list` for the valid ids. |

### A mod shows "partly installed"

Its files are present but a hook or settings key is missing, usually because `settings.json` was
edited by hand. Install it again — the operation is idempotent and will restore the missing entry.

### A hook is blocking something it should not

Remove the mod, and either work around it or adjust the pattern list:

```bash
claude-dashboard mods remove guard-bash
```

To customise: edit `~/.claude/dashboard/mods/guard-bash.js` directly. Reinstalling the mod overwrites
your edit, so keep a copy.

### settings.json looks wrong after a mod

Every write leaves a backup:

```bash
ls -t ~/.claude/settings.json.bak-*
cp "$(ls -t ~/.claude/settings.json.bak-* | head -1)" ~/.claude/settings.json
```

### The status line is not showing

1. `cat ~/.claude/settings.json | grep -A3 statusLine`
2. Test it directly:
   ```bash
   echo '{"model":{"display_name":"Opus"},"cwd":"'$PWD'"}' | node ~/.claude/dashboard/mods/statusline.js
   ```
3. Make sure `node` is on the PATH of the shell Claude Code launches, which is not always the one you
   type in. Use an absolute path in `settings.json` if not.

---

## Live monitor is empty

Install the **Event Logger** mod and restart Claude Code. Then check the log is filling:

```bash
tail -f ~/.claude/dashboard/events.jsonl
```

If the file grows but the page does not update, the SSE connection dropped — the dot at the bottom
of the rail reads "reconnecting". Reload the page.

---

## Performance

### First load takes several seconds

Expected with a large history; later refreshes are incremental. Keep the server running rather than
restarting it for each use.

### High CPU when idle

Lower the poll rate: `claude-dashboard --poll 10000`.

### A session page is slow to open

Transcripts over about 20 MB take a moment to render in full. Use the filter buttons above the
transcript to narrow it, or download the JSONL.

---

## Platform notes

### Windows

Use PowerShell or Windows Terminal; `cmd.exe` renders the CLI's colours poorly. Paths with spaces
need quoting:

```powershell
claude-dashboard --home "C:\Users\Your Name\.claude"
```

### WSL

Claude Code running inside WSL writes to the Linux home, not the Windows one. Run the dashboard
inside WSL too, and open `http://127.0.0.1:7878` from Windows — WSL2 forwards localhost.

### macOS "node: command not found" in a hook

GUI-launched processes get a different PATH. Put the absolute path to node in `settings.json`:

```bash
which node   # e.g. /opt/homebrew/bin/node
```

---

## Still stuck

Open an issue with:

```bash
claude-dashboard --version
claude-dashboard doctor
node --version
```

plus your OS, and the browser console output if it is a rendering problem. Please redact anything
sensitive from transcript excerpts before posting them.
