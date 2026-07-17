# TODO (Backlog)

<!-- Backlog of unstarted ideas ONLY. Active feature work lives in specs/NNN-slug/tasks.md. -->

## Blocking questions (get answers, record in DECISIONS.md)
- 9 customer-IT questions (EVO-Teknoloji-Yigini.pdf): hosting, client constraints, .NET version/standards, integration contract, SQL Server version/license, device fleet/MDM, AD/Entra for both roles?, KVKK retention + FCM restrictions, discovery shadowing session
- Design §10 open items #3–#9: SERVICE mix cap weighting, geo-scope strictness, sequence auto-suggest, patch conflict priority, pro-rata revenue on store move, rep-request inbox in v1?, ad-hoc tasks on store move
- Meeting questions (design §10, Turkish): holidays/bayram handling, concurrent editing by multiple supervisors, rollout strategy (parallel vs region-by-region), Saturday work / week shape

## Backlog (post-M4 / designed-only from v0.5 §11.4)
- **Field agent mobile app** (deferred from scope 2026-07-15): React Native (Expo) Android, WatermelonDB offline sync, GPS check-in, photo upload, FCM — design §6.7; until then field behavior is seeded/mocked
- Items listed in design §11.4 "Deliberately not built" — revisit after M4
- SheetJS Excel export upgrade (prototype uses CSV/BOM)
- Sequence optimization button (nearest-neighbor suggest, never forced)

## Next up
- M3 — Field execution simulation: seeder-generated realistic visit outcomes (done/missed/skipped +
  reasons, GPS check-in times, task results); mocked agent-facing responses where the panel needs them
  (notes inbox, notification receipts). Not started — needs a `/brainstorm` or `/plan` pass to generate
  its spec.
- Conflict Center/Sorun Merkezi — explicitly deferred out of 006/007/008; may land inside an M3/M4 spec
  or split out; decide at `/plan` time.
- `POST /simulate/route` — still deferred (pushed from 005 → 006/007 → 008 too).
- Module-stack editor (`SET_FREQUENCY`/`SET_MODULES`/`PATCH_MODULE` rule effect ops) and standalone
  Yönetim admin pages (task-template/rule CRUD UI) — deferred out of 008, no target spec assigned yet.

## Recently completed features
- M0 — Platform foundation (specs 001–004): solution scaffold, auth/roles, error/audit, store sync — all COMPLETE.
- M1 — Route planning core (web panel): ALL COMPLETE.
  - 005-route-planning-core (backend): Route/RouteStop/Assignment/Patch/PlannedVisit/DecisionJournal
    schema, pure scheduling engine (450-min rule, Baseline+Patch resolution), validation engine, full REST
    API, publish gate with override-with-reason.
  - 006-planner-ui: `/planner` workspace (map/schedule/table panes, MapLibre store layer + lasso, live
    health card, selection editing, publish flow), plus a Phase 9 visual-parity pass against the HTML
    prototype (topbar/rail/map/schedule/detail-panel CSS, Bilgi/Görevler/Geçmiş tabs).
  - 007-schedule-drag-resize: real same-day TimeShift + new cross-day MoveVisit patch resolution in the
    scheduling engine; schedule-grid drag/resize/cross-day-move UI with live reflow preview; prototype's
    time-axis/person-cell layout.
- M2 — Tasks & rules: COMPLETE.
  - 008-tasks-rules: `TaskResolver`/`RuleMatcher` domain engine, `TaskTemplate`/`Rule`/`TaskInstance`
    persistence, `PlanGenerationService` integration (Σ task minutes replaces flat fallback,
    `TaskInstance` materialization), 6 new endpoints, seeder module, panel Görevler tab + scope modal +
    Rule Inspector trace popover.
