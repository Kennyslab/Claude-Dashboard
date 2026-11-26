---
description: Cost and token report for a time window (default last 30 days)
argument-hint: [days] [project]
allowed-tools: Bash(curl:*), Bash(claude-dashboard:*)
---

Produce a cost report from the Claude Dashboard API.

Window: $1 days (default 30). Optional project filter: $2.

1. `curl -s "http://127.0.0.1:7878/api/analytics?days=${1:-30}"`
   If the request fails, start the dashboard first with `claude-dashboard --no-open &`.
2. Build a report with:
   - headline spend for the window, and the projected monthly spend
   - a breakdown by model with cost per model and share of total
   - a breakdown by project, highest spend first
   - cache efficiency: cache-read share of all input tokens, and the saving it implies
   - the three days with the highest spend
3. End with one concrete, specific suggestion for reducing spend based on what the
   numbers actually show — for example a model downgrade for a cheap project, or a
   caching opportunity if the cache-read share is low.

All figures are estimates derived from local transcripts; say so once at the end.
