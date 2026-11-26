---
description: Summarise the current session - what was done, what it cost, what is left
allowed-tools: Bash(curl:*), Read, Bash(ls:*)
---

Summarise the session we are in right now.

1. Read the live session from the dashboard: `curl -s http://127.0.0.1:7878/api/sessions/current`
2. Write a handover note with these sections:
   - **Done** — the concrete changes made, as a short list
   - **Open** — anything started and not finished, including any pending todos
   - **Decisions** — choices made that a reader would not guess from the code
   - **Cost** — tokens and estimated spend for this session
3. Keep it under 250 words. Write it so that a different person could pick the work up
   tomorrow without reading the transcript.
