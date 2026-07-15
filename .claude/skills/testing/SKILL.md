---
name: testing
description: Playbook for writing and structuring tests. Use when writing tests, fixing failing tests, deciding what to test, or reviewing test coverage for a feature.
---

# Testing

## Process
1. Read acceptance criteria in the feature's `specs/NNN-slug/spec.md` — each criterion needs at least one test.
2. Write tests at the lowest level that proves the behavior: unit for logic, integration for boundaries (DB, API), e2e sparingly for critical flows.
3. Name tests by behavior: `test_reset_password_rejects_expired_token`, not `test_case_3`.
4. Run the FULL suite before declaring done, not just new tests.

## What to always cover
- Happy path
- Empty/null/missing input
- Boundary values (0, 1, max, max+1)
- Unauthorized/forbidden access
- Malformed input
- The exact reproduction of any bug fixed (regression test)

## Rules
- Test behavior through public interfaces, not private internals.
- Tests must be deterministic — no real network, no sleeps for timing, no shared mutable state between tests.
- A failing test must clearly say what broke.

## Checklist
- [ ] Every acceptance criterion covered
- [ ] Edge cases from the list above considered
- [ ] Full suite green
