# Spec: Planner UI (single-page workspace)   (slug: 006-planner-ui)

<!-- Second M1 feature module. Owned by: planner. Renders over spec 005's REST API + generated TS
     client. This is the drag-heavy single-page planner the 005 spec explicitly deferred: map + schedule
     grid + route panel + live health card + selection/editing + publish gate. Includes the small
     GEO API additions 005 deferred to "the geo/panel spec" (clarification #1 keeps them here). -->

## Problem & goal
Spec 005 gave us the full backend of route planning — routes, stops, assignments, patches, the scheduling
engine, validation, the publish gate, and a regenerated TypeScript client — but **no way for a human to
touch any of it**. A Supervisor today can only plan via raw HTTP. The whole product thesis (design §6.0)
is one **single page** where *where* (map), *when* (schedule grid), and *bulk* (table) are panes of one
shared state: lasso stores on the map, watch the health card recompute live, and publish through a review
gate — never navigating away while designing a route.

This spec builds that workspace as an MVP: a `/planner` page with a **Map | Schedule split** layout, a
**shared selection + filter Zustand store** the panes render over, a **MapLibre** store layer (color-coded,
click-popover, province-scoped), a docked **route detail panel with a live health card** (Recharts), a
**time-accurate schedule grid** (breaks as locked blocks, per-day minutes vs 450, finding chips),
**selection-driven editing** (lasso / multi-select → bulk-add stops, dnd-kit stop reorder, stop-edit,
move-store-between-routes, add-patch), and the **publish flow** (pending-changes review modal →
override-with-reason gate → decision journal → health refresh). Turkish UI strings via react-i18next.

Two backend realities from 005 shape Phase 1:
- **The map has no coordinates to plot.** `GET /api/v1/stores` returns `StoreSummaryDto`, which has **no
  latitude/longitude** and no "on which route" flag. 005 explicitly deferred "spatial query endpoints —
  bbox / unassigned-in-scope" to *this* spec. So Phase 1 adds a compact **`GET /api/v1/stores/geo`**
  endpoint (lat/lng + chain/category + active-route flag + 6-month revenue total) — the map's data source —
  and regenerates the contract + client. This is the "geo API + UI in one spec" the human confirmed
  (clarification #1).
- **No merchandiser list endpoint exists** (only `GET /merchandisers/{id}/day`). So reassignment UI and
  `ReassignTemp`/cover-merchandiser patches are **out of MVP scope** (deferred, flagged below); MVP patch
  types are the ones that need no person picker.

Success = a Supervisor opens `/planner`, sees the province's stores on a map + the route rail, clicks a
route to filter the whole workspace to it, lassos (or multi-selects) unassigned in-scope stores and
bulk-adds them, watches the health card + schedule grid update live, reorders a stop by drag, and publishes
— passing 🔴 errors only by recording a written reason — all on one page, with the Playwright core flow
green against a live seeded backend.

## Brainstorm results
- **Chosen scope:** an 8-phase MVP that renders the *core planning loop* (open workspace → filter to a
  route → select stores → bulk-add → live health → edit stops → publish) over 005's endpoints, plus the
  minimal geo API to feed the map. Kept together with the backend geo additions in one spec
  (clarification #1). *(Rejected: a separate backend-geo spec then a UI spec — the geo endpoint is ~1
  controller + DTO + test, too small to be its own checkpoint-worthy spec, and the UI can't be built or
  demoed without it.)*
- **Chosen libraries** (clarifications #3–7):
  - **Map: MapLibre GL JS** + public dev tiles (`demotiles.maplibre.org/style.json`), self-hosted style
    deferred. *(Rejected: Leaflet — heavier custom work for GPU vector layers/clustering the design wants;
    Google/Mapbox — paid + KVKK data-egress concerns for a Turkish self-host target.)*
  - **Drag-drop: dnd-kit** (stop reorder, pool→day drop). *(Rejected: react-dnd — larger API surface,
    less accessible defaults; native HTML5 DnD — too low-level for the reflow UX.)*
  - **State + data: Zustand** (shared selection/filter/focus workspace store) **+ TanStack Query** (server
    cache, refetch-on-edit for the live health card). *(Rejected: Redux Toolkit — ceremony for a
    single-workspace store; putting server data in Zustand — reinvents caching/invalidation TanStack gives
    free, and the "health recomputes on every edit" requirement is exactly query invalidation.)*
  - **i18n: react-i18next** + a single `tr.json` now (UI strings Turkish per CLAUDE.md, i18n-ready).
    *(Rejected: hardcoded Turkish strings — violates the i18n-ready rule; FormatJS — heavier than needed.)*
  - **Charts: Recharts** for the health card. **Justification (clarification #7):** the three health
    visuals are simple and declarative — a horizontal revenue-vs-target bar, a per-weekday minutes bar with
    a 450 reference line, and a category-mix donut. Recharts renders all three from data props with almost
    no custom SVG, matching an internal tool's velocity priority; visx would mean hand-building axes/arcs
    for marginal pixel control we don't need. Bundle cost is acceptable for a supervisor desktop tool.
- **Later (out of 006 MVP — deferred to explicit later specs, per clarification #2):**
  - **Conflict Center** (overlap-resolve popovers, the V12 workbench) — later M1 spec.
  - **`POST /simulate/route`** what-if ("can we add a person in region X") — needs a new backend endpoint;
    later spec (005 deferred it here, we re-defer with justification below).
  - **History timeline** (store/route/person tabs, design §6.8) — later spec.
  - **Live field-location layer** (planned-vs-actual badge, design §6.2) — needs M3 field simulation.
  - **Onarım** (absence repair workbench) — M4.
  - **Full-canvas Table preset** (the 6-tab `renderDataTable` workspace, design §6.6) — later spec; MVP
    ships the schedule + panel + map + a lightweight selection list, no full table workspace.
  - **Effective / Base toggle** (design §6.0) — later spec; MVP always renders the effective plan.
  - **Reassignment UI + ReassignTemp/cover patches** — blocked on a merchandiser-list endpoint; later spec.
  - **Task edit modal / duration source display** (design §6.4) — M2 (Tasks & Rules).

## User stories
- As a Supervisor, I open `/planner` and land on a single workspace with a map, a schedule grid, a route
  rail, and a filter bar — no navigation needed to start planning.
- As a Supervisor, I click a route (in the rail or on the map) and the **whole workspace filters to it**:
  the map highlights its stops, the schedule shows its plan, the detail panel + health card open for it;
  clicking again / Esc clears the filter.
- As a Supervisor, I pick a province and the map hard-scopes to it — out-of-province stores never render.
- As a Supervisor, I see color-coded store pins (chain fill, category ring, faded when on another route)
  and click one to get a popover with its name, chain, category, 6-month revenue, and current route.
- As a Supervisor, I lasso (or shift-multi-select) unassigned in-scope stores and click "Add N stores to
  route", and stores already on another route are listed separately with a per-store "move here" — never
  silently added.
- As a Supervisor, I watch the **health card recompute live** after every edit — revenue vs target,
  per-weekday minutes vs 450, category mix — so I see consequences instantly, not at save.
- As a Supervisor, I see the schedule grid render visits time-accurately with statutory breaks as locked
  grey blocks, per-day minutes vs 450, and inline finding chips.
- As a Supervisor, I drag a stop to reorder its sequence, edit a stop's frequency/duration, move a store to
  another route, or add an expiry-dated patch — and the panes + health update.
- As a Supervisor, I click Publish and get a review modal of pending changes; if the plan has 🔴 errors I
  can still publish, but only by typing a reason + objective, which is recorded — then the plan materializes
  and the health/finding counts refresh.
- As a developer, I run the Playwright core flow (login → open workspace → filter to a route → bulk-add a
  store → see health update → publish) against a live seeded backend and it passes.

## Acceptance criteria (testable)

### Backend — geo API (the map's data source)
- [ ] `StoreGeoDto` record: `Id`, `Name`, `ChainName?`, `Format byte`, `Category`, `double Latitude`,
      `double Longitude`, `Guid? ActiveRouteId`, `string? ActiveRouteCode`, `decimal SixMonthRevenue`.
      Stores with a null `Location` are omitted (can't be plotted).
- [ ] `GET /api/v1/stores/geo?province=&district=&onRoute=` (Supervisor or any authenticated user; matches
      `GET /stores` `[Authorize]`) returns `StoreGeoDto[]` for in-province stores, joining the active
      `route_stop` (`EffectiveTo IS NULL`) for `ActiveRouteId`/`Code`, summing the last 6 months of
      `store_revenue` for `SixMonthRevenue`. `province` is **required** (400 if missing — the map is always
      province-scoped); optional `onRoute` filter (`true`=assigned, `false`=pool). Result capped at 5000
      rows (a single province never exceeds this at scale).
- [ ] xUnit tests: geo endpoint returns lat/lng for located stores, omits null-location stores, sets
      `ActiveRouteId` for a store on an active route and null for a pool store, and honors `onRoute=false`
      (pool only). (`backend/tests/Evo.Api.Tests/Stores/StoresGeoEndpointTests.cs`.)
### Backend — batch stop reorder (clarification #14)
- [ ] `ReorderStopsRequest` record: an ordered `IReadOnlyList<Guid> StopIds` (the route's stops in their new
      sequence). Endpoint `POST /api/v1/routes/{id}/stops:reorder` (Supervisor, matching the other stop-write
      endpoints) validates that `StopIds` is exactly the set of the route's active stops (no missing/extra ids
      → 400 with the shared ProblemDetails shape), then assigns `sequence = index + 1` in a single transaction
      and logs one `RouteChangeLog` entry. Returns the updated `RouteDetailDto` (same shape `PATCH /stops/{id}`
      returns), so the client refreshes the whole route from one call instead of N.
- [ ] xUnit tests: reorder persists the new sequence for all stops in one call; a payload missing a stop id or
      containing an unknown id → 400; the change is audit-logged.
      (`backend/tests/Evo.Api.Tests/Routes/RouteStopsReorderTests.cs`.)
- [ ] `contracts/openapi.json` regenerated (via `dotnet build`) to include `/stores/geo` + `StoreGeoDto` **and
      `/routes/{id}/stops:reorder` + `ReorderStopsRequest`**; `panel/src/api/generated/schema.ts` regenerated
      (`npm run generate-api-client`). Full backend suite stays green (`dotnet test backend/Evo.sln`).

### Panel — foundations
- [ ] `panel/package.json` gains `maplibre-gl`, `@tanstack/react-query`, `zustand`, `@dnd-kit/core` +
      `@dnd-kit/sortable`, `react-i18next` + `i18next`, `recharts`, `@turf/boolean-point-in-polygon` +
      `@turf/helpers` (client-side lasso hit-testing); `npm install` succeeds and `npm run build` passes.
- [ ] i18n bootstrapped: `panel/src/i18n/index.ts` initializes react-i18next with `lng: 'tr'` and a single
      `panel/src/i18n/locales/tr.json` resource; `main.tsx` imports it; **every user-facing string added in
      this spec comes from `t('...')`** — no hardcoded Turkish literals in components (lint check + review).
- [ ] `QueryClientProvider` wraps the app in `main.tsx`; a shared `queryClient` lives in
      `panel/src/api/queryClient.ts`.
- [ ] A typed API layer `panel/src/api/planner.ts` wraps `authorizedFetch` (reusing client.ts's pattern)
      with functions returning the generated `components['schemas'][...]` types for: `listRoutes`,
      `getRoute`, `getStoresGeo`, `getPlan`, `getHealth`, `validateRoute`, `bulkAddStops`, `updateStop`,
      `reorderStops`, `moveStop`, `createPatch`, `publishRoute`. No hand-written response shapes — all from
      `schema.ts`.

### Panel — workspace shell & shared state
- [ ] `/planner` route added in `App.tsx` behind `ProtectedRoute`; the Dashboard links to it.
- [ ] `panel/src/planner/state/workspaceStore.ts` (Zustand): `{ province, focusedRouteId, selection:
      Set<storeId>, layout: 'split'|'map'|'schedule'|'table' }` with actions `setProvince`, `focusRoute`,
      `clearFocus`, `toggleSelect`, `setSelection`, `clearSelection`, `setLayout`. Unit-tested (Vitest):
      focusRoute sets id, clearFocus nulls it, selection add/remove/clear behave as a set.
- [ ] `PlannerPage.tsx` renders a `TopFilterBar` (province `<select>`, route `<select>`/rail, layout
      preset buttons `Map · Split · Schedule · Table`), a left `RouteRail`, the `WorkspaceLayout` (Map |
      Schedule split with a draggable divider — the `table` preset opens a bottom selection list, not the
      full-canvas table), and the docked `RouteDetailPanel` on the right.
- [ ] Clicking a route in `RouteRail` calls `focusRoute`; the map, schedule, and panel all read
      `focusedRouteId` from the store and re-render; Esc / clicking the focused route again calls
      `clearFocus`.
- [ ] TanStack Query hooks in `panel/src/planner/api/queries.ts`: `useRoutes(province, status)`,
      `useRoute(id)`, `useStoresGeo(province, onRoute?)`, `usePlan(id, from, to)`, `useHealth(id)`; mutation
      hooks `useBulkAddStops`, `useUpdateStop`, `useReorderStops`, `useMoveStop`, `useCreatePatch`, `usePublish`
      that invalidate `useRoute`/`usePlan`/`useHealth`/`useStoresGeo` on success (this is what makes health
      "live").

### Panel — map pane
- [ ] `MapPane.tsx` mounts a MapLibre map with `demotiles.maplibre.org/style.json`, centered on Turkey,
      cleaning up the instance on unmount (no leak on route change).
- [ ] Store pins render from `useStoresGeo(province)` as a GeoJSON source + circle layer: **fill by chain**
      (local vs national), **stroke/ring by category** (potential/high-value/service), **faded** when
      `ActiveRouteId != null && ActiveRouteId != focusedRouteId`, **highlighted** when on the focused route.
- [ ] Changing province in the filter bar refits the map to that province's pins and **removes
      out-of-province stores entirely** (they are never fetched — geo query is province-scoped).
- [ ] Clicking a pin opens a popover (name, chain, category badge, format, 6-month revenue, current route
      code or "pool") with an "Add to route" / "Move here" action wired to the focused route.
- [ ] Lasso tool: a toolbar toggle lets the user draw a polygon; on close, all **pool** pins inside
      (client-side `@turf/boolean-point-in-polygon`) are added to `selection`; a count badge shows "N
      selected". (Lasso hit-testing is unit-tested with a fixed polygon + point set.)

### Panel — route detail panel & live health card
- [ ] `RouteDetailPanel.tsx` (docked right) shows the focused route's code/name/status/assignee and a
      scrollable **stops list** (sequence, store name, minutes, frequency badge) from `useRoute(id)`; empty
      state when no route is focused.
- [ ] `HealthCard.tsx` renders from `useHealth(id)`: a **revenue-vs-target bar** (green when
      `revenueMet`, red otherwise), a **per-weekday minutes bar** with a 450 reference line
      (over/under colored), and a **category-mix donut** — all Recharts, all from `HealthDto`.
- [ ] The health card + stops list **refetch and visibly update after a bulk-add / stop-edit / patch**
      (via the mutation-invalidation in queries.ts) — asserted in the Playwright core flow.
- [ ] Finding counts (`errorCount` 🔴 / `warningCount` 🟡) render as chips on the health card.

### Panel — schedule grid pane
- [ ] `SchedulePane.tsx` renders the focused route's plan from `usePlan(id, from, to)` (default: current
      week) as a **time-accurate grid** — columns = days, blocks positioned/sized by
      `PlannedVisitDto.start/end`; patched visits (`source == Patch`) render dashed.
- [ ] **Week navigator (clarification #11):** a header shows the visible week's Mon–Fri date range with
      **‹ prev / next ›** buttons and a **"Bu hafta" (this week)** reset; navigating shifts the `from`/`to`
      window (±7 days) held in local pane state and re-runs `usePlan` for the new week — so a Supervisor can
      review next/previous weeks in MVP, not only the current week. The navigator is unit-tested via the
      week helper (`prevWeek`/`nextWeek`/`currentWeek` return correct Mon–Fri ranges).
- [ ] Statutory breaks render as **locked grey blocks** (lunch 12:30–13:30, tea 10:30–10:45 / 15:00–15:15)
      derived from the plan's gaps / a shared break constant; they are not draggable.
- [ ] Each day column shows **planned minutes vs 450** (`PlanDayDto.plannedMinutes`) with over/under
      coloring, and renders `FindingDto` chips (severity-colored via `theme/tokens` `severityColors`).
- [ ] Empty/loading/error states for the plan query are handled (no crash when a draft route has no plan
      yet).

### Panel — selection & editing
- [ ] **Two selection paths ship (clarification #10):** the freehand **lasso** on the map (for humans) **and**
      a **checkbox/list multi-select** in the bottom selection strip (the `table`-preset list) — a scrollable
      list of the province's **pool** stores with a checkbox per row and a "select all in view" toggle, each
      checkbox wired to `toggleSelect`. The Playwright core flow drives **this checkbox/list path** (stable
      `data-testid`s), never the freehand lasso.
- [ ] A floating action bar appears when `selection` is non-empty: "Add N stores to route" (calls
      `useBulkAddStops` for the focused route), "Clear". The bulk-add result surfaces **accepted vs
      rejected-with-reason** (from `BulkAddResultDto`); rejected stores keep a "move here" affordance.
- [ ] A stop row's edit control opens a small form (frequency `<select>`, service-minutes input, sequence)
      wired to `useUpdateStop`; on save the panel + health + schedule update.
- [ ] Stops list is **dnd-kit sortable**: dragging a stop reorders it and persists the new order in **one
      call** via `useReorderStops` (the `POST /routes/{id}/stops:reorder` batch endpoint — clarification #14),
      sending the full ordered `stopIds` on drop (not N per-stop PATCHes); the panel/health/schedule re-render
      from the returned `RouteDetailDto` / query invalidation.
- [ ] A store's "Move here" action (from the map popover or a rejected-store row) calls `useMoveStop`
      (`stops/{stopId}:move` → target = focused route), and both source and target route data invalidate.
- [ ] An "Add patch" control opens a form for the MVP patch types (**SkipStore, AddStore, TimeShift** — no
      cover-merchandiser), enforcing a **mandatory expiry date** client-side (mirrors backend V9), wired to
      `useCreatePatch`; the patched visit then renders dashed in the schedule.

### Panel — publish flow
- [ ] A "Publish" button opens `PublishModal.tsx` showing the route's current findings (from
      `validateRoute` / `useHealth`) grouped by severity.
- [ ] If there are **no 🔴 errors**, Publish calls `usePublish` directly; on success it shows
      `visitsMaterialized` and closes.
- [ ] If there **are 🔴 errors**, the modal **requires** a non-empty `reason` + `objective` before the
      Publish button enables (mirrors backend 422); on submit it passes them to `usePublish`, which records
      the decision journal, and the modal shows `overrodeErrors: true` + the `decisionJournalId`.
- [ ] After publish, `useRoute`/`usePlan`/`useHealth` invalidate and the workspace reflects the published
      plan.

### Tests, i18n, docs
- [ ] Vitest unit tests for: `workspaceStore` (selection/focus), the lasso hit-test util, the week helper
      (`currentWeek`/`prevWeek`/`nextWeek`), the queries mutation-invalidation wiring (mocked), and
      `HealthCard` rendering from a fixed `HealthDto`.
- [ ] Playwright e2e `panel/tests/e2e/planner-core.spec.ts` runs the **core flow against a live seeded
      backend** (clarifications #8, #10): login → open `/planner` → filter to a seeded route → bulk-add a pool
      store **via the testable checkbox/list multi-select path (not the freehand lasso)** → assert the health
      card / stop count changes → publish → assert success. Documented prereqs: backend + SQL Server up,
      `Evo.Seeder --profile demo` run.
- [ ] `npm run lint`, `npm test` (Vitest), and `npm run build` all pass; `npx playwright test` passes with
      the seeded backend running.
- [ ] Docs updated: `docs/ARCHITECTURE.md` (panel workspace architecture — shared Zustand store + TanStack
      Query + MapLibre/dnd-kit/Recharts stack, mark the Planner UI landed for M1), `docs/API.md` (add
      `GET /stores/geo`), `docs/DECISIONS.md` (record the geo-in-006 decision, the library choices with
      Recharts-over-visx justification, reassignment/simulate/Effective-Base deferrals), `docs/ROADMAP.md`
      (flip the Planner UI item toward done as phases land).

## Clarifications
<!-- 1–9 answered 2026-07-17 pre-plan; 10–14 answered 2026-07-17 post-plan (the five flagged open product
     decisions — all now settled). Implementation may proceed. -->
| # | Question | Answer (2026-07-17) |
|---|---|---|
| 1 | Backend scope — separate geo-API spec or fold the geo endpoint into this UI spec? | Keep together in 006: the geo API (`GET /stores/geo`) + the UI ship in one spec. |
| 2 | MVP cut — accept the proposed 8-phase MVP? | Accept as proposed. Deferred to later specs: Conflict Center, `POST /simulate/route`, history timeline, live-location layer, Onarım, full-canvas Table preset, Effective/Base toggle. |
| 3 | Map library? | MapLibre GL JS + public dev tiles (`demotiles.maplibre.org/style.json`); self-host the style/tiles later. |
| 4 | Drag-drop library? | dnd-kit (`@dnd-kit/core` + `@dnd-kit/sortable`). |
| 5 | State + data fetching? | Zustand (shared workspace store) + TanStack Query (server cache / live refetch). |
| 6 | i18n now? | Yes — add react-i18next + a single `tr.json` now; all new strings via `t()`. |
| 7 | Charting library for the health card? | Add a charting lib — **Recharts** (justified in Brainstorm: declarative, minimal custom SVG for the 3 simple health visuals; visx's low-level control isn't needed for an internal tool). |
| 8 | Playwright e2e scope? | Live seeded backend, core flow: login → open workspace → filter to a route → bulk-add a store → see health update → publish. |
| 9 | Checkpoint cadence? | Standard CLAUDE.md rule-3d: HARD STOP + manual UI test script at each of the ~8 phase ends, commit per phase, wait for go-ahead each time. |
| 10 | Lasso vs multi-select as the primary bulk-add path for the e2e? | **Both ship for humans; the Playwright bulk-add flow drives a testable checkbox/list multi-select, not the freehand lasso.** Lasso stays for human use, untested via e2e. |
| 11 | Schedule week window — navigator in MVP or fixed current week? | **INCLUDE prev/next week navigation in the schedule grid pane for MVP** (not fixed-current-week). Added to Phase 5. |
| 12 | Break rendering source — client constant or new API? | **Client-side constant matching 005's seeded `break_blocks`** (as proposed). No API change. |
| 13 | `GET /stores/geo` authorization? | **Any authenticated user** (`[Authorize]`, matching `GET /stores`). No Supervisor-only restriction. |
| 14 | Stop-reorder persistence — N per-stop PATCHes or a batch endpoint? | **ADD a new batch `stops:reorder` backend endpoint.** dnd-kit reorder calls it once on drop (not N per-stop PATCHes). New backend scope in Phase 1; the Phase 6 reorder consumer calls it. |

## Non-goals
- **No Conflict Center / overlap-resolve workbench** — later M1 spec (V12 surfaces as a chip only here).
- **No `POST /simulate/route`** what-if / "can we add a person in region X" — needs a new backend endpoint;
  later spec.
- **No history timeline** (store/route/person tabs, design §6.8) — later spec.
- **No live field-location layer** — needs M3 field simulation.
- **No Onarım workbench** — M4.
- **No full-canvas Table preset** (the 6-tab `renderDataTable` workspace) — the `table` layout button opens
  a lightweight bottom selection list only; the full table workspace is a later spec.
- **No Effective / Base toggle** — MVP always renders the effective plan (baseline ⊕ active patches).
- **No reassignment UI / ReassignTemp or cover-merchandiser patches** — blocked on a merchandiser-list
  endpoint that doesn't exist; later spec. MVP patch types: SkipStore, AddStore, TimeShift.
- **No task edit modal / duration-source display** — depends on M2 Tasks & Rules.
- **No new backend beyond `GET /stores/geo` and `POST /routes/{id}/stops:reorder`** — the two additions this
  spec makes (the map's geo source + the batch stop-reorder endpoint, clarification #14). Every other missing
  endpoint means the feature is deferred, not that the backend grows here.
- **No self-hosted map tiles/style** — public MapLibre demo tiles for now.
- **No settings/admin pages, no mobile surface** — out of scope (mobile deferred project-wide).

## Open questions (product decisions — flag at review, do not guess)
_All five previously-flagged product decisions were answered by the human 2026-07-17 and moved to the
Clarifications table (rows 10–14). No open questions remain — implementation may proceed._
