# Spec: Analytics & Onarım   (slug: 010-analytics-onarim)

<!-- Copy this folder to specs/NNN-feature-name/ per feature. Owned by: planner. -->
<!-- This is M4 — the final milestone in docs/ROADMAP.md. Two features:
     (1) Planning Evidence panel + plan-health metrics (planned-vs-realized analytics)
     (2) Onarım (absence-repair) decision workbench.
     M4 READS/AGGREGATES data that M1/M2/M3 already built — it does not reinvent the schema.
     Already-built inputs (do NOT redesign): visit_realization + merchandiser_location_ping (spec 009),
     TaskInstance.ResultJson / task_instance.status (008/009), planned_visit.status outcome (005/009),
     audit_log / route_change_log facade (003/005), assignment dated history (005), patch (005),
     decision_journal (005). -->

## Problem & goal

M1–M3 built the plan and made "everything downstream of the field" real against seeded data. What is
still missing is the *value* layer the whole product promises (ROADMAP vision: "proves the value of
field work with evidence, never causality claims"):

1. **Plan-health analytics / Planning Evidence** — the supervisor cannot yet *see* planned-vs-realized
   completion, duration variance, per-merchandiser utilization, task compliance, patch load, or route
   stability. All the raw data exists (`visit_realization`, `planned_visit.status`, `task_instance`,
   `patch`, `assignment`, `audit_log`); M4 aggregates and presents it — with an explicit
   evidence-chain framing (plan → execution) and **no causality claims** (design §8/§11.2).

2. **Onarım (absence repair)** — when a merchandiser goes on leave or a store closes temporarily, the
   affected visits are silently wrong today (nothing detects the collision, `V14` is deferred). M4 adds
   disruption detection (`V14` Error → ✨ Onarım link) and a **decision workbench**: one row per affected
   visit, the system **narrows and ranks candidates** (available that day · capacity after move · region
   proximity, reasoning shown per candidate), the **human decides** per row (Skip / move to another day /
   temp-reassign the route), decisions land as **windowed patches via the existing Patch engine** + one
   Decision Journal entry. **No auto-plans** (design §7.3b, the deliberate v0.5 trust/scale decision).

Success (after `dotnet run --project backend/src/Evo.Seeder -- --profile demo`):
- A supervisor opens a new **Plan Sağlığı** (plan-health) page and sees, per region and drilled to a
  route: completion %, planned-vs-realized minutes variance, weekly utilization band (V8), task
  compliance %, patch load, stability score, assignment turnover — all read-only, evidence-framed.
- Opening a store's **Bilgi** tab shows a small evidence strip (planned vs done vs missed for that store,
  last N weeks) with the explicit "kanıt, nedensellik değil" (evidence, not causation) framing.
- A seeded absence produces `V14` 🔴 errors on the affected route's plan; clicking **✨ Onarım** opens the
  workbench, the supervisor picks a resolution per affected visit, applies, and the plan reflows via real
  auto-reverting patches with one journal entry.

## Brainstorm results

