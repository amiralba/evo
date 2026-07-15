---
description: Two-stage review of the current changes — spec compliance first, then code quality.
---

Use the reviewer subagent on the current diff ($ARGUMENTS if specified, otherwise all uncommitted/unmerged changes).

Two stages reported separately: (1) spec compliance against the active specs/NNN-slug/ — nothing missing, nothing extra; (2) code quality — correctness, security, contracts, conventions, performance. Findings as [BLOCKER]/[SHOULD FIX]/[NIT] with file:line. Then use the qa subagent to run the full test suite and report results.
