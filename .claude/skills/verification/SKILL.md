---
name: verification
description: Evidence-over-claims playbook. Use before declaring ANY task done, when claiming something works or is fixed, and during code review. Nothing is "done" without run proof.
---

# Verification

Claiming without proof is the #1 AI failure mode. A claim requires evidence produced in THIS session.

## Before saying "done" / "fixed" / "works"
1. Run the thing: the test suite, the command, the reproduction case.
2. Show the evidence: paste the relevant output (trimmed), not a description of it.
3. Check the plan: every acceptance criterion / task verification step actually executed.
4. If something can't be verified here (needs deploy, human eyes on UI), say so explicitly and list it as unverified.

## Two-stage review (for reviewer + main agent self-check)
- **Stage 1 — Spec compliance:** does the diff implement exactly what the spec/plan says? Nothing missing, nothing extra (no unrequested features or refactors).
- **Stage 2 — Code quality:** only after stage 1 passes — correctness, security, conventions, performance.
Report the stages separately. A beautiful implementation of the wrong thing fails stage 1.

## Language rules
- Never: "this should work", "this likely fixes it", "tests should pass now".
- Instead: "ran X, output Y, therefore Z" — or — "NOT verified: <what> because <why>".

## Checklist
- [ ] Full test suite run in this session, output shown
- [ ] Each acceptance criterion checked against evidence
- [ ] Stage 1 (spec) and stage 2 (quality) both passed
- [ ] Unverified items explicitly listed
