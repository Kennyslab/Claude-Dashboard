---
description: List, install or remove Claude Dashboard mods
argument-hint: [list|install|remove] [mod-id]
allowed-tools: Bash(claude-dashboard:*)
---

Manage Claude Dashboard mods.

Run `claude-dashboard mods ${1:-list} $2` and present the result.

When listing, show a table of every mod: id, what it does, which hook event it binds to,
and whether it is currently installed. When installing or removing, state exactly which
files changed and remind the user that `settings.json` is backed up before every write,
and that hook changes take effect in a new Claude Code session.
