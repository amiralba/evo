# Plan: Analytics & Onarım (010-analytics-onarim)

<!-- Owned by: planner. High-level sequencing; the executable breakdown is tasks.md. -->

## Approach

M4 aggregates and presents data M1–M3 already produce; it adds exactly one new table (`absence`) plus
two new validation codes (`V8`, `V14`) and the Onarım decision workbench. Analytics are computed on-read
(no materialized table, no refresh job). Onarım applies decisions through the EXISTING `PatchResolver`
engine + `decision_journal`. Nothing here reinvents `visit_realization`, `merchandiser_location_ping`,
`task_instance`, `patch`, `assignment`, or `audit_log`.

## Phases (each ends with the CLAUDE.md checkpoint protocol)

1. **Absence model + V14/V8 + seeder** — new `absence` table + endpoints; pure `AbsenceValidator` (V14)
   and `UtilizationValidator` (V8) wired into plan/validate; seeder produces colliding absences/closures.
2. **Plan-health analytics read API** — on-read aggregation service + `/analytics/plan-health`,
   `/analytics/stability`, `/routes/{id}/evidence`; tests over seeded data.
3. **Onarım workbench backend** — disruption listing, ranked-candidate service, apply-decisions endpoint
   (patches via existing engine + one journal entry); tests.
4. **Panel — analytics** — `/analytics` page (region → route-ranked table + metric cards) + Bilgi-tab
   evidence strip.
5. **Panel — Onarım** — V14 surfacing + ✨ Onarım workbench modal (ranked candidates, per-row decide,
   apply with reason/objective); Vitest + Playwright smoke.
6. **Docs + close-out** — update ARCHITECTURE/API/DATABASE/DECISIONS, design-doc build-note flags,
   ROADMAP (mark M4 complete), TODO. Regenerate the TS client.

## Dependencies / ordering

- Phase 2 & 3 both depend on Phase 1's `absence` table (Onarım) and existing realized data (analytics).
- Phase 4 depends on Phase 2's endpoints; Phase 5 depends on Phase 1 (V14) + Phase 3 (Onarım API).
- Regenerate `contracts/openapi.json` (via `dotnet build`) after every backend contract change; run
  `npm run generate-api-client` before panel phases consume new endpoints.

## Test-critical (per CLAUDE.md rule 4)

- `AbsenceValidator` V14 (both triggers + clean control); `UtilizationValidator` V8 band edges.
- Onarım candidate ranking determinism; apply → real patches → plan reflow → V14 clears for decided rows.
- Analytics aggregation correctness against a known seeded fixture (completion %, variance, stability).
