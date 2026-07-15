# Roadmap

<!-- Owned by: planner. Kept current by: coordinator. Seeded from design docs v0.5; refine via /plan. -->

## Vision
Single-page planning workspace where a supervisor designs and repairs merchandiser routes for hundreds of stores — with live validation, defensible decisions (override-with-reason), and a read-only mobile week view for field agents. Proves the value of field work with evidence, never causality claims.

## Non-goals
- No microservices/Kubernetes (single strong VM serves the scale)
- No auto-deciding: the system ranks and previews; humans choose
- No delete/archive for routes and stores (activate/deactivate only)
- Mobile app is read-only + notes — no structural edits from the field
- **No mobile app in current scope** — field-agent behavior is seeded/mocked; mobile revived later from backlog

## Milestones

### M0 — Platform foundation (status: not started)
Goal: everything modules depend on, built once.
- [ ] 001-solution-scaffold — repo layout, CI, OpenAPI→TS client pipeline, Docker + IIS story
- [ ] 002-auth-roles — ASP.NET Identity, Supervisor/Field-agent roles, AD/Entra SSO option
- [ ] 003-error-audit — shared ProblemDetails error shape; RouteChangeLog audit pattern
- [ ] 004-store-sync — nightly ingestion from EVO sales (stores, formats, revenue snapshots)

### M1 — Route planning core (web panel)
Goal: a supervisor can build and publish a valid plan.
- [ ] Routes & stops lifecycle (draft/active/inactive, geo scope)
- [ ] Assignments with history
- [ ] Scheduling engine: plan generation, 450-min rule, live validation
- [ ] Baseline + Patch model with auto-expiry
- [ ] Publish gate with override-with-reason + Conflict Center

### M2 — Tasks & rules
- [ ] TaskTemplate + Rule resolution (format-driven durations, per-store/route exceptions)
- [ ] Rule Inspector + aggregate impact preview
- [ ] One-off targeted tasks (target + valid_until)

### M3 — Field execution simulation
Goal: everything downstream of the field (planned-vs-realized, task results, notes) works against seeded/mocked data.
- [ ] Seeder generates realistic visit outcomes (done/missed/skipped + reasons, GPS check-in times, task results)
- [ ] Mocked agent-facing responses where the panel needs them (notes inbox, notification receipts)

### M4 — Analytics & Onarım
- [ ] Planning Evidence panel, plan-health metrics
- [ ] Onarım (absence repair) decision workbench

## Open questions (blocking pieces of M0)
The 9 customer-IT questions in `EVO-Teknoloji-Yigini.pdf` — hosting, SQL Server version, AD/Entra, KVKK retention, device fleet, integration contract.