- **Chosen approach:**
  - **Analytics = on-read aggregation, no new analytics tables, no nightly refresh job.** At this scale
    (single VM, ~hundreds of stores in `demo`/`scale`) the metric set is computed live with EF/LINQ
    aggregation over existing tables behind cached read endpoints. Design §9 sketches "materialized
    views refreshed nightly" — deferred until a real perf need appears (flagged, not silently dropped).
    This also avoids CLAUDE.md's "new table ⇒ extend seeder" burden for analytics (there is no analytics
    table to seed — the seeded outcome/patch/assignment data IS the analytics input).
  - **v1 metric set (design §8), ALL EIGHT, per user confirmation 2026-07-18:** planned-vs-realized
    (completion %, outcome breakdown, duration variance), utilization (V8 band), task compliance, patch
    load, route stability score, assignment turnover, **mobility-per-person**, **override-rate**. The
    design's "restricted to senior management, not the supervisor being measured" framing for
    mobility-per-person doesn't map to EVO's 2-role model (Supervisor already sees all regions) — user
    chose to build it now, scoped like every other analytic (Supervisor-only), with the same
    outlier-surfacing framing (flag, don't punish) rather than inventing a third role to gate it.
  - **Two analytics surfaces:** (a) a new **`/analytics` page** (region → route drill-down, ranked
    plan-health table + metric cards — the design §6.0 "behind the gear" dashboard), and (b) a compact
    **store-level evidence strip** inside the existing route-detail **Bilgi** tab (design §11.2 Planlama
    Kanıtı) — plan → execution only, with the no-causality framing.
  - **Onarım disruptions come from a new `absence` table (seeded) + the existing `store_flag` ClosedTemp**
    (already seedable). A minimal Supervisor **create-absence** endpoint exists so the workbench is
    demoable live, and the seeder produces a handful of absences/closures that collide with active plans.
  - **`V14` is computed in the plan/validate projection** via a new pure `AbsenceValidator`
    (`Evo.Domain/Scheduling`) fed absence-windows + closed-store-dates by the infrastructure layer (same
    "map the infra type down to a plain input" pattern as V6's `IsServiceCategory` bool). **`V8`** (weekly
    utilization band) is also implemented now (it backs the utilization metric and was deferred without a
    successor spec).
  - **Onarım apply supports per-visit cross-person distribution, per user confirmation 2026-07-18.**
    Beyond the three existing single-route patch types (Skip / same-person MoveDay / whole-route
    ReassignTemp), v1 adds a fourth per-visit action — **Reassign to another person** — that can send an
    individual disrupted visit to a *different* merchandiser's *different* route, not just cover the
    whole absent person's route as a unit. This needs new resolver mechanics: `PatchResolver.Apply` today
    only ever resolves one route at a time (single-route, per-date signature); a cross-route visit move
    requires a new `PatchType.CrossReassignVisit` that carries `{sourceRouteId, targetRouteId,
    plannedVisitId, targetMerchandiserId}` and is applied as a **paired patch** — a Skip-equivalent
    effect on the source route's date and an Add-equivalent effect (with the visit's real store/minutes)
    on the target route's date — mirroring how `MoveVisit` (spec 007) already pairs skip-source +
    add-target across two *dates* on one route; `CrossReassignVisit` pairs skip-source + add-target
    across two *routes* on the same date. Both halves share one patch row (one expiry, one audit entry,
    auto-revert reverts both sides atomically) — same pattern as `MoveVisit`, just crossing routes instead
    of crossing dates. `PlanGenerationService.RegenerateFutureAsync` must run for BOTH routes when this
    patch type is present (mirrors the existing dual-regeneration in `POST /routes/{id}/stops/{sid}:move`).
- **Alternatives rejected:**
  - *A physical `plan_health` / materialized-view table refreshed nightly* — rejected for v1 (premature
    at this scale; adds a refresh job + a seeding obligation for derived data). Revisit if read latency
    bites.
  - *A causality / sales-attribution evidence chain (plan → execution → shelf → sales)* — rejected: the
    shelf/sales half of the chain has no data pipeline (comes from EVO sales, not built). v1 ships the
    honest half (plan → execution) with explicit no-causality framing.
- **Later (out of M4 v1 scope):** materialized analytics views + nightly refresh; ⚡ "Otomatik düzelt"
  (same-person/same-day gap-closing time-shift — mechanical, could be a small follow-up); the shelf→sales
  half of the evidence chain; the **live-location map layer** (rendering `merchandiser_location_ping` on
  the map pane — data pipeline landed in M3, deferred per user confirmation 2026-07-18); Conflict Center /
  Sorun Merkezi as a standalone cross-route triage surface.

## User stories

- As a supervisor, I open a **Plan Sağlığı** page, pick a region, and see routes ranked by plan health,
  so I know where planning is failing before I hunt across 400 stores.
- As a supervisor, I drill into a route and see completion %, planned-vs-realized minutes variance,
  weekly utilization (with the 90–105% band), task compliance %, patch load by type, stability score, and
  assignment turnover, so I can tell a "region problem" from a "store problem" from a "plan problem".
- As a supervisor, I open a store's **Bilgi** tab and see a small evidence strip (planned / done / missed
  over the last N weeks) with an explicit "evidence, not causation" note, so I can defend the plan without
  overclaiming.
