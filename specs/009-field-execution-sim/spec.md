# Spec: Field Execution Simulation   (slug: 009-field-execution-sim)

<!-- Copy this folder to specs/NNN-feature-name/ per feature. Owned by: planner. -->

## Problem & goal

The mobile field app is deferred out of current scope (DECISIONS.md 2026-07-15). But everything
*downstream* of the field — planned-vs-realized comparison, task results (photos/forms), the
supervisor's notes inbox, and change-notification receipts — is what proves the product's value
("prove field work with evidence", ROADMAP vision). M3 makes that whole downstream layer real
against **seeded/mocked** data instead of a live phone.

Today every `PlannedVisit` sits at `Status = Planned` forever — nothing writes `Done/Missed/Skipped`
(the enum exists, spec 005, but no producer). `TaskInstance.ResultJson` is a reserved-but-unused
column (spec 008). The `note` and `notification` tables from design §2.11/§2.12 do not exist
(DATABASE.md schema-status: `☐ M3`). The seeder only materializes **future** visits, so there is no
past history to realize.

M3 delivers:
1. A **realized-visit model**: a new `visit_realization` table (1:1 with `planned_visit`) carries
   check-in/check-out time, actual duration, and an outcome reason for past visits (the outcome enum
   `Done/Missed/Skipped` stays on the existing `planned_visit.status`). A new **continuous**
   `merchandiser_location_ping` table (high-volume, many rows per agent per working day) supplies GPS
   history — pulling M4's "live-location layer" data groundwork into M3 per user decision
   (2026-07-17); each visit's check-in point is the nearest ping to its check-in time, not a
   one-off column. The panel's live-map *visualization* of this stream stays M4 — M3 only builds the
   data pipeline (seeder + read endpoint), not a map layer.
2. **Task results**: `TaskInstance.ResultJson` gets a defined per-proof-type shape (None/Photo/Form),
   and past instances flip to `Done` (or stay `Overdue`) with a result payload.
3. A **Note** entity + supervisor **inbox** (read + acknowledge/resolve) — the field agent's only
   write channel, here produced by the seeder.
4. A **Notification** entity + mocked "would-have-sent" receipts (seeded, plus a mock dispatcher
   fired on publish) with read/unread state.
5. **Seeder** extension producing realistic past history + outcomes + results + notes + notifications.
6. **Panel** read surfaces: past-week schedule blocks colored by outcome with a planned-vs-realized
   tooltip, task results in the Görevler tab, and a notes inbox with acknowledge/resolve.

Success: after `dotnet run --project backend/src/Evo.Seeder -- --profile demo`, a supervisor
browsing a **past** week sees Done/Missed/Skipped visits with check-in times and actual durations,
opens a completed visit's Görevler tab and sees photo/form results, and works a non-empty notes inbox.

## Brainstorm results

- **Chosen approach:** a new `visit_realization` table, 1:1 with `planned_visit` (FK unique), holds
  `CheckInAt`/`CheckOutAt`/`ActualMinutes`/`OutcomeReason` — the existing `planned_visit.status`
  (`Done/Missed/Skipped`, spec 005) remains the single source of truth for outcome, unchanged. A new
  `merchandiser_location_ping` table (`MerchandiserId`, `Lat`, `Lng`, `RecordedAt`) is a continuous,
  high-volume stream (many rows per agent per working day) — **not** a single check-in column — per
  user decision (2026-07-17) to pull M4's live-location groundwork into M3 now rather than seed just
  one point per visit. Each visit's "check-in location" for the panel tooltip is computed as the
  nearest ping to `CheckInAt` (a query, not a stored duplicate). Task results use the already-reserved
  `TaskInstance.ResultJson` (typed by a pure `Evo.Domain.Tasks.TaskResult` record set). `note`/
  `notification` are two new small tables per design §5. Field behavior is produced entirely by a new
  `FieldExecutionSeederModule` (Bogus, Turkish locale) — no live agent API. A thin mocked
  `INotificationDispatcher` fires notification rows on publish so the panel can show a receipt after a
  real publish action.
