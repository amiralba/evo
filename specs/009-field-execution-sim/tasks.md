# Tasks: Field Execution Simulation (009-field-execution-sim)

<!-- Granularity rule: each task ≈ 2–5 minutes, doable with NO project context.
     Every task names exact files and how to verify. [P] = parallelizable with adjacent [P].
     Q1/Q2/Q5/Q6 CONFIRMED 2026-07-17 (Q1/Q2 diverged from the planner's recommendation — see
     spec.md Clarifications). Q3/Q4/Q7/Q8/Q9 use recommended defaults, not separately re-asked. -->

## Phase 1 — Realized-visit model + location-ping stream (backend)

### Task 1: Add VisitOutcomeReason enum
- Files: `backend/src/Evo.Infrastructure/Routing/VisitOutcomeReason.cs` (new)
- Do: `public enum VisitOutcomeReason : byte { StoreClosed = 1, NoAccess = 2, AgentAbsent = 3, TimeConstraint = 4, Rescheduled = 5, Other = 6 }`. Turkish UI labels live in the panel i18n, not here (identifiers stay English).
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 2 [P]: VisitRealization entity (separate table, 1:1 with PlannedVisit)
- Files: `backend/src/Evo.Infrastructure/Routing/VisitRealization.cs` (new)
- Do: `public class VisitRealization { public Guid Id; public Guid PlannedVisitId; public DateTimeOffset? CheckInAt; public DateTimeOffset? CheckOutAt; public int? ActualMinutes; public VisitOutcomeReason? OutcomeReason; }`. No lat/lng here — check-in location is derived from `MerchandiserLocationPing` at read time (Clarification Q1/Q2, user-confirmed 2026-07-17). `planned_visit.Status` (existing) remains the outcome source of truth.
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 3 [P]: MerchandiserLocationPing entity (continuous stream, no FK to visit)
- Files: `backend/src/Evo.Infrastructure/People/MerchandiserLocationPing.cs` (new)
- Do: `public class MerchandiserLocationPing { public Guid Id; public Guid MerchandiserId; public double Lat; public double Lng; public DateTimeOffset RecordedAt; }`. Plain doubles, no NetTopologySuite (Clarification Q2). Independent of `PlannedVisit`/`TaskInstance` — a raw location-history stream, pulling M4's live-location groundwork into M3 per user decision.
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 4: Configure both new entities in DbContext
- Files: `backend/src/Evo.Infrastructure/EvoDbContext.cs`
- Do: add `DbSet<VisitRealization> VisitRealizations` and `DbSet<MerchandiserLocationPing> LocationPings`; in `OnModelCreating`: `VisitRealization` — `ToTable("visit_realization")`, unique index on `PlannedVisitId`, FK→`PlannedVisit` (`OnDelete(DeleteBehavior.Cascade)` — realization is meaningless without its visit); `MerchandiserLocationPing` — `ToTable("merchandiser_location_ping")`, FK→`Merchandiser` (`OnDelete(DeleteBehavior.Cascade)`), index on `(MerchandiserId, RecordedAt)` (the nearest-ping lookup's hot path).
- Verify: `dotnet build backend/Evo.sln` compiles.
- Status: [x]

### Task 5: Create the migration
- Files: migration under `backend/src/Evo.Infrastructure/Migrations/` (generated)
- Do: `dotnet ef migrations add AddVisitRealizationAndLocationPings --project backend/src/Evo.Infrastructure --startup-project backend/src/Evo.Api`
- Verify: migration file creates both tables with the indexes from Task 4; `dotnet build backend/Evo.sln` regenerates `contracts/openapi.json` with no error.
- Status: [x]

### Task 6: Extend PlannedVisitDto with status + realized fields + checkInLocation
- Files: `backend/src/Evo.Api/Routing/Dtos/PlanDtos.cs`
- Do: add to `PlannedVisitDto`: `PlannedVisitStatus Status`, `DateTimeOffset? CheckInAt`, `DateTimeOffset? CheckOutAt`, `int? ActualMinutes`, `VisitOutcomeReason? OutcomeReason`, `LocationPointDto? CheckInLocation` (keep existing fields). Add a small `public record LocationPointDto(double Lat, double Lng)` in the same file.
- Verify: build compiles.
- Status: [x]

### Task 7: Map realized fields + nearest-ping lookup in the plan endpoint projection
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs` (the plan/day projection that builds `PlannedVisitDto`)
- Do: left-join `PlannedVisit` → `VisitRealization` (by `PlannedVisitId`); pass `pv.Status`, `realization?.CheckInAt/CheckOutAt/ActualMinutes/OutcomeReason` through. For each visit with a non-null `CheckInAt`, query the nearest `MerchandiserLocationPing` (by `RecordedAt`, same `MerchandiserId`) within e.g. ±30 min and map to `LocationPointDto`; null if none found or visit has no check-in.
- Verify: build compiles; `grep -n "new PlannedVisitDto" backend/src/Evo.Api/Controllers/RoutesController.cs` shows the new args.
- Status: [x]

### Task 8: GET /merchandisers/{id}/location-history endpoint
- Files: `backend/src/Evo.Api/Controllers/MerchandisersController.cs` (or wherever `/merchandisers/{id}/day` already lives — `grep -rn "merchandisers/{id}/day" backend/src/Evo.Api`)
- Do: `[HttpGet("{id:guid}/location-history")] GET` with `[FromQuery] DateTimeOffset from, [FromQuery] DateTimeOffset to`, paged (`page`/`pageSize`, mirror `PagedResult<T>` convention). Scope: Supervisor → any merchandiser; FieldAgent → self only (403 otherwise), same pattern as `/day`. Returns pings newest-first as `LocationPingDto(DateTimeOffset RecordedAt, double Lat, double Lng)`.
- Verify: `dotnet build backend/Evo.sln`.
- Status: [x]

### Task 9: Unit test — realized fields + nearest-ping round-trip through the plan endpoint
- Files: `backend/tests/Evo.Tests/Routing/PlanRealizedFieldsTests.cs` (new)
- Do: seed a `PlannedVisit` with `Status=Done`, a `VisitRealization` row (`CheckInAt`/`CheckOutAt` set, `ActualMinutes=35`), and 2-3 `MerchandiserLocationPing` rows around the check-in time; call the plan read path; assert the DTO carries the realized fields AND `CheckInLocation` matches the nearest ping (not just any ping). Use the isolated `EvoApiTestFactory`/`EvoDb_ApiTests` pattern.
- Verify: `dotnet test backend/Evo.sln --filter PlanRealizedFieldsTests` passes.
- Status: [x]

### Task 10: Endpoint test — GET /merchandisers/{id}/location-history scoping
- Files: `backend/tests/Evo.Tests/People/LocationHistoryEndpointTests.cs` (new)
- Do: seed pings for a merchandiser; Supervisor can read any agent's history; FieldAgent reading their own → 200; FieldAgent reading another agent's → 403.
- Verify: `dotnet test backend/Evo.sln --filter LocationHistoryEndpointTests` passes.
- Status: [x]

## Phase 2 — Task result payloads

### Task 11: Define pure TaskResult record set
- Files: `backend/src/Evo.Domain/Tasks/TaskResult.cs` (new)
- Do: records — `PhotoRef(string ObjectKey, string Url)`; `TaskResultNone(DateTimeOffset CompletedAt, string? Note)`; `TaskResultPhoto(DateTimeOffset CompletedAt, IReadOnlyList<PhotoRef> Photos)`; `TaskResultForm(DateTimeOffset CompletedAt, IReadOnlyDictionary<string,string> Answers)`. Pure — no EF/DB references.
- Verify: build compiles; file has no `using Microsoft.EntityFrameworkCore`.
- Status: [x]

### Task 12: Add a TaskResult (de)serialization helper
- Files: `backend/src/Evo.Domain/Tasks/TaskResultJson.cs` (new)
- Do: static `Serialize(object result)` / `TryDeserialize(string json, ProofRequired proof)` using `System.Text.Json`, mapping proof type → concrete record. Locate the existing `ProofRequired` enum first (`grep -rn "enum ProofRequired" backend/src`).
- Verify: build compiles.
- Status: [x]

### Task 13 [P]: Unit test — TaskResult JSON round-trip per proof type
- Files: `backend/tests/Evo.Tests/Tasks/TaskResultJsonTests.cs` (new)
- Do: serialize each of the three records, deserialize with the matching `ProofRequired`, assert equality (photos list, answers dict preserved).
- Verify: `dotnet test backend/Evo.sln --filter TaskResultJsonTests` passes.
- Status: [x]

### Task 14: Surface ResultJson + status on the task read DTO
- Files: `backend/src/Evo.Api/Controllers/TaskInstancesController.cs` and its DTO (find the task-instance/task-plan DTO via `grep -rn "TaskInstanceDto\|task-plan" backend/src/Evo.Api`)
- Do: ensure the task read DTO exposes `Status` and `ResultJson` (raw string is fine for the panel to parse). Add if missing.
- Verify: build compiles; `contracts/openapi.json` (after build) includes the result field on the task DTO.
- Status: [x]

## Phase 3 — Note entity + inbox API

### Task 15: Add Note enums
- Files: `backend/src/Evo.Infrastructure/Notes/NoteEnums.cs` (new)
- Do: `enum NoteAnchorType : byte { Store=1, Visit=2, Day=3, General=4 }`, `enum NoteKind : byte { Note=1, ChangeRequest=2 }`, `enum NoteStatus : byte { Open=1, Acknowledged=2, Resolved=3 }`.
- Verify: build compiles.
- Status: [x]

### Task 16: Add Note entity
- Files: `backend/src/Evo.Infrastructure/Notes/Note.cs` (new)
- Do: `Guid Id`, `Guid? AuthorId`, `NoteAnchorType AnchorType`, `Guid? AnchorId`, `NoteKind Kind`, `string Body`, `NoteStatus Status`, `DateTimeOffset CreatedAt`, `DateOnly? AnchorDay` (for Day anchor).
- Verify: build compiles.
- Status: [x]

### Task 17: Register Note DbSet + config
- Files: `backend/src/Evo.Infrastructure/EvoDbContext.cs`
- Do: add `public DbSet<Note> Notes => Set<Note>();` (with `using Evo.Infrastructure.Notes;`); in `OnModelCreating` add `builder.Entity<Note>` → `ToTable("note")`, `Body` `nvarchar(max)`, indexes `(AnchorType, AnchorId)` and `(Status, Kind)`, FK `AuthorId`→`ApplicationUser` `OnDelete(NoAction)` nullable.
- Verify: build compiles.
- Status: [x]

### Task 18: Create the Note migration
- Files: generated migration
- Do: `dotnet ef migrations add AddNote --project backend/src/Evo.Infrastructure --startup-project backend/src/Evo.Api`
- Verify: migration creates table `note` with the two indexes; build passes.
- Status: [x]

### Task 19: Add Note DTOs
- Files: `backend/src/Evo.Api/Notes/NoteDtos.cs` (new)
- Do: `record NoteDto(Guid Id, Guid? AuthorId, string? AuthorName, NoteAnchorType AnchorType, Guid? AnchorId, string? AnchorLabel, NoteKind Kind, string Body, NoteStatus Status, DateTimeOffset CreatedAt)`; `record UpdateNoteStatusRequest(NoteStatus Status)`.
- Verify: build compiles.
- Status: [x]

### Task 20: Add NotesController — GET inbox
- Files: `backend/src/Evo.Api/Controllers/NotesController.cs` (new)
- Do: `[Authorize(Roles = "Supervisor")]`; `GET /notes?status=&kind=&anchorType=` returns `NoteDto[]` newest-first, filters applied when provided. Resolve `AuthorName` from the user, `AnchorLabel` from the store/visit when resolvable (best-effort).
- Verify: build compiles; endpoint appears in `contracts/openapi.json` after build.
- Status: [x]

### Task 21: Add NotesController — PATCH status
- Files: `backend/src/Evo.Api/Controllers/NotesController.cs`
- Do: `PATCH /notes/{id}` with `UpdateNoteStatusRequest`; allowed transitions Open→Acknowledged→Resolved (and Open→Resolved); illegal transition throws `EvoValidationException` (422); write an `audit_log` entry via `IAuditWriter` (`EntityType="Note"`). Return updated `NoteDto`.
- Verify: build compiles.
- Status: [x]

### Task 22: Endpoint tests — notes inbox + transition
- Files: `backend/tests/Evo.Tests/Notes/NoteEndpointTests.cs` (new)
- Do: assert GET returns seeded notes filtered by status; FieldAgent gets 403 on GET; PATCH Open→Acknowledged succeeds; Resolved→Open → 422. Use isolated test DB factory.
- Verify: `dotnet test backend/Evo.sln --filter NoteEndpointTests` passes.
- Status: [x]

## Phase 4 — Notification entity + mock dispatcher

### Task 23: Add Notification entity
- Files: `backend/src/Evo.Infrastructure/Notifications/Notification.cs` (new)
- Do: `Guid Id`, `Guid MerchandiserId`, `string PayloadJson`, `DateTimeOffset CreatedAt`, `DateTimeOffset? ReadAt`.
- Verify: build compiles.
- Status: [x]

### Task 24: Register Notification DbSet + config
- Files: `backend/src/Evo.Infrastructure/EvoDbContext.cs`
- Do: `DbSet<Notification> Notifications`; `builder.Entity<Notification>` → `ToTable("notification")`, `PayloadJson` `nvarchar(max)`, FK `MerchandiserId`→`Merchandiser` `OnDelete(NoAction)`, index `(MerchandiserId, CreatedAt)`.
- Verify: build compiles.
- Status: [x]

### Task 25: Create the Notification migration
- Files: generated migration
- Do: `dotnet ef migrations add AddNotification --project backend/src/Evo.Infrastructure --startup-project backend/src/Evo.Api`
- Verify: migration creates `notification`; build passes.
- Status: [x]

### Task 26: Define INotificationDispatcher + mock impl
- Files: `backend/src/Evo.Api/Notifications/INotificationDispatcher.cs` + `MockNotificationDispatcher.cs` (new)
- Do: `Task DispatchPublishAsync(Guid routeId, string diffSummary, CancellationToken ct)`; mock resolves the route's active assignment → merchandiser and writes one `Notification` row (`PayloadJson` = `{ "summary": diffSummary }`, `ReadAt=null`). Register in DI (`Program.cs`, scoped).
- Verify: build compiles; `grep -n "INotificationDispatcher" backend/src/Evo.Api/Program.cs` shows the registration.
- Status: [x]

### Task 27: Fire the dispatcher from publish
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs` (the `POST /routes/{id}/publish` action)
- Do: after a successful publish, call `dispatcher.DispatchPublishAsync(routeId, summary, ct)` with a short diff summary string. Keep it non-blocking to the publish result (log-and-continue on dispatcher failure).
- Verify: build compiles.
- Status: [x]

### Task 28: Add NotificationsController — GET receipts
- Files: `backend/src/Evo.Api/Controllers/MerchandisersController.cs` (add action) or new `NotificationsController.cs`
- Do: `GET /merchandisers/{id}/notifications` → `NotificationDto[]` newest-first; scoping mirrors `/merchandisers/{id}/day` (Supervisor any, FieldAgent self else 403). Add `record NotificationDto(Guid Id, string PayloadJson, DateTimeOffset CreatedAt, DateTimeOffset? ReadAt)`.
- Verify: build compiles; endpoint in `contracts/openapi.json`.
- Status: [x]

### Task 29: Endpoint tests — publish writes a notification; scoping enforced
- Files: `backend/tests/Evo.Tests/Notifications/NotificationEndpointTests.cs` (new)
- Do: publish an assigned route → assert exactly one notification row for the assigned merchandiser; GET as that agent returns it; GET another agent's notifications as FieldAgent → 403. Isolated test DB.
- Verify: `dotnet test backend/Evo.sln --filter NotificationEndpointTests` passes.
- Status: [x]

## Phase 5 — Seeder extension

### Task 30: Confirm the past-history materialization path (Q8)
- Files: `backend/src/Evo.Infrastructure/Routing/PlanGenerationService.cs` (read only)
- Do: inspect the range method (`RegenerateFutureAsync(routeId, from, to)`) — confirm it iterates `from→to` without skipping past dates. Record the finding in a top-of-file comment in the new seeder module (Task 31). If it guards against past dates, add a seeder-only `MaterializeHistoryAsync(routeId, from, to)` that reuses the same projection without the future-only filter.
- Verify: note the decision in the module; build compiles.
- Status: [ ]

### Task 31: Scaffold FieldExecutionSeederModule + register
- Files: `backend/src/Evo.Seeder/Modules/FieldExecutionSeederModule.cs` (new); `backend/src/Evo.Seeder/Program.cs`
- Do: implement `ISeederModule` (`Name="FieldExecution"`); register it LAST in the `modules` list in `Program.cs` (after `TaskRuleSeederModule`). Empty `SeedAsync` body for now.
- Verify: `dotnet run --project backend/src/Evo.Seeder -- --profile demo` prints `Seeding module: FieldExecution`.
- Status: [ ]

### Task 32: Materialize past history per active route
- Files: `FieldExecutionSeederModule.cs`
- Do: for each active route, materialize `planned_visit` rows for `[today − (demo:21 / scale:28) days, today − 1]` using the Task-30 path; idempotent via the unique `(route_stop_id, visit_date)`.
- Verify: after run, `SELECT COUNT(*) FROM planned_visit WHERE visit_date < CAST(GETDATE() AS date)` > 0.
- Status: [ ]

### Task 33: Assign outcome distribution to past visits
- Files: `FieldExecutionSeederModule.cs`
- Do: for each past visit, set `PlannedVisit.Status` ~85% Done / ~8% Missed / ~7% Skipped (deterministic via `faker.Random`). Skip rows already realized (idempotency: only update `Status == Planned`).
- Verify: `SELECT status, COUNT(*) FROM planned_visit WHERE visit_date < CAST(GETDATE() AS date) GROUP BY status` shows all three outcomes.
- Status: [ ]

### Task 34: Seed VisitRealization rows (check-in/out time, actual duration, outcome reason)
- Files: `FieldExecutionSeederModule.cs`
- Do: for each past **Done** visit, insert a `VisitRealization` row: `CheckInAt` = planned start ± jitter (0–20 min), `CheckOutAt` = CheckIn + (planned duration ± jitter), `ActualMinutes` = (CheckOut − CheckIn) in minutes, `OutcomeReason = null`. For **Missed/Skipped** visits, insert a `VisitRealization` row with `CheckInAt/CheckOutAt/ActualMinutes = null` and `OutcomeReason` set from `VisitOutcomeReason` (weighted toward `StoreClosed`/`AgentAbsent`/`Rescheduled`). No lat/lng written here — that lives in the location-ping stream (Task 35).
- Verify: `SELECT COUNT(*) FROM visit_realization` > 0; `SELECT COUNT(*) FROM visit_realization WHERE check_in_at IS NOT NULL AND actual_minutes IS NULL` = 0 (every check-in has a duration).
- Status: [ ]

### Task 35: Seed continuous location-ping stream per merchandiser
- Files: `FieldExecutionSeederModule.cs`
- Do: for every merchandiser with an active assignment over the seeded past window, generate `MerchandiserLocationPing` rows roughly every 10–15 minutes during working hours (~09:00–18:00) each seeded workday — a realistic route: start near the merchandiser's `HomeLocation`, walk through each day's Done-visit stores in sequence (jittered ~50–150m around each `Store.Location`, reading `.Y`=lat/`.X`=lng), with a few pings between stops to simulate travel. Dense enough that every Done visit's `CheckInAt` (Task 34) has a ping within ±15 min for the nearest-ping lookup (Task 7) to resolve. Idempotent (skip if pings already exist for that merchandiser/date range).
- Verify: `SELECT COUNT(*) FROM merchandiser_location_ping` is large (thousands, not dozens) for the `demo` profile; spot-check a Done visit's check-in time has a ping within 15 minutes.
- Status: [ ]

### Task 36: Flip past task instances to Done with results
- Files: `FieldExecutionSeederModule.cs`
- Do: for `TaskInstance` rows on past **Done** visits, set `Status=Done` and `ResultJson` via `TaskResultJson.Serialize` matching the template's `ProofRequired`: None→note, Photo→1–3 seeded `PhotoRef` (`visits/{visitId}/{taskId}/{n}.jpg` + fake URL), Form→2–3 Turkish answer pairs. Missed/Skipped visit tasks stay Pending/Overdue.
- Verify: `SELECT COUNT(*) FROM task_instance WHERE result_json IS NOT NULL` > 0; JSON parses.
- Status: [ ]

### Task 37: Seed notes across all anchor types
- Files: `FieldExecutionSeederModule.cs`
- Do: insert ≥ 8 `Note` rows — a mix of STORE (anchor a real store id), VISIT (a real past visit id), DAY (`AnchorDay`), GENERAL; mix NOTE/CHANGE_REQUEST and OPEN/ACKNOWLEDGED/RESOLVED; Turkish bodies (e.g. "Mağaza müdürü perşembe servis istemiyor"); `AuthorId` = a field-agent user. Idempotent (skip if a seed-marker count already present).
- Verify: `SELECT COUNT(*) FROM note` ≥ 8; `GET /notes` returns them.
- Status: [ ]

### Task 38: Seed notifications per assigned merchandiser
- Files: `FieldExecutionSeederModule.cs`
- Do: for each merchandiser with an active assignment, insert ≥ 1 `Notification` (`PayloadJson` = a Turkish diff summary, e.g. `{"summary":"Çar: BİM Sincan eklendi, Kantin A çıkarıldı"}`), `ReadAt` = a mix of null/past. Idempotent.
- Verify: `SELECT COUNT(*) FROM notification` ≥ merchandiser count.
- Status: [ ]

### Task 39: Verify full seeder run on both profiles
- Files: —
- Do: run demo then `--profile scale --wipe`.
- Verify: both exit 0; re-running demo does not increase past-visit/note/notification counts (idempotency).
- Status: [ ]

## Phase 6 — Panel

### Task 40: Regenerate the typed API client
- Files: `panel/src/api/` (generated); run `cd panel && npm run generate-api-client`
- Do: regenerate after the backend contract changes (notes, notifications, plan DTO fields).
- Verify: `npm run generate-api-client` succeeds; new note/notification types present; `git diff` shows the generated client updated.
- Status: [ ]

### Task 41: Add planner API wrappers for notes + notifications
- Files: `panel/src/api/planner.ts` (or the matching api module)
- Do: add `getNotes(filters)`, `updateNoteStatus(id, status)`, `getNotifications(merchandiserId)` calling the generated client.
- Verify: `npm run lint` passes; functions typed against generated client.
- Status: [ ]

### Task 42: Color past-week schedule blocks by outcome
- Files: `panel/src/planner/components/**` (the schedule grid block component — find via `grep -rn "PlannedVisit\|sched" panel/src/planner`)
- Do: when the viewed week is in the past, color each block by `Status` (Done=green, Missed=red, Skipped=grey) using existing CSS/pill classes; keep the past-week read-only guard (spec 007) intact.
- Verify: `npm test` green; manual: browse a past week, blocks are colored.
- Status: [ ]

### Task 43: Planned-vs-realized tooltip on schedule blocks
- Files: same schedule block component
- Do: on hover of a realized block show check-in time + `actual N dk vs planned M dk` (Turkish strings from i18n).
- Verify: manual hover shows the tooltip; `npm test` green.
- Status: [ ]

### Task 44: Render task results in the Görevler tab
- Files: `panel/src/planner/components/panel/RouteDetailPanel.tsx` (Görevler tab, ~line 92) + task-row component
- Do: when a task instance has `Status=Done` + `ResultJson`, parse it and show a done check, photo count (thumbnail placeholders from the seeded URLs), or form-answer summary.
- Verify: `npm test` green; manual: a completed past visit shows results.
- Status: [ ]

### Task 45: Notes inbox component
- Files: `panel/src/planner/components/inbox/NotesInbox.tsx` (new) + route/entry into the workspace
- Do: list OPEN notes (with anchor label + body + kind), Acknowledge/Resolve buttons calling `updateNoteStatus`, TanStack Query invalidation on success. Reuse existing panel/list CSS classes.
- Verify: `npm test` green; manual: inbox lists seeded notes, ack/resolve updates them.
- Status: [ ]

### Task 46: Inbox count badge
- Files: the topbar component (find via `grep -rn "topbar" panel/src`)
- Do: show a badge with the OPEN notes count (from `getNotes({status:Open})`).
- Verify: badge shows the seeded OPEN count; `npm test` green.
- Status: [ ]

### Task 47: i18n strings
- Files: `panel/src/i18n/locales/tr.json`
- Do: add Turkish strings for outcome labels (Yapıldı/Yapılmadı/Atlandı), outcome reasons, "gerçekleşen/planlanan", inbox actions (Onayla/Çözüldü), task-result labels.
- Verify: `npm run lint`; no missing-key warnings for the new UI.
- Status: [ ]

### Task 48: Vitest — outcome coloring + inbox actions
- Files: `panel/src/**/__tests__/` (new tests near the components)
- Do: test that a past Done visit renders the done color/label; that clicking Resolve calls the mutation.
- Verify: `npm test` passes.
- Status: [ ]

### Task 49: Playwright — realized week + inbox smoke
- Files: `panel/e2e/field-execution.spec.ts` (new)
- Do: with seeded data, navigate to a past week (assert colored blocks), open the inbox (assert a note, resolve it).
- Verify: `npx playwright test field-execution` green.
- Status: [ ]

## Phase 7 — Docs + wrap

### Task 50: Update docs/DATABASE.md
- Files: `docs/DATABASE.md`
- Do: flip the `note, notification` schema-status row to ☑ (spec 009); add a `visit_realization`/`merchandiser_location_ping` row (new tables, not in the original design §5 schema-status list — flag as an M3 addition); add a section documenting `visit_realization` (1:1 with `planned_visit`), the continuous `merchandiser_location_ping` stream (pulled forward from M4 per user decision), `note`/`notification` tables, and `task_instance.result_json` now being typed/populated.
- Verify: the schema-status table and a new section reflect M3.
- Status: [ ]

### Task 51: Update docs/API.md
- Files: `docs/API.md`
- Do: document `GET /notes`, `PATCH /notes/{id}`, `GET /merchandisers/{id}/notifications`, the publish→notification behavior, and the extended `PlannedVisitDto`. Update the Mobile row (day/notifications now partly realized as seeded/mocked).
- Verify: endpoints listed with roles + shapes.
- Status: [ ]

### Task 52: Update docs/ARCHITECTURE.md
- Files: `docs/ARCHITECTURE.md`
- Do: note the field-execution simulation layer (seeded realized visits, `TaskResult` domain records, mock `INotificationDispatcher`) and where it sits.
- Verify: architecture doc mentions M3 components.
- Status: [ ]

### Task 53: Add a DECISIONS.md entry
- Files: `docs/DECISIONS.md`
- Do: newest-first entry recording: separate `visit_realization` table (not columns on `planned_visit` — user override of the planner's recommendation, 2026-07-17) with `planned_visit.status` staying the outcome source of truth; continuous `merchandiser_location_ping` stream (plain lat/lng, no NetTopologySuite) pulling M4's live-location groundwork into M3 per user decision, panel visualization still deferred to M4; seeded photo object keys (no real MinIO); mocked `INotificationDispatcher` on publish; notes seeder-only (no field create API); no new validation codes. Reference the confirmed Q1/Q2/Q5/Q6 and the recommended-default Q3/Q4/Q7/Q8/Q9.
- Verify: entry present, dated, newest-first.
- Status: [ ]

### Task 54: Flag the design doc build notes
- Files: `EVO-Route-Planning-Design.md` (§2.6, §2.11, §2.12, §6.2 if it describes agent_location)
- Do: add short build-note flags where M3 diverges (separate `visit_realization` table + continuous `merchandiser_location_ping` stream vs design's single realized-visit shape; mocked dispatcher vs FCM; notes seeded not field-authored). Never contradict §10 silently (CLAUDE.md rule 5).
- Verify: build-note flags present at each diverging section.
- Status: [ ]

### Task 55: Update ROADMAP.md M3
- Files: `docs/ROADMAP.md`
- Do: check the two M3 bullets `[x]` and add the spec reference `009-field-execution-sim` with a one-line summary; note that the location-ping data pipeline (`merchandiser_location_ping`) was pulled forward from M4 into M3 (user decision) but the map's live-location **visualization** stays M4; list what else stayed deferred (out-of-route visits, real FCM, planned-vs-realized analytics → M4).
- Verify: M3 section reflects completion + deferrals.
- Status: [ ]

### Task 56: Full test-suite + contract-drift check
- Files: —
- Do: `dotnet test backend/Evo.sln`; `cd panel && npm test && npx playwright test`; `dotnet build backend/Evo.sln` then confirm `git diff --exit-code contracts/openapi.json` is clean (regenerated in-session).
- Verify: backend + panel suites green; no uncommitted contract drift.
- Status: [ ]

### Task 57: Update CLAUDE.md current focus + docs/TODO.md
- Files: `CLAUDE.md` (Current focus), `docs/TODO.md`
- Do: mark M3 complete, set next milestone M4 (Analytics & Onarım); tick the M3 TODO line.
- Verify: both reflect M3 done / M4 next.
- Status: [ ]
</content>
