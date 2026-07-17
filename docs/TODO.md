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
- Planner UI spec (M1, web panel): map/schedule grid/table workspace, lasso multi-select, live health
  card, drag-drop stop editing against 005-route-planning-core's generated TS client. `POST
  /simulate/route` deferred into this spec. Not started — needs a `/plan` pass to generate its spec.
- Conflict Center — may land inside the planner UI spec or split out; decide at `/plan` time.

## Recently completed features
- M0 — Platform foundation (specs 001–004): solution scaffold, auth/roles, error/audit, store sync — all COMPLETE.
- M1 — 005-route-planning-core (backend): Route/RouteStop/Assignment/Patch/PlannedVisit/DecisionJournal
  schema, pure scheduling engine (450-min rule, Baseline+Patch resolution), validation engine, full REST
  API, publish gate with override-with-reason. Panel UI not yet built (separate spec). COMPLETE.