- **Alternatives rejected:**
  - *Realized columns directly on `planned_visit`* — rejected per user feedback (2026-07-17): a
    separate `visit_realization` table keeps "the promise" (`planned_visit`) and "reality" cleanly
    separated, which matters once realized data grows large (continuous location pings) or needs its
    own retention/lifecycle later.
  - *A single `CheckInLat`/`CheckInLng` column pair per visit* — rejected per user feedback: the user
    wants actual location **history**, not one point, and explicitly asked for the continuous-ping
    table now rather than deferring it to M4. `visit_realization` holds no lat/lng at all; check-in
    location is derived from `merchandiser_location_ping` at read time.
  - *NetTopologySuite `geography` point for each ping* (like `store.Location`) — rejected for M3: a
    plain `lat/lng` double pair is enough for a map dot / distance-from-store math; upgrade to
    `geography` only if M4's live-map layer needs spatial queries (bbox, nearest-store, etc.).
  - *Real MinIO photo uploads for task results* — rejected: mobile capture is deferred, so there is no
    real byte source. M3 seeds realistic **object keys + URLs** (`visits/{visitId}/{taskId}/n.jpg`);
    wiring real MinIO upload is a mobile-revival concern.
  - *A live "planned vs realized" analytics panel with metrics/variance charts* — deferred to M4
    (Analytics), which owns the Planning-Evidence panel. M3's panel work is read surfaces only.
- **Later (out of M3 scope):** the panel's **live-map visualization** of the location-ping stream
  (a rendered agent-location layer on the map pane) — M3 builds the data pipeline only, M4 renders it;
  out-of-route visits (visits with no `planned_visit` row) and the out-of-route analytics; real push
  delivery/ack loop (FCM); notification batching windows; the field-agent create-note API (mobile);
  variance/completion-% analytics and the Planning-Evidence panel (→ M4); Conflict Center.

## User stories

- As a supervisor, when I browse a **past** week I see each visit's outcome (Yapıldı / Yapılmadı /
  Atlandı) with its check-in time and actual duration vs the planned duration, so I can see what
  really happened versus what was planned.
- As a supervisor, I open a completed visit's **Görevler** tab and see each task's result — a done
  check, photo thumbnails (seeded refs), or form answers — so I can verify the work was done.
- As a supervisor, I have an **inbox** of notes/change-requests from the field (anchored to a store,
  visit, or day), and I can **acknowledge** or **resolve** each one, so the request→ack loop replaces
  phone calls.
- As a supervisor, after I **publish** a week's changes, a notification receipt is recorded per
  affected agent (mocked), so there is evidence the agent would have been informed.
- As a developer, one seeder run produces realistic past outcomes, task results, notes, and
  notifications so every downstream feature (and M4 analytics) has data to develop against.

## Acceptance criteria (testable)

Realized-visit model (backend, `Evo.Tests/Routing/`):
- [ ] New `visit_realization` table: `Id`, `PlannedVisitId` (FK, unique), `CheckInAt`, `CheckOutAt`,
      `ActualMinutes` (all nullable), `OutcomeReason` (`VisitOutcomeReason?`) — one EF migration;
      existing `planned_visit` rows are unaffected (`Status` stays `Planned`, no realization row yet).
- [ ] New `merchandiser_location_ping` table: `Id`, `MerchandiserId` (FK), `Lat`, `Lng`, `RecordedAt` —
      no FK to any visit (continuous stream, independent of the visit/task model) — same migration.
- [ ] `GET /routes/{id}/plan?week=` for a **past** week returns each visit's `Status`, realized timing,
      `ActualMinutes`, and a `checkInLocation` computed as the nearest ping (by `RecordedAt`) to that
      visit's `CheckInAt` for the visit's `MerchandiserId`, via `PlannedVisitDto` (new fields); a future
      week returns them null.
- [ ] A `Done` visit has a `visit_realization` row with non-null `CheckInAt`/`CheckOutAt` and
      `ActualMinutes = CheckOut − CheckIn` (± seeded jitter); a `Missed`/`Skipped` visit has null
      check-in/out and a non-null `OutcomeReason`.
- [ ] `GET /merchandisers/{id}/location-history?from=&to=` returns that agent's pings in the range,
      newest first (paged); Supervisor: any agent, FieldAgent: self only (403 otherwise) — mirrors the
      existing `/merchandisers/{id}/day` scoping. No panel UI renders this in M3 (data pipeline only).

