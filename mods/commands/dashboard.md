---
description: Open the Claude Dashboard in a browser and report what it shows
allowed-tools: Bash(claude-dashboard:*), Bash(npx claude-dashboard:*), Bash(curl:*)
---

Start the Claude Dashboard (if it is not already running) and summarise the current state.

1. Check whether the dashboard is already serving: `curl -s -m 2 http://127.0.0.1:7878/api/health || true`
2. If it is not, start it detached: `claude-dashboard --port 7878 &`
3. Fetch the overview: `curl -s http://127.0.0.1:7878/api/overview`
4. Report, in a compact table: total sessions, total cost, tokens, cache hit rate, the three
   most expensive projects and the current activity streak.
5. Finish with the URL so the user can click through.

Do not invent numbers. If the API is unreachable, say so and show the error.
