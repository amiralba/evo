# Plan: Field Execution Simulation (009-field-execution-sim)

<!-- Owned by: architect/planner. Design decisions for THIS feature only. -->

## Approach

Seven phases, backend-first, matching the project's established rhythm and CLAUDE.md rule 3c
(cross-cutting data before UI). Every table added is populated by the seeder in the same spec (rule
"every spec that adds tables extends the seeder").

1. **Realized-visit model** — extend `PlannedVisit` with realized columns + `VisitOutcomeReason`
   enum; one migration; surface via `PlannedVisitDto` + the plan endpoint. No new table.
2. **Task results** — a pure `Evo.Domain.Tasks.TaskResult` record set typing `ResultJson`; surface
   the payload on the task read path. No schema change (`ResultJson` already exists, spec 008).
3. **Note** — new `note` table + enums; `GET /notes` inbox (filters) + `PATCH /notes/{id}`
   (acknowledge/resolve, audited). Supervisor-only.
4. **Notification** — new `notification` table; `GET /merchandisers/{id}/notifications` (self/any
   scoping like `/day`); a mock `INotificationDispatcher` fired from the existing publish path.
5. **Seeder** — `FieldExecutionSeederModule`: past-history materialization + outcome distribution +
   check-in GPS/duration + task results + notes + notifications; idempotent; demo/scale counts.
6. **Panel** — past-week outcome coloring + planned-vs-realized tooltip on the schedule grid;
   task-result display in the Görevler tab; notes inbox with ack/resolve + count badge.
7. **Docs + wrap** — DATABASE/API/ARCHITECTURE/DECISIONS/ROADMAP + design-doc build flags.

Layering (unchanged from 005–008): pure logic (`Evo.Domain.Tasks.TaskResult`) has no EF/DB deps;
persisted entities in `Evo.Infrastructure`; controllers/DTOs in `Evo.Api`; console seeder in
`Evo.Seeder`; React in `panel/src`. TS client is regenerated from the OpenAPI contract, never
hand-written.

## Contracts touched

- **DB (docs/DATABASE.md):**
  - `planned_visit` +6 nullable columns (`CheckInAt`, `CheckOutAt`, `ActualMinutes`, `CheckInLat`,
    `CheckInLng`, `OutcomeReason`) — additive migration, no data backfill needed.
  - `note` — `id`, `author_id` (FK→AspNetUsers, nullable = system/seed), `anchor_type`
    (Store/Visit/Day/General), `anchor_id` (Guid?), `kind` (Note/ChangeRequest), `body`, `status`
    (Open/Acknowledged/Resolved), `created_at`. Indexes: `(anchor_type, anchor_id)`, `(status, kind)`.
  - `notification` — `id`, `merchandiser_id` (FK), `payload_json` (nvarchar(max), diff summary),
    `created_at`, `read_at` (nullable). Index `(merchandiser_id, created_at)`.
  - `task_instance.result_json` — no schema change; now typed/populated.
- **API (docs/API.md):**
  - `GET /notes` (Supervisor), `PATCH /notes/{id}` (Supervisor).
  - `GET /merchandisers/{id}/notifications` (self/any scoping).
  - `POST /routes/{id}/publish` — behavior addition only (fires `INotificationDispatcher`), same
    request/response shape.
  - `PlannedVisitDto` gains `Status` + realized fields (additive).
- **Design doc:** §2.6 (planned-vs-realized), §2.11 (Note), §2.12 (Notification) get build-note flags
  where M3 diverges (columns-on-planned_visit instead of a separate VISIT table; mocked dispatcher
  instead of FCM).

## Risks

- **Past-history materialization (Q8).** `PlanGenerationService`'s range method is named
  `RegenerateFutureAsync(routeId, from, to)`. Task 5.2 must confirm it iterates an arbitrary
  `from→to` without an internal "past dates skipped" guard. If it guards, add a seeder-only
  `MaterializeHistoryAsync` (same projection, no future-only filter) rather than weakening the
  production regen contract. Do NOT let the nightly regen touch these rows — verify horizon logic is
  future-only (it is, per 005/008) so seeded past rows stay frozen.
- **Idempotency.** Re-running the seeder must not duplicate outcomes/notes/notifications. Key past
  visits by the existing unique `(route_stop_id, visit_date)`; guard note/notification inserts by a
  deterministic marker (e.g. seeded `created_at` window or a count check) as other modules do.
- **Publish dispatcher scope creep.** Keep `INotificationDispatcher` a thin mock (write rows only);
  do not build batching/delivery. A test asserts a row is written — nothing more.
- **Panel past-week read-only.** The schedule grid already guards past weeks as read-only (spec 007);
  ensure outcome coloring reuses that guard and does not re-enable editing on past weeks.
- **Test DB isolation.** New endpoint tests must use the isolated `EvoDb_ApiTests` factory pattern
  (DECISIONS.md 2026-07-17) so they don't wipe the dev seed data.
</content>