Task results (`Evo.Tests/Tasks/`):
- [ ] `Evo.Domain.Tasks.TaskResult` records serialize/deserialize the three shapes: `None`
      (`{completedAt, note?}`), `Photo` (`{completedAt, photos:[{objectKey,url}]}`), `Form`
      (`{completedAt, answers:{...}}`); a round-trip test asserts each.
- [ ] A `Done` `TaskInstance` has non-null `ResultJson` whose shape matches its template's
      `ProofRequired`; the resolved endpoint (`GET /stores/{id}/task-plan` / task read) surfaces it.

Notes (`Evo.Tests/Notes/`):
- [ ] `POST`-free by design in M3, but `GET /notes?status=&kind=&anchorType=` returns the supervisor
      inbox filtered; Supervisor-only (FieldAgent 403 on the inbox list).
- [ ] `PATCH /notes/{id}` with `{status: Acknowledged|Resolved}` transitions the note and returns it;
      illegal transition (e.g. Resolved→Open) → 422; writes an `audit_log` entry.

Notifications (`Evo.Tests/Notifications/`):
- [ ] `GET /merchandisers/{id}/notifications` returns that agent's receipts (newest first) with
      `ReadAt` state; Supervisor: any agent, FieldAgent: self only (403 otherwise) — mirrors the
      existing `/merchandisers/{id}/day` scoping.
- [ ] Publishing a route (`POST /routes/{id}/publish`) writes one mocked notification per affected
      assigned merchandiser via `INotificationDispatcher`; a test asserts a row is created.

Seeder (`--profile demo`):
- [ ] The seeder materializes **past** history (≥ 3 weeks back per active route) as frozen
      `planned_visit` rows with outcomes distributed ~85% Done / ~8% Missed / ~7% Skipped, each Done
      visit getting a `visit_realization` row with realistic reasons-for-non-Done on the other 15%,
      and actual durations jittered around planned.
- [ ] The seeder generates a continuous `merchandiser_location_ping` stream for every seeded
      merchandiser over the same past window — roughly one ping every 10-15 minutes during their
      working hours (~09:00-18:00) each seeded workday — dense enough that every `Done` visit's
      check-in time has a nearby ping.
- [ ] Every past `Done` visit's `TaskInstance` rows are flipped to `Done` with a `ResultJson`
      matching each template's `ProofRequired`.
- [ ] The seeder inserts ≥ 8 notes across all four anchor types (STORE/VISIT/DAY/GENERAL), a mix of
      NOTE/CHANGE_REQUEST and OPEN/ACKNOWLEDGED/RESOLVED, and ≥ 1 notification per assigned merchandiser.
- [ ] The run is idempotent (re-running does not duplicate outcomes/notes) and completes without error
      on both `demo` and `scale` profiles.

Panel (`panel/`, Vitest + one Playwright check):
- [ ] On a **past** week, schedule blocks are colored by outcome (done/missed/skipped) and a
      tooltip/hover shows check-in time + `actual vs planned` minutes (no map/location rendering in
      M3 — the location-ping data is queryable via API only, per the deferred live-map layer).
- [ ] The Görevler tab renders task results for a completed visit (done check / photo count / form
      answer summary).
- [ ] A **Notes inbox** view lists OPEN notes with anchor context and Acknowledge/Resolve actions that
      call `PATCH /notes/{id}` and refresh; an inbox count badge shows the OPEN total.

## Clarifications

<!-- Filled by the clarify step BEFORE planning. Q asked → answer given.
     Answers below are the planner's RECOMMENDED defaults, pending user confirmation. -->
