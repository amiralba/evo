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
- M1 route planning core: Route/RouteStop/Assignment entities, scheduling engine (450-min rule), Baseline+Patch model with auto-expiry, publish gate with override-with-reason — needs a `/plan` pass to generate its spec.

## Recently completed features
- M0 — Platform foundation (specs 001–004): solution scaffold, auth/roles, error/audit, store sync — all COMPLETE.