- As a supervisor, when a merchandiser is on leave or a store is temporarily closed, the affected route's
  plan shows 🔴 `V14` errors that jump me to a **✨ Onarım** workbench.
- As a supervisor, in the Onarım workbench I see one row per affected visit with **ranked candidate
  resolutions and the reasoning for each**, I decide per row (or skip), and applying lands auto-reverting
  windowed patches + one Decision Journal entry — the system never auto-decided.
- As a developer, one seeder run produces absences/closures that collide with live plans plus enough
  realized history that every metric renders non-trivially.

## Acceptance criteria (testable)

Absence + V14 (backend, `Evo.Tests/`):
- [ ] New `absence` table: `Id`, `MerchandiserId` (FK), `StartDate`, `EndDate`, `Reason`
      (`AbsenceReason` enum), `Note` (nullable), `CreatedBy` (nullable FK→`AspNetUsers`), `CreatedAt`;
      one EF migration; existing rows/plans unaffected.
- [ ] `POST /merchandisers/{id}/absences` (Supervisor only) creates an absence; `GET
      /merchandisers/{id}/absences` lists them; both audit-logged (`entityType=Absence`).
- [ ] Pure `AbsenceValidator.Evaluate(...)` returns a `V14` Error finding (scope = the affected visit)
      for any planned visit whose date falls in an absence window for its merchandiser OR whose store has
      an active `ClosedTemp` flag on that date; unit-tested with both triggers and a clean control.
- [ ] `GET /routes/{id}/plan` and `POST /routes/{id}/validate` surface the `V14` findings (never
      hard-block — consistent with the publish gate; V14 is an override-with-reason Error).
- [ ] Pure `UtilizationValidator` (or a `V8` branch) returns a `V8` Warning when a merchandiser's weekly
      planned minutes fall outside the configurable 90–105% band; unit-tested.
- [ ] Seeder produces ≥2 absences and ≥1 temporary store closure that each collide with at least one
      active route's future plan (verifiable: those routes' `/validate` returns `V14`).

Plan-health analytics (backend):
- [ ] `GET /analytics/plan-health?region=&from=&to=` returns, per route in the region:
      `completionPct`, `plannedMinutes`, `realizedMinutes`, `durationVariancePct`, `utilizationPct`
      + `utilizationBand` (under/ok/over), `taskCompliancePct`, `patchLoad` (count by type),
      `stabilityScore`, `assignmentTurnover`, `overrideRatePct` (instance overrides / total rule-resolved
      tasks in the window, per route), and a composite `planHealthScore` for ranking — computed on-read
      from existing tables; unit/integration-tested against seeded data.
- [ ] `GET /analytics/stability?region=` returns per-route stability scores (design §9 endpoint) —
      `100 − weighted structural changes (add/remove/move/frequency, excluding patches) over trailing 12
      months`, read from the `route_change_log` facade over `audit_log`.