| # | Question | Answer (CONFIRMED 2026-07-17) |
|---|---|---|
| 1 | Separate `visit` (realized) table, or realized columns on `planned_visit`? | **CONFIRMED — separate `visit_realization` table** (1:1, FK unique to `planned_visit`), holding `CheckInAt/CheckOutAt/ActualMinutes/OutcomeReason`. `planned_visit.status` (Done/Missed/Skipped) stays the outcome source of truth, unchanged from spec 005. User's rationale: keep "the promise" and "reality" cleanly separated, especially since location data is now a growing continuous stream, not a single column. |
| 2 | GPS check-in: NetTopologySuite `geography` point, plain lat/lng, or continuous history? | **CONFIRMED — continuous history via a new `merchandiser_location_ping` table** (plain `double` lat/lng + `RecordedAt`, no spatial type), pulling M4's live-location-layer data groundwork into M3 (user decision 2026-07-17). Not a single per-visit check-in point — a real ping stream per agent per workday. A visit's "check-in location" is derived at read time as the nearest ping to `CheckInAt`. The panel does **not** render this as a map layer in M3 (that visualization stays M4) — only a read API (`GET /merchandisers/{id}/location-history`) exists. |
| 3 | `TaskInstance.ResultJson` shape per proof type? | **Typed via `Evo.Domain.Tasks.TaskResult`:** None=`{completedAt,note?}`, Photo=`{completedAt,photos:[{objectKey,url}]}`, Form=`{completedAt,answers:{code:value}}`. Photos are **seeded object keys + fake URLs** (no real MinIO upload — mobile capture deferred). |
| 4 | Is `note` a new entity, and who creates notes in M3? | **Yes, new `note` table** (design §2.11). In M3 notes are **seeder-produced only** (field agent create-note API is mobile, deferred). Supervisor can read + acknowledge/resolve via `GET/PATCH /notes`. |
| 5 | How are notification receipts mocked? | **CONFIRMED — real `notification` table** + a thin `INotificationDispatcher` (mock impl) that writes one row per affected assigned merchandiser on `POST /routes/{id}/publish`, plus seeder backfill. `ReadAt` seeded to a mix of read/unread. No real push/FCM. |
| 6 | Does M3 need new panel UI, or is it backend+seeder only? | **CONFIRMED — minimal new panel UI:** past-week outcome coloring + planned-vs-realized tooltip, task-result display in Görevler, and a notes inbox with ack/resolve. No location/map rendering. Full analytics/variance panel is M4. |
| 7 | Does seeded GPS/outcome data unblock any deferred validation codes (V8/V13/V15)? | **No.** V13/V15 (travel-time feasibility) still need OSRM; V8 stays deferred without a successor. M3 adds **no new validation codes** — realized data feeds monitoring/analytics (M4), not the publish gate. |
| 8 | The seeder only makes future visits today — how do we get past history? | **Materialize a past window** ([today−N days, today−1]) as frozen `planned_visit` rows, then write outcomes onto them. The nightly regen only touches the future, so seeded past rows stay frozen (design §2.6). Verify `PlanGenerationService`'s range method accepts a past window; if it guards against past dates, add a seeder-only history-materialization path. |
| 9 | Should past outcomes respect the "never touch past-dated rows on regen" rule? | **Yes — seeded outcomes ARE the frozen history.** Realization is the one legitimate write to a past row; plan **regeneration** must continue to never touch past rows (unchanged from 005/008). |

## Non-goals

- No real mobile app, no live agent check-in API, no field-agent create-note/create-result endpoints
  (all mobile — deferred). Field behavior is seeded/mocked only.
- No panel map/live-location layer rendering the ping stream — the `merchandiser_location_ping` table
  and read API exist (pulled forward from M4 per user decision), but visualizing it on the map pane
  stays M4.
- No real MinIO photo uploads / real image bytes — seeded object keys + fake URLs only.
- No real push notifications / FCM / delivery-ack loop / batching window — mocked receipts only.
- No out-of-route visits (visits without a `planned_visit` row) or out-of-route analytics — later.
- No planned-vs-realized **analytics** (completion %, variance charts, Planning-Evidence panel) — M4.
- No new validation codes; no change to the Baseline+Patch model, 450-min rule, or publish gate
  (publish only additionally fires the mocked notification dispatcher).
- No Conflict Center / Sorun Merkezi (still deferred).

## Open questions
- Q1, Q2, Q5, Q6 confirmed by user 2026-07-17 (Q1/Q2 diverged from the planner's recommendation —
  see rationale in the Clarifications table and Brainstorm results above). Q3/Q4/Q7/Q8/Q9 use the
  planner's recommended defaults, accepted implicitly (not separately re-asked — lower-leverage,
  and the user's Q1/Q2 pushback didn't touch them). Flag before Phase 5 (seeder) if any turn out
  wrong once Phase 1's schema is in place.
- KVKK/retention on seeded GPS check-in points is out of scope here but flagged for the deployment/IT
  question set (retention policy on realized location data).
</content>
</invoke>
