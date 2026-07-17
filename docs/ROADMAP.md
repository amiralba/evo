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

### M0 — Platform foundation (status: COMPLETE)
Goal: everything modules depend on, built once.
- [x] 001-solution-scaffold — repo layout, CI, OpenAPI→TS client pipeline, Docker + IIS story
- [x] 002-auth-roles — ASP.NET Identity, Supervisor/Field-agent roles, AD/Entra SSO option
- [x] 003-error-audit — shared ProblemDetails error shape; RouteChangeLog audit pattern
- [x] 004-store-sync — nightly ingestion from EVO sales (stores, formats, revenue snapshots)

### M1 — Route planning core (web panel)
Goal: a supervisor can build and publish a valid plan.
- [x] 005-route-planning-core — Routes & stops lifecycle (draft/active/inactive, geo scope), Assignments
      with history, scheduling engine (plan generation, 450-min rule, live validation), Baseline + Patch
      model with auto-expiry, publish gate with override-with-reason (`decision_journal`) — BACKEND ONLY,
      full REST API, no panel UI. 48/48 tasks complete.
- [x] 006-planner-ui — COMPLETE, 93/93 tasks, all 9 phases. `/planner` workspace: Map | Schedule split +
      Table selection strip over a shared Zustand+TanStack Query state; `GET /stores/geo` + batch
      `POST /routes/{id}/stops:reorder` backend additions; MapLibre store layer + lasso; time-accurate
      schedule grid w/ prev/next week nav; live health card (Recharts); selection editing (bulk-add,
      dnd-kit reorder, stop edit, move-store, patch create); publish review + override-with-reason gate.
      Phase 9 (visual-parity pass, spec Clarification #15) — ported the topbar/seg/rail/pane-head/panel/
      badge classes + numbered map markers + route polyline + the real Bilgi/Görevler/Geçmiş detail-panel
      tabs (Geçmiş wired to real audit-log data, Görevler an honest M2-pending empty state) + PublishModal/
      SelectionBar ported to the prototype's modal/actionbar CSS. Still deferred (later specs): Conflict
      Center/Sorun Merkezi, `POST /simulate/route`, history timeline, live-location layer, Onarım
      workbench, full-canvas 6-tab table, Effective/Base toggle, global search, admin (Yönetim)/inbox
      pages — confirmed 2026-07-17 to stay out of scope for 006/007.
- [x] 007-schedule-drag-resize — real same-day `TimeShift` resolution + a new cross-day `MoveVisit`
      patch type in `PatchResolver`/`DayScheduler` (skip-source + add-target off one patch row, no
      DB migration); `CreatePatch` param validation + `UpdateStop` snap/clamp; drag-to-move
      (same-day time-shift, cross-day move) and drag-edge-to-extend-duration on the schedule grid,
      with a live rubber-band reflow preview for same-day drags; ported the prototype's time-axis +
      person-cell schedule layout. Backend 103/103, panel 40/40 tests green.

### M2 — Tasks & rules (status: COMPLETE)
- [x] 008-tasks-rules — TaskTemplate + Rule resolution engine (`Evo.Domain/Tasks/TaskResolver`,
      format-driven durations via SCALE/SET rules, per-store/route exceptions, dated rules
      auto-expiring like patches); `PlanGenerationService` integration (visit duration = Σ resolved
      task minutes replacing the flat fallback, `TaskInstance` materialization, format-change
      re-resolution); 6 endpoints (`task-templates`, `stores/{id}/task-plan`, `rules` CRUD +
      `rules/impact` aggregate preview, `task-instances/{id}` scope edit, `tasks/adhoc` one-off
      targeted tasks); seeder extended with a realistic template/rule set + adhoc survey; panel
      Görevler tab (replaces the M2-pending empty state) + scope modal (this-visit/this-store/
      all-format edits with a live impact preview) + Rule Inspector trace popover. Backend 131/131,
      panel 44/44 tests, 4/4 Playwright specs green. Deferred (confirmed 2026-07-17, not silently
      dropped): `POST /simulate/route`, Conflict Center/Sorun Merkezi, module-stack editor
      (`SET_FREQUENCY`/`SET_MODULES`/`PATCH_MODULE`), standalone Yönetim admin pages.

### M3 — Field execution simulation
Goal: everything downstream of the field (planned-vs-realized, task results, notes) works against seeded/mocked data.
- [ ] Seeder generates realistic visit outcomes (done/missed/skipped + reasons, GPS check-in times, task results)
- [ ] Mocked agent-facing responses where the panel needs them (notes inbox, notification receipts)

### M4 — Analytics & Onarım
- [ ] Planning Evidence panel, plan-health metrics
- [ ] Onarım (absence repair) decision workbench

## Open questions (blocking pieces of M0)
The 9 customer-IT questions in `EVO-Teknoloji-Yigini.pdf` — hosting, SQL Server version, AD/Entra, KVKK retention, device fleet, integration contract.