- [ ] `GET /analytics/mobility?region=&months=12` returns per-merchandiser: distinct routes held +
      intra-route reshuffle count in the trailing window, vs the regional median, with an `outlier`
      flag (per design §8 "outlier → possible mobbing; surfaced to upper management") — since EVO has no
      senior-management role, this is Supervisor-scoped like every other endpoint here (flagged
      divergence from the design's role-gating intent, not silently dropped).
- [ ] `GET /routes/{id}/evidence?weeks=` returns the store/route-level evidence chain data (per store:
      planned / done / missed / skipped counts + minutes variance over the window) — the Bilgi-tab strip
      source; carries a `causalityDisclaimer` boolean/flag so the UI renders the no-causality note.
- [ ] All analytics endpoints are Supervisor-scoped and never mutate.

Onarım workbench (backend):
- [ ] `GET /onarim/disruptions?region=` lists current disruptions (absences + closures) with their
      affected-visit counts.
- [ ] `GET /onarim/disruptions/{id}/affected-visits` returns one row per affected future visit
      (route, store, date, planned start/minutes) plus, per row, a **ranked candidate list**: each
      candidate merchandiser with `available` (not on leave that day), `capacityMinutesAfterMove`
      (≤450 check), `regionProximity` (same province / home distance bucket), and a human-readable
      `reasoning` string + a numeric `rank`. Ranking is deterministic and unit-tested.
- [ ] `POST /onarim/disruptions/{id}/apply` accepts a per-visit decision list
      (`{plannedVisitId, action: Skip|MoveDay|ReassignRoute|ReassignPerson, targetDate?,
      targetMerchandiserId?, targetRouteId?}`), writes the corresponding windowed patches through the
      existing patch-create path (mandatory `endsOn` = disruption end), regenerates the affected
      route(s), and writes ONE `decision_journal` entry (`Kind=OnarimRepair`, reason/objective required
      — override-with-reason). Undecided visits stay flagged (not silently resolved). Integration-tested
      end-to-end (apply → plan reflows → V14 clears for decided rows, remains for undecided).
- [ ] New `PatchType.CrossReassignVisit` (paired skip-source/add-target across two ROUTES on one date,
      mirroring `MoveVisit`'s pairing across two DATES on one route — spec 007 precedent) resolves via
      `PatchResolver.Apply`; `RegenerateFutureAsync` runs for both the source and target route when this
      patch type is present. Unit-tested: source route's visit is removed for the window, target route
      gains the visit (real store/minutes) for the window, both revert together on expiry.
- [ ] `ReassignPerson` decisions in the workbench move exactly one visit to a candidate's route without
      touching the rest of either route's schedule; integration-tested (source route loses just that
      visit, target route gains it, both other routes' other visits are untouched).

Panel:
- [ ] New `/analytics` route renders a region picker, a route-ranked plan-health table, and metric
      cards; Vitest covers the table/formatting logic.
- [ ] The route-detail **Bilgi** tab renders the evidence strip with the no-causality note.
- [ ] The plan/schedule surface shows `V14` errors and an **✨ Onarım** entry point that opens a
      workbench modal listing affected visits + ranked candidates; the supervisor picks per row and
      applies (reason/objective captured), then the schedule refetches. Vitest covers the decision-row
      state; a Playwright smoke drives open-workbench → decide → apply.

## Clarifications

<!-- Filled by the clarify step BEFORE planning. Recommended answers below are the planner's proposal,
     pending the human's confirmation — same posture as spec 009's Q3/Q4/Q7/Q8. -->
| # | Question | Answer |
|---|---|---|
| 1 | Which §8 metrics are in M4 v1? | **CONFIRMED (2026-07-18) — ALL EIGHT.** planned-vs-realized, utilization (V8 band), task compliance, patch load, route stability score, assignment turnover, **mobility-per-person**, **override-rate**. User overrode the planner's 6-metric recommendation — see Q8. |
| 2 | Is Planning Evidence a new page or an extension of the route panel? | **CONFIRMED — both, split by scope.** A new `/analytics` page for the region→route plan-health dashboard (design §6.0 "behind the gear"); a compact store-level evidence strip inside the existing **Bilgi** tab (design §11.2 Planlama Kanıtı). |
| 3 | What triggers Onarım — a real "mark on leave / store closed" input, or seeded/simulated? | **CONFIRMED — both, minimal.** A new seeded `absence` table + existing `store_flag` ClosedTemp supply disruptions (matches M3's seeded-data pattern); a minimal Supervisor `POST /merchandisers/{id}/absences` endpoint lets the workbench be driven live in a demo. No HR-sync integration (that's a customer-IT question). |
| 4 | What is the Onarım candidate ranking heuristic for v1? | **CONFIRMED — a simple deterministic score**, no ML: filter to candidates available that day (not on leave), then rank by (a) capacity after the move (planned minutes + this visit ≤ 450), (b) region proximity (same province, then home-distance bucket), (c) lighter current-day load. Reasoning shown per candidate; ties broken deterministically. |
| 5 | Does Onarım apply write real Patches via the existing engine? | **CONFIRMED (2026-07-18) — existing patch types PLUS a new `CrossReassignVisit` type for per-visit cross-person/cross-route distribution.** User overrode the planner's "existing-engine-only" recommendation — see Q8. Per visit: Skip → `SkipStore`, Move day (same person) → `MoveVisit`, Temp-reassign the whole route for the window → `ReassignTemp`, **Reassign this one visit to a different person's route → new `CrossReassignVisit`** (paired skip-source/add-target across two routes on one date, same pairing pattern as `MoveVisit`'s two-date pairing on one route). All windowed (auto-revert), one `decision_journal` entry (`Kind=OnarimRepair`). |
| 6 | Which new validation codes does M4 unblock? | **CONFIRMED — V8 and V14.** V8 (weekly utilization band → Warning) backs the utilization metric. V14 (visit while assignee on leave / store closed → Error, links Onarım) is the Onarım trigger. Both never hard-block (override-with-reason). V13/V15 (travel/OSRM) stay deferred; V16 stays deferred. |
| 7 | Does the region dashboard need new panel navigation? | **CONFIRMED — yes, a new top-level `/analytics` route**, reusing existing panel layout/CSS tokens (topbar, cards). Not a full new nav system — one page behind a nav entry. |
| 8 | Mobility-per-person / override-rate need senior-management scope EVO doesn't have — include scoped to Supervisor, or defer? | **CONFIRMED (2026-07-18) — include, scoped to Supervisor.** User chose to build both now rather than defer. Mobility-per-person's design intent ("restricted to senior management, not the supervisor being measured") doesn't map cleanly onto EVO's 2-role model — flagged as a divergence in `docs/DECISIONS.md`, not silently dropped: the metric is Supervisor-visible like every other analytic here, framed as an outlier-surfacing signal (design §8: "possible mobbing" flag), not a punitive score. |
| 9 | Are analytics materialized (a table + nightly refresh) or computed on-read? | **CONFIRMED — computed on-read** (cached read endpoints), no analytics table, no refresh job — appropriate at this scale and avoids seeding derived data. Revisit if latency bites. Flag the deviation from design §9's "materialized views nightly". |
| 10 | Is the live-location map layer (rendering `merchandiser_location_ping`) in M4? | **CONFIRMED — out of v1 scope.** Keep M4 focused on the two ROADMAP deliverables (analytics + Onarım). The data pipeline + read API already exist (spec 009); rendering it is a small self-contained follow-up, tracked in `docs/TODO.md`. |

## Non-goals

- **No materialized analytics views / nightly analytics refresh job** — on-read aggregation for v1 (Q9).
- **No auto-generated repair plans** — Onarım only narrows + ranks; the human decides per row (design §7.3b).
- **No shelf→sales causality evidence chain** — no data pipeline; v1 ships plan→execution only, explicitly
  no-causality (design §11.2).
- **No ⚡ "Otomatik düzelt"** (same-person/same-day gap-closing time-shift) — designed, deferred to a follow-up.
- **No live-location map-layer rendering** — data exists (spec 009); rendering deferred (Q10), tracked in
  `docs/TODO.md` as a small follow-up.
- **No HR/leave-sync integration** — absences are seeded + a minimal manual endpoint (Q3).
- **No Conflict Center / Sorun Merkezi** standalone cross-route triage surface — still deferred.
- **No senior-management role / permission tier** — mobility-per-person ships Supervisor-scoped instead
  (Q8 divergence, flagged in DECISIONS.md, not a silent role-model change).

## Open questions

- Composite `planHealthScore` weighting (design §8 suggests `stability × revenue attainment ×
  utilization`) — confirm the exact factors/weights for route ranking, or accept the planner's default
  (equal-weighted normalized product of stability, completion %, and utilization-in-band).
- V8 band bounds (90–105%) and the trailing window for stability (12 months) — confirm they live in
  `settings` (region-overridable) vs hard-coded constants for v1. Planner recommends `settings` keys with
  the design defaults.
- `CrossReassignVisit`'s exact `params_json` shape and whether `PatchResolver.Apply`'s per-date signature
  needs a second pass (source-route pass + target-route pass) or a single cross-route-aware evaluation —
  resolve during Phase 3 implementation, document the final shape in `docs/API.md`/`docs/DATABASE.md`.
