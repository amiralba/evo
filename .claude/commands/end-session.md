---
description: Close a work session — sync all docs via the coordinator and commit.
---

End this work session properly:

1. Use the coordinator subagent to update all project docs: CLAUDE.md "Current focus", the active feature's tasks in specs/ (or docs/TODO.md), docs/DECISIONS.md, and any drifted ARCHITECTURE/API/DATABASE docs.
2. Show me the coordinator's report.
3. Stage and commit all changes with a message summarizing this session's work.
4. Tell me the exact one-line prompt to start the next session with (which docs to read, which task is next).
