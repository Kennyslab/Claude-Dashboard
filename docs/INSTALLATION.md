# Installation

## Requirements

| | |
|---|---|
| **Node.js** | 18.0 or newer. Check with `node -v`. |
| **Claude Code** | Installed and run at least once on the same machine, so that `~/.claude` exists. |
| **Operating system** | macOS, Linux or Windows. |
| **Browser** | Any current Chrome, Firefox, Safari or Edge. |

There are no npm dependencies. `npm install` has nothing to download, and there is no build step.

---

## Option 1 — run it without installing

```bash
npx claude-dashboard
```

npx downloads the package to its cache, starts the server on `http://127.0.0.1:7878` and opens your
browser. Stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd>.

## Option 2 — install globally

```bash
npm install -g claude-dashboard
claude-dashboard
```

Upgrade later with `npm update -g claude-dashboard`.

## Option 3 — from source

```bash
git clone https://github.com/Kennyslab/Claude-Dashboard.git
cd Claude-Dashboard
node bin/claude-dashboard.js
```

To get the `claude-dashboard` command on your PATH while still editing the source:

```bash
npm link
```

Undo that with `npm unlink -g claude-dashboard`.

---

## Verify the installation

```bash
claude-dashboard doctor
```

```
  claude-dashboard doctor

  ✔  Node v22.11.0
  ✔  Claude home at /Users/you/.claude
  ✔  Transcript directory
  ✔  412 session(s) indexed
  ✔  settings.json
  ✔  Claude home is writable
  ✔  3 mod(s) installed
  ✔  7 hook(s) configured

  active mods: statusline-pro, guard-bash, event-logger

  everything looks good
```

A failing check prints the reason underneath it. `doctor` exits non-zero when something is wrong, so
it is usable in a script.

---

## First run

1. Start it: `claude-dashboard`
2. The browser opens on the Overview. If your history is large the first index takes a few seconds;
   after that it is incremental and near-instant.
3. Go to **Mods** and install `statusline-pro` and `event-logger`.
4. **Restart Claude Code.** Hooks and the status line are read when a session starts, so an already
   running session will not pick them up.

### No history yet?

Generate synthetic data and point the dashboard at it:

```bash
claude-dashboard demo --home /tmp/claude-demo --sessions 80
claude-dashboard --home /tmp/claude-demo
```

Delete `/tmp/claude-demo` when you are done. The generator refuses to write into any directory named
`.claude`, so it cannot overwrite real history.

---

## Running it in the background

### macOS — launchd

Create `~/Library/LaunchAgents/com.claude-dashboard.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.claude-dashboard</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/usr/local/lib/node_modules/claude-dashboard/bin/claude-dashboard.js</string>
    <string>--no-open</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/claude-dashboard.err</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.claude-dashboard.plist
```

Check `which node` and `npm root -g` and correct the two paths if they differ on your machine.

### Linux — systemd user service

Create `~/.config/systemd/user/claude-dashboard.service`:

```ini
[Unit]
Description=Claude Dashboard
After=network.target

[Service]
ExecStart=/usr/bin/node %h/.npm-global/lib/node_modules/claude-dashboard/bin/claude-dashboard.js --no-open
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now claude-dashboard
systemctl --user status claude-dashboard
```

### Windows — Task Scheduler

```powershell
$action  = New-ScheduledTaskAction -Execute "node" `
  -Argument "$env:APPDATA\npm\node_modules\claude-dashboard\bin\claude-dashboard.js --no-open"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "Claude Dashboard" -Action $action -Trigger $trigger
```

### Docker

The dashboard has to read your real `~/.claude`, so mount it read-only and bind to all interfaces
inside the container only:

```bash
docker run --rm -p 7878:7878 \
  -v "$HOME/.claude:/claude:ro" \
  -e CLAUDE_DASHBOARD_HOME=/claude \
  node:22-alpine \
  npx -y claude-dashboard --host 0.0.0.0 --no-open --read-only --insecure
```

`--read-only` matters here: a read-only mount means mod installs would fail anyway, and the flag
makes that a clear error rather than a filesystem one.

---

## Reaching it from another machine

The server binds loopback and refuses any other address unless you supply a token:

```bash
claude-dashboard --host 0.0.0.0 --token
```

With no value, `--token` generates one and prints the URL with the token attached. Visiting that URL
once sets a cookie for the session.

A safer route that needs no flags is an SSH tunnel:

```bash
ssh -N -L 7878:127.0.0.1:7878 you@workstation
```

Then open `http://127.0.0.1:7878` locally.

---

## Upgrading

| Installed with | Upgrade |
|---|---|
| `npx` | Nothing to do — npx fetches the current version. |
| `npm install -g` | `npm update -g claude-dashboard` |
| Git clone | `git pull` |

Installed mods are unaffected by an upgrade: their scripts live in `~/.claude/dashboard/mods/`. If a
mod's script changes between releases, reinstall it to copy the new version:

```bash
claude-dashboard mods remove statusline-pro
claude-dashboard mods install statusline-pro
```

---

## Uninstalling

Remove the mods first so your `settings.json` is cleaned up properly:

```bash
claude-dashboard mods list                 # see what is installed
claude-dashboard mods remove <id>          # for each one
npm uninstall -g claude-dashboard
```

Then delete the state directory if you want it gone:

```bash
rm -rf ~/.claude/dashboard
```

That directory holds the event log, your price overrides and the record of installed mods. Your
transcripts and `settings.json` are untouched by this. If anything went wrong, the timestamped
`~/.claude/settings.json.bak-*` files are there to restore from.
