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

### M3 — Field execution simulation (status: COMPLETE)
Goal: everything downstream of the field (planned-vs-realized, task results, notes) works against seeded/mocked data.
- [x] 009-field-execution-sim — new `visit_realization` table (1:1 with `planned_visit` — check-in/out,
      actual minutes, outcome reason; `planned_visit.status` stays the outcome source of truth) +
      a continuous `merchandiser_location_ping` stream (plain lat/lng, pulled forward from M4's
      live-location-layer data groundwork per user decision — the map **visualization** of this stream
      stays M4, only the pipeline/read-API landed here); typed `TaskResult` payloads (None/Photo/Form,
      seeded object keys not real MinIO); `note`/`notification` schema + supervisor inbox + mocked
      `INotificationDispatcher` firing on publish; `FieldExecutionSeederModule` (past history via a
      new seeder-only `MaterializeHistoryAsync`, ~85/8/7 Done/Missed/Skipped distribution, dense
      location pings, task results, notes, notifications — verified idempotent; NOTE: never registered
      on the prototype-parity branch and deleted 2026-07-19, decision D3b); panel schedule-block
      outcome coloring + planned-vs-realized tooltip, task results in Görevler, Notes inbox modal with
      an open-count badge. Backend 142/142, panel 48/48 tests, 5/5 Playwright specs green. Deferred
      (confirmed 2026-07-17, not silently dropped): real mobile app/live agent write API, real
      MinIO/FCM, out-of-route visits + their analytics, planned-vs-realized analytics (Planning-Evidence
      panel → M4), the live-location map layer (data exists, rendering is M4).

### M4 — Analytics & Onarım (status: COMPLETE)
- [x] 010-analytics-onarim — Planning Evidence panel / plan-health metrics: all 8 design §8 metrics
      (completion %, duration variance, utilization band, task compliance, patch load, stability,
      assignment turnover, override rate) plus mobility-per-person, shipped as **on-read aggregation**
      (no materialized views — deviates from design §9, see `docs/DECISIONS.md`) via
      `GET /analytics/plan-health`/`/stability`/`/mobility` + `GET /routes/{id}/evidence`; new
      `absence` table + V8 (`UtilizationValidator`)/V14 (`AbsenceValidator`) landed. Onarım
      absence-repair decision workbench (design §7.3b): ranks-not-decides via pure
      `Evo.Domain.Onarim.CandidateRanker`; v1 adds a 4th per-visit action `ReassignPerson` beyond
      Skip/MoveDay/ReassignRoute, backed by a new `CrossReassignVisit` patch type (per-visit
      cross-person/cross-route reassignment off one patch row). Panel: `/analytics` page (region
      picker + plan-health/mobility tables), evidence strip in the route detail panel's Bilgi tab,
      Onarım workbench modal (topbar entry point). Backend 155/166 (11 pre-existing unrelated
      weekend-date flakes), panel 75/75, Playwright 6/6. Deferred (not silently dropped): materialized
      analytics views, live-location map visualization layer, ⚡ "Otomatik düzelt" auto-fix.

## Open questions (blocking pieces of M0)
The 9 customer-IT questions in `EVO-Teknoloji-Yigini.pdf` — hosting, SQL Server version, AD/Entra, KVKK retention, device fleet, integration contract.
