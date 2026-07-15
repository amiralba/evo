---
name: session-handoff
description: Playbook for ending a work session or starting a fresh conversation without losing context. Use when a conversation gets long, a feature is finished, or switching topics — summarize state into docs instead of carrying chat history.
---

# Session Handoff

Long conversations degrade reasoning and waste tokens. State lives in docs, not chat.

## Ending a session
1. Run the **coordinator** agent (or do its job manually):
   - Update `CLAUDE.md` → "Current focus" section
   - Update the feature's `specs/NNN-slug/tasks.md` (done / new tasks) and the `docs/TODO.md` backlog
   - Append decisions to `docs/DECISIONS.md`
   - Sync ARCHITECTURE/API/DATABASE docs with any code changes
2. Commit with a message summarizing the session.

## Starting a fresh session
Open a new conversation and say only:
> "Read CLAUDE.md and specs/NNN-slug/tasks.md. Continue with task: <task name>."

Do NOT paste previous conversations. The docs are the handoff.

## When to start fresh
- Switching features or topics
- Conversation exceeds ~20 exchanges
- The agent starts forgetting earlier instructions
