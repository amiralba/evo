---
name: token-optimization
description: Playbook for minimizing token usage and keeping context healthy. Use when sessions feel slow/expensive, context is filling up, choosing models for a task, or configuring Claude Code settings.
---

# Token Optimization

Context quality beats context quantity — LLM performance degrades as context fills ("context rot"). Protect the main context at all costs.

## Model tiering
| Model | Use for |
|---|---|
| haiku | Exploration subagents, file scouting, simple lookups |
| sonnet | Day-to-day implementation, tests, refactoring (default) |
| opus | Architecture, security review, gnarly debugging |

Switch with `/model`. Start sessions on sonnet; escalate only when needed.

## Settings (`~/.claude/settings.json`)
```json
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  }
}
```
- `MAX_THINKING_TOKENS: 10000` — cuts hidden thinking cost ~70% vs default.
- `CLAUDE_CODE_SUBAGENT_MODEL: haiku` — exploration subagents don't need an expensive model.

## Session habits
- `/context` and `/cost` — see where tokens go; glance at the % before big tasks.
- `/clear` between unrelated tasks — stale context taxes every following message.
- `/compact` at logical breakpoints: after planning, after debugging, after a milestone. NEVER mid-implementation or mid-debugging.
- Above ~80% context: finish the current step, run the session-handoff skill, start fresh.

## Context protection
- Delegate exploration to the explorer subagent — it reads 20 files, returns 400 words.
- Point at specific files/dirs; never let the agent wander the whole repo.
- Pass file PATHS between agents/docs, not file contents.
- Plans and state live in docs (`docs/`, plan files), not in chat history.

## MCP / tool hygiene
- Each MCP server costs context on every message. Keep < 10 per project; `/mcp` shows the cost.
- Prefer CLI tools over MCP equivalents (`gh` over GitHub MCP).
- Prefer skills over MCP servers where possible — readable, auditable, cheaper.

## Checklist
- [ ] Right model for the task tier
- [ ] Fresh session for the new topic
- [ ] Exploration delegated, not done in main context
- [ ] Compacted at the last logical breakpoint
