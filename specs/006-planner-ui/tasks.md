# Tasks: Planner UI (006-planner-ui)

<!-- Each task ≈ 2–5 min, zero-context executable. Verify before checking off (rule 3d).
     HARD STOP at each phase end: summarize + evidence, commit, give a 1-min manual UI test script for any
     UI change, ask open questions, say "CHECKPOINT — waiting for your go/feedback", END THE TURN. Never
     start the next phase in the same response.

     All five previously-flagged product decisions are now settled (spec Clarifications rows 10–14):
     10 e2e drives a checkbox/list multi-select (lasso stays for humans, untested via e2e);
     11 the schedule pane INCLUDES prev/next week navigation in MVP;
     12 breaks from a client constant matching 005's seeded break_blocks (no API change);
     13 GET /stores/geo is [Authorize] (any authenticated user);
     14 stop reorder persists via a new batch POST /routes/{id}/stops:reorder endpoint (not N PATCHes).

     Conventions:
     - Panel: Vite + React 19 + TS strict, under panel/src/. Reuse authorizedFetch (src/api/client.ts),
       session (src/auth/session.ts), theme tokens (src/theme/tokens.ts), generated types
       (src/api/generated/schema.ts — NEVER hand-write API shapes). All user-facing strings via t().
     - Backend: .NET 10, dev SQL Server = docker-compose.dev.yml. `dotnet build` regenerates
       contracts/openapi.json. Supervisor role = Evo.Domain.Auth.Roles.Supervisor.
     - Feature root: panel/src/planner/ ; i18n: panel/src/i18n/.
     - Commit style: conventional, referencing 006 (e.g. `feat(006): map pane store layer`). -->

---

## Phase 1 — Backend (geo API + batch reorder) + panel foundations

## Task 1: Add StoreGeoDto record
- Files: `backend/src/Evo.Api/Stores/Dtos/StoreDtos.cs`
- Do: add `public record StoreGeoDto(Guid Id, string Name, string? ChainName, byte Format, StoreCategory Category, double Latitude, double Longitude, Guid? ActiveRouteId, string? ActiveRouteCode, decimal SixMonthRevenue);`
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 2: Add GET /stores/geo endpoint
- Files: `backend/src/Evo.Api/Controllers/StoresController.cs`
- Do: add `[Authorize] [HttpGet("geo")] public async Task<ActionResult<IReadOnlyList<StoreGeoDto>>> Geo([FromQuery] string? province, [FromQuery] string? district, [FromQuery] bool? onRoute)`. `[Authorize]` = any authenticated user (clarification #13, matches `GET /stores`). Require `province` (else `return BadRequest(...)` / throw the project's validation exception). Query `_db.Stores` where `Province == province`, `Location != null`, optional `District`. Left-join active `route_stop` (`RouteStops` where `StoreId == s.Id && EffectiveTo == null`) to get `RouteId`; join `Routes` for `RouteCode`. Apply `onRoute` filter (true = has active stop, false = none). Sum last-6-months `StoreRevenues` for `SixMonthRevenue`. Project to `StoreGeoDto` with `Latitude = s.Location!.Y`, `Longitude = s.Location!.X`. `.Take(5000)`.
- Verify: `dotnet build backend/Evo.sln` succeeds; endpoint appears in Swagger at `/swagger` when running.
- Status: [x]

## Task 3: Backend tests for the geo endpoint
- Files: `backend/tests/Evo.Api.Tests/Stores/StoresGeoEndpointTests.cs`
- Do: xUnit tests using the existing WebApplicationFactory/test-DB pattern (copy setup from an existing `Evo.Api.Tests/Stores/` test): (a) located store returns non-null lat/lng; (b) null-`Location` store is omitted; (c) store on an active route returns its `ActiveRouteId`/`ActiveRouteCode`, a pool store returns null; (d) `onRoute=false` returns pool only; (e) missing `province` → 400.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~StoresGeoEndpointTests` passes.
- Status: [x]

## Task 4: Add ReorderStopsRequest DTO (clarification #14)
- Files: `backend/src/Evo.Api/Routes/Dtos/` (add to the existing route-stop DTO file, e.g. `RouteStopDtos.cs` — locate the file that already holds `MoveStopRequest`/stop DTOs)
- Do: add `public record ReorderStopsRequest(IReadOnlyList<Guid> StopIds);` — the route's active stops in their new sequence order.
- Verify: `dotnet build backend/Evo.sln` succeeds.
- Status: [x]

## Task 5: Add POST /routes/{id}/stops:reorder endpoint (clarification #14)
- Files: `backend/src/Evo.Api/Controllers/RoutesController.cs`
- Do: add `[Authorize(Roles = Roles.Supervisor)] [HttpPost("{id:guid}/stops:reorder")] public async Task<ActionResult<RouteDetailDto>> ReorderStops(Guid id, ReorderStopsRequest req)`. Load the route's active stops (`EffectiveTo == null`). Validate `req.StopIds` is **exactly** that set — same count, no missing/unknown ids — else `return BadRequest(...)` via the shared ProblemDetails shape. In one transaction assign `sequence = index + 1` for each id in order; write one `IRouteChangeLog` entry (action e.g. `StopsReordered`, before/after sequence). Return the route via the same `RouteDetailDto` projection `PATCH /stops/{stopId}` uses (reuse the existing loader/mapper). Mirror the existing stop-write endpoints for authorization/IDOR scoping.
- Verify: `dotnet build backend/Evo.sln` succeeds; endpoint appears in Swagger.
- Status: [x]

## Task 6: Backend tests for the reorder endpoint
- Files: `backend/tests/Evo.Api.Tests/Routes/RouteStopsReorderTests.cs`
- Do: xUnit tests (copy the WebApplicationFactory/test-DB + seeded-route setup from an existing `Evo.Api.Tests/Routes/` test): (a) a valid full-order payload persists `sequence = index+1` for every stop and returns the updated `RouteDetailDto`; (b) a payload missing a stop id → 400; (c) a payload with an unknown id → 400; (d) the reorder writes exactly one audit-log entry.
- Verify: `dotnet test backend/Evo.sln --filter FullyQualifiedName~RouteStopsReorderTests` passes.
- Status: [x]

## Task 7: Regenerate contract + TS client
- Files: `contracts/openapi.json` (generated), `panel/src/api/generated/schema.ts` (generated)
- Do: run `dotnet build backend/Evo.sln` (regenerates `contracts/openapi.json`), then `cd panel && npm run generate-api-client`.
- Verify: `git diff --stat contracts/openapi.json panel/src/api/generated/schema.ts` shows `/stores/geo` + `StoreGeoDto` **and** `/routes/{id}/stops:reorder` + `ReorderStopsRequest` added; `grep -c "stores/geo" panel/src/api/generated/schema.ts` ≥ 1 and `grep -c "stops:reorder\|ReorderStopsRequest" panel/src/api/generated/schema.ts` ≥ 1.
- Status: [x]

## Task 8: Add panel dependencies
- Files: `panel/package.json`
- Do: `cd panel && npm install maplibre-gl @tanstack/react-query zustand @dnd-kit/core @dnd-kit/sortable react-i18next i18next recharts @turf/boolean-point-in-polygon @turf/helpers`.
- Verify: the packages appear under `dependencies` in `panel/package.json`; `npm run build` succeeds.
- Status: [x]

## Task 9: Bootstrap i18n
- Files: `panel/src/i18n/index.ts`, `panel/src/i18n/locales/tr.json`
- Do: `index.ts` — init `i18next` with `react-i18next`, `lng: 'tr'`, `fallbackLng: 'tr'`, `resources: { tr: { translation: tr } }` importing `tr.json`. Seed `tr.json` with a few keys used by the shell (`app.title`, `planner.title`, `common.clear`, `common.cancel`, `common.save`, `common.publish`).
- Verify: `npx tsc -b` passes; `tr.json` is valid JSON (`node -e "require('./panel/src/i18n/locales/tr.json')"`).
- Status: [x]

## Task 10: Wire i18n + QueryClientProvider into the app root
- Files: `panel/src/main.tsx`, `panel/src/api/queryClient.ts`
- Do: create `queryClient.ts` exporting `export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })`. In `main.tsx`, `import './i18n'` and wrap `<App/>` in `<QueryClientProvider client={queryClient}>`.
- Verify: `npm run build` succeeds; `npm run dev` starts and the app still loads at `/`.
- Status: [x]

## Task 11: Typed planner API layer
- Files: `panel/src/api/planner.ts`
- Do: export async functions wrapping `authorizedFetch` (import from `./client` — export it if not already exported; if `authorizedFetch` is not exported, add `export` to it in `client.ts`) that return generated `components['schemas'][...]` types: `listRoutes(province?, status?)`, `getRoute(id)`, `getStoresGeo(province, onRoute?)`, `getPlan(id, from, to)`, `getHealth(id)`, `validateRoute(id)`, `bulkAddStops(id, body)`, `updateStop(id, stopId, body)`, `reorderStops(id, stopIds)` (`POST /routes/{id}/stops:reorder`, body `{ stopIds }`, returns `RouteDetailDto`), `moveStop(id, stopId, targetRouteId)`, `createPatch(id, body)`, `publishRoute(id, body)`. Each builds the URL, throws on `!res.ok`, and returns the parsed typed body.
- Verify: `npx tsc -b` passes; no `any` — types resolve from `schema.ts`.
- Status: [x]

## Task 12: Export authorizedFetch for reuse
- Files: `panel/src/api/client.ts`
- Do: if not done in Task 11, add `export` to `authorizedFetch` so `planner.ts` reuses the 401-refresh interceptor rather than re-implementing auth.
- Verify: `grep -n "export async function authorizedFetch" panel/src/api/client.ts` matches; `npx tsc -b` passes.
- Status: [x]

## Task 13: Phase-1 verification pass
- Files: (none — verification only)
- Do: run the full gate: `dotnet test backend/Evo.sln`, `cd panel && npm run lint && npm test && npm run build`.
- Verify: backend suite green (prior + new geo + reorder tests); panel lint/test/build all pass.
- Status: [x]

<!-- HARD STOP — Phase 1 checkpoint: summarize (geo API + batch stops:reorder endpoint + client regen +
     panel deps + i18n/query bootstrap), show test/build evidence, commit
     `feat(006): geo API + batch stop-reorder endpoint + panel foundations (deps, i18n, query client)`,
     no UI to manually test yet (state it), then "CHECKPOINT — waiting for your go/feedback" and END THE
     TURN. (All prior open questions on geo auth / reorder shape are now settled — nothing to ask.) -->

---

## Phase 2 — Workspace shell & shared state

## Task 14: Zustand workspace store
- Files: `panel/src/planner/state/workspaceStore.ts`
- Do: `create` a store `{ province: string; focusedRouteId: string | null; selection: Set<string>; layout: 'split'|'map'|'schedule'|'table' }` + actions `setProvince`, `focusRoute(id)`, `clearFocus()`, `toggleSelect(id)`, `setSelection(ids)`, `clearSelection()`, `setLayout(l)`. Default province from a constant (e.g. `'Adana'` — matches seeded data), layout `'split'`.
- Verify: `npx tsc -b` passes.
- Status: [x]

## Task 15 [P]: Workspace store unit tests
- Files: `panel/src/planner/state/workspaceStore.test.ts`
- Do: Vitest tests — `focusRoute` sets `focusedRouteId`; `clearFocus` nulls it; `toggleSelect` adds then removes; `setSelection`/`clearSelection` behave; `setLayout` switches.
- Verify: `npm test -- workspaceStore` passes.
- Status: [x]

## Task 16: TanStack Query read hooks
- Files: `panel/src/planner/api/queries.ts`
- Do: export `useRoutes(province, status?)`, `useRoute(id)`, `useStoresGeo(province, onRoute?)`, `usePlan(id, from, to)`, `useHealth(id)` — each a `useQuery` with a stable `queryKey` (e.g. `['route', id]`) calling the matching `planner.ts` function, `enabled` guarded on required args.
- Verify: `npx tsc -b` passes.
- Status: [x]

## Task 17: TanStack Query mutation hooks (live-health wiring)
- Files: `panel/src/planner/api/mutations.ts`
- Do: export `useBulkAddStops`, `useUpdateStop`, `useReorderStops`, `useMoveStop`, `useCreatePatch`, `usePublish` — each a `useMutation` calling the matching `planner.ts` function and in `onSuccess` invalidating `['route', id]`, `['plan', id]`, `['health', id]`, and `['stores-geo', province]` (move/bulk-add also invalidate any target route). `useReorderStops` calls `planner.reorderStops(id, stopIds)`. Take `queryClient` from `useQueryClient()`.
- Verify: `npx tsc -b` passes.
- Status: [x]

## Task 18: TopFilterBar component
- Files: `panel/src/planner/components/TopFilterBar.tsx`
- Do: render a province `<select>` (bound to `setProvince`), a route `<select>` populated from `useRoutes(province)` (bound to `focusRoute`), and four layout preset buttons `Map · Split · Schedule · Table` (bound to `setLayout`, active state highlighted). All labels via `t()`. Use `theme/tokens` for styling.
- Verify: `npx tsc -b` passes.
- Status: [x]

## Task 19: RouteRail component
- Files: `panel/src/planner/components/RouteRail.tsx`
- Do: left rail listing `useRoutes(province)` items (code, name, status badge, stop count). Clicking a row calls `focusRoute(id)`; the focused row is highlighted; clicking the focused row again calls `clearFocus`.
- Verify: `npx tsc -b` passes.
- Status: [x]

## Task 20: WorkspaceLayout with draggable divider
- Files: `panel/src/planner/components/WorkspaceLayout.tsx`
- Do: render a Map | Schedule split with a draggable vertical divider (mouse-drag adjusts the split %; clamp 20–80%). Respect `layout`: `map`/`schedule` maximize one pane, `split` shows both, `table` shows a bottom selection-list strip. Accept `map`, `schedule`, `bottom` as slots/children.
- Verify: `npx tsc -b` passes.
- Status: [x]

## Task 21: PlannerPage shell
- Files: `panel/src/planner/PlannerPage.tsx`
- Do: compose `TopFilterBar` (top), `RouteRail` (left), `WorkspaceLayout` (center) with placeholder pane children, and a docked right slot for the detail panel (placeholder for now). Add a keydown handler: Esc → `clearFocus()` + `clearSelection()`.
- Verify: `npx tsc -b` passes.
- Status: [x]

## Task 22: Route /planner + Dashboard link
- Files: `panel/src/App.tsx`, `panel/src/pages/Dashboard.tsx`
- Do: add `<Route path="/planner" element={<ProtectedRoute><PlannerPage/></ProtectedRoute>} />`; add a link/button on the Dashboard to `/planner` (label via `t()`).
- Verify: `npm run dev`; log in; click through to `/planner` and the shell (filter bar + rail + split) renders without console errors.
- Status: [x]

## Task 23: Phase-2 verification pass
- Files: (none)
- Do: `cd panel && npm run lint && npm test && npm run build`.
- Verify: all pass; `/planner` shell renders with province select, route rail (populated from seeded routes), layout buttons, and Esc clears focus.
- Status: [x]

<!-- HARD STOP — Phase 2 checkpoint: summarize shell + shared state, evidence, commit
     `feat(006): planner workspace shell + shared Zustand/Query state`. Manual UI test script:
     1) log in → click "Planlama" → lands on /planner; 2) route rail lists seeded routes; 3) click a route
     → row highlights; 4) Esc → highlight clears; 5) layout buttons switch pane emphasis. Then
     "CHECKPOINT — waiting for your go/feedback" and END THE TURN. -->

---

## Phase 3 — Map pane

## Task 24: useMapLibre lifecycle hook
- Files: `panel/src/planner/components/map/useMapLibre.ts`
- Do: hook that creates a `maplibregl.Map` once (style `https://demotiles.maplibre.org/style.json`, Turkey center `[35, 39]`, zoom 5) into a passed container ref, returns the map instance, and cleans it up (`map.remove()`) on unmount. Import `'maplibre-gl/dist/maplibre-gl.css'`.
- Verify: `npx tsc -b` passes.
- Status: [x]

## Task 25: MapPane shell
- Files: `panel/src/planner/components/map/MapPane.tsx`
- Do: a full-size container div wired to `useMapLibre`; render into the WorkspaceLayout `map` slot in `PlannerPage`.
- Verify: `npm run dev` → `/planner` shows a rendered map that pans/zooms; no console errors on navigate away (cleanup works).
- Status: [x]

## Task 26: Store GeoJSON source + circle layer
- Files: `panel/src/planner/components/map/storeLayer.ts`, `panel/src/planner/components/map/MapPane.tsx`
- Do: `storeLayer.ts` — helpers to convert `StoreGeoDto[]` (from `useStoresGeo(province)`) to a GeoJSON FeatureCollection and to add/update a `stores` source + `circle` layer on the map (update the source's data on change, don't recreate the layer). Call from MapPane on data/province change.
- Verify: `npm run dev` → seeded-province stores appear as circles; changing province refits and swaps pins.
- Status: [x]

## Task 27: Color coding by chain / category / on-route
- Files: `panel/src/planner/components/map/storeLayer.ts`
- Do: MapLibre `circle-color` (chain fill), `circle-stroke-color`/`circle-stroke-width` (category ring), and `circle-opacity` faded when `ActiveRouteId` is set and not the focused route; highlighted (larger radius / full opacity) when on the focused route. Drive via feature properties + `focusedRouteId`. Use `theme/tokens` colors.
- Verify: `npm run dev` → pins on other routes render faded; focusing a route highlights its pins.
- Status: [x]

## Task 28: Pin click popover
- Files: `panel/src/planner/components/map/StorePopover.tsx`, `panel/src/planner/components/map/MapPane.tsx`
- Do: on `click` of the stores layer, open a popover (MapLibre `Popup` or an absolutely-positioned React node) showing name, chain, category badge, format, 6-month revenue (formatted TRY), and current route code or `t('planner.pool')`. Include "Add to route" / "Move here" buttons (wired in Phase 6 — stub the handlers now, disabled when no focused route).
- Verify: `npm run dev` → clicking a pin shows the popover with correct data.
- Status: [x]

## Task 29: Province-scoped fetch (no out-of-province render)
- Files: `panel/src/planner/components/map/MapPane.tsx`
- Do: ensure `useStoresGeo` is called with the current `province` only; on province change refetch + `map.fitBounds` to the new pins. Confirm out-of-province stores are never in the source (they are not fetched).
- Verify: switch province → only that province's pins render, map recenters.
- Status: [x]

## Task 30: Lasso hit-test util
- Files: `panel/src/planner/components/map/lasso.ts`, `panel/src/planner/components/map/lasso.test.ts`
- Do: `lasso.ts` — `storesInPolygon(stores: StoreGeoDto[], polygon: number[][]): string[]` using `@turf/boolean-point-in-polygon`, returning ids of pool stores (`ActiveRouteId == null`) inside. Vitest test with a fixed square polygon + points inside/outside.
- Verify: `npm test -- lasso` passes.
- Status: [x]

## Task 31: Lasso draw tool (human-only path)
- Files: `panel/src/planner/components/map/MapPane.tsx`, `panel/src/planner/components/map/LassoTool.tsx`
- Do: a toolbar toggle enters "lasso" mode; freehand/point-click polygon capture on the map; on close, `storesInPolygon(...)` → `setSelection(ids)`; a badge shows "N selected". (Simple polygon capture — click to add vertices, double-click/Enter to close is acceptable.) This is the human-facing selection path; the e2e uses the checkbox list (Task 56) instead (clarification #10).
- Verify: `npm run dev` → drawing a lasso around pool pins selects them (badge count matches).
- Status: [x]

## Task 32: Focus-driven map highlight from rail/select
- Files: `panel/src/planner/components/map/MapPane.tsx`
- Do: subscribe to `focusedRouteId`; when it changes, re-evaluate the circle paint (highlight the focused route's stops) and optionally fit to them.
- Verify: `npm run dev` → clicking a route in the rail highlights its stores on the map.
- Status: [x]

## Task 33: Phase-3 verification pass
- Files: (none)
- Do: `cd panel && npm run lint && npm test && npm run build`.
- Verify: all pass; map renders seeded pins, color coding, popover, lasso selection, focus highlight.
- Status: [x]

<!-- HARD STOP — Phase 3 checkpoint: summarize map pane, evidence, commit `feat(006): MapLibre store layer +
     popover + lasso`. Manual UI test script: 1) /planner shows a map with pins in the seeded province;
     2) pins on other routes look faded; 3) click a pin → popover with revenue + route; 4) lasso a few pool
     pins → "N selected" badge; 5) switch province → pins swap. Then "CHECKPOINT — waiting for your
     go/feedback" and END THE TURN. -->

---

## Phase 4 — Route detail panel & live health card

## Task 34: RouteDetailPanel scaffold
- Files: `panel/src/planner/components/panel/RouteDetailPanel.tsx`
- Do: docked-right panel reading `useRoute(focusedRouteId)`; header shows route code/name/status badge + current assignee (from `currentAssignment`); empty state (`t('planner.noRouteFocused')`) when none focused. Mount into PlannerPage's right slot.
- Verify: `npm run dev` → focusing a route shows its header; clearing focus shows the empty state.
- Status: [x]

## Task 35: Stops list
- Files: `panel/src/planner/components/panel/StopsList.tsx`
- Do: render `RouteDetailDto.stops` ordered by `sequence` — each row: sequence #, store name, service minutes, frequency badge (Daily/Weekly/Biweekly via `t()`). Static list for now (drag added in Phase 6).
- Verify: `npm run dev` → focused route lists its stops in sequence order.
- Status: [x]

## Task 36: HealthCard — revenue bar
- Files: `panel/src/planner/components/panel/HealthCard.tsx`
- Do: from `useHealth(id)` render a horizontal Recharts bar of `sixMonthRevenue` vs `revenueTarget`, green when `revenueMet` else red (use `theme/tokens`). Show formatted values + target label.
- Verify: `npm run dev` → focused route shows the revenue bar with correct color.
- Status: [x]

## Task 37: HealthCard — minutes-by-weekday bar
- Files: `panel/src/planner/components/panel/HealthCard.tsx`
- Do: add a Recharts bar chart of `minutesByWeekday` (Mon–Fri) with a `ReferenceLine y={450}`; bars over 450 red, under amber, else green.
- Verify: `npm run dev` → weekday minutes render with the 450 reference line.
- Status: [x]

## Task 38: HealthCard — category-mix donut + finding chips
- Files: `panel/src/planner/components/panel/HealthCard.tsx`
- Do: add a Recharts `PieChart` (donut) of `categoryMix`; below it render `errorCount` 🔴 and `warningCount` 🟡 as chips (severity colors from `theme/tokens`).
- Verify: `npm run dev` → donut + finding-count chips render.
- Status: [x]

## Task 39 [P]: HealthCard unit test
- Files: `panel/src/planner/components/panel/HealthCard.test.tsx`
- Do: Vitest + Testing Library — render `HealthCard` with a fixed `HealthDto` (mock the `useHealth` hook) and assert the revenue value, a 450-over weekday, and the finding counts appear.
- Verify: `npm test -- HealthCard` passes.
- Status: [x]

## Task 40: Panel loading/error/empty states
- Files: `panel/src/planner/components/panel/RouteDetailPanel.tsx`, `HealthCard.tsx`
- Do: handle `isLoading`/`isError` from the queries (spinner / retry text via `t()`); guard against a draft route with no health/plan yet (no crash).
- Verify: `npm run dev` → focusing a fresh draft route shows graceful states, not a crash.
- Status: [x]

## Task 41: Wire panel into focus changes
- Files: `panel/src/planner/PlannerPage.tsx`
- Do: ensure the right slot always renders `RouteDetailPanel`, which internally reacts to `focusedRouteId`. Confirm switching focus swaps panel content without remount flicker.
- Verify: `npm run dev` → switching routes updates the panel + health smoothly.
- Status: [x]

## Task 42: TRY/number formatting helper
- Files: `panel/src/planner/format.ts`
- Do: small helpers `formatTRY(n)` (Intl.NumberFormat `tr-TR`, currency TRY) and `formatMinutes(n)`; use them in HealthCard/popover/stops.
- Verify: `npx tsc -b` passes; revenue shows as `₺1.310.000` style.
- Status: [x]

## Task 43: Phase-4 verification pass
- Files: (none)
- Do: `cd panel && npm run lint && npm test && npm run build`.
- Verify: all pass; panel + 3 health visuals + finding chips render for a focused route.
- Status: [x]

<!-- HARD STOP — Phase 4 checkpoint: summarize panel + health card, evidence, commit
     `feat(006): route detail panel + live health card (Recharts)`. Manual UI test script: 1) focus a route
     → panel shows code/name/assignee + stops; 2) revenue bar colored by target; 3) weekday minutes bar with
     450 line; 4) category donut + finding-count chips. Then "CHECKPOINT — waiting for your go/feedback" and
     END THE TURN. -->

---

## Phase 5 — Schedule grid pane (with prev/next week navigation)

## Task 44: Week window helper (current/prev/next)
- Files: `panel/src/planner/schedule/week.ts`
- Do: export `currentWeek(): { from: string; to: string }` (ISO Mon–Fri of the current week), plus `prevWeek(from)` and `nextWeek(from)` that shift a given `from` date by ∓7 days and return the new Mon–Fri `{ from, to }` range. These drive the plan query window and the week navigator (clarification #11).
- Verify: `npx tsc -b` passes.
- Status: [x]

## Task 45 [P]: Week helper unit test
- Files: `panel/src/planner/schedule/week.test.ts`
- Do: Vitest — for a fixed date, assert `currentWeek()` returns the correct Mon–Fri range; `nextWeek(from)` returns the range +7 days; `prevWeek(from)` returns −7 days.
- Verify: `npm test -- week` passes.
- Status: [x]

## Task 46: SchedulePane scaffold + plan query (week held in local state)
- Files: `panel/src/planner/components/schedule/SchedulePane.tsx`
- Do: hold the visible week in local state `const [week, setWeek] = useState(currentWeek())`; read `usePlan(focusedRouteId, week.from, week.to)`; render a day-column grid (Mon–Fri) shell with a time axis (day_start 09:00 → ~18:00). Mount into the WorkspaceLayout `schedule` slot.
- Verify: `npm run dev` → focusing a route shows a 5-day grid with a time axis for the current week.
- Status: [x]

## Task 47: Week navigator (prev / this-week / next)
- Files: `panel/src/planner/components/schedule/WeekNavigator.tsx`, `panel/src/planner/components/schedule/SchedulePane.tsx`
- Do: a header showing the visible week's Mon–Fri date range (formatted `tr-TR`) with **‹ prev** and **next ›** buttons and a **"Bu hafta"** reset button (all labels via `t()`). Wire prev → `setWeek(prevWeek(week.from))`, next → `setWeek(nextWeek(week.from))`, reset → `setWeek(currentWeek())`; the plan query re-runs for the new window.
- Verify: `npm run dev` → clicking next/prev shifts the visible week (date range + visits update); "Bu hafta" returns to the current week.
- Status: [x]

## Task 48: Time-accurate visit blocks
- Files: `panel/src/planner/components/schedule/VisitBlock.tsx`, `SchedulePane.tsx`
- Do: for each `PlanDayDto.visits`, position/size a block by `start`/`end` (top/height from minutes-since-day-start). Label = store name + minutes. `source == Patch` (2) → dashed border. Color by category if available else neutral.
- Verify: `npm run dev` → visits render as calendar-style blocks at the right times; patched ones dashed.
- Status: [x]

## Task 49: Statutory break blocks
- Files: `panel/src/planner/schedule/breaks.ts`, `SchedulePane.tsx`
- Do: a shared constant for the three breaks (lunch 12:30–13:30, tea 10:30–10:45, tea 15:00–15:15 — matching 005's seeded `break_blocks`, clarification #12); render them as locked grey blocks in every day column, non-interactive.
- Verify: `npm run dev` → grey break blocks appear at the right times in each column.
- Status: [x]

## Task 50: Per-day minutes vs 450
- Files: `panel/src/planner/components/schedule/SchedulePane.tsx`
- Do: each column footer shows `PlanDayDto.plannedMinutes` / 450 with over/under coloring (`theme/tokens` loadStatusColors).
- Verify: `npm run dev` → each day shows its minutes total, colored.
- Status: [x]

## Task 51: Finding chips per day
- Files: `panel/src/planner/components/schedule/SchedulePane.tsx`
- Do: render `PlanDayDto.findings` as small chips under the affected day, severity-colored (`severityColors`), tooltip = message.
- Verify: `npm run dev` → a day with an under/over-450 finding shows a chip.
- Status: [x]

## Task 52: Schedule loading/empty/error states
- Files: `panel/src/planner/components/schedule/SchedulePane.tsx`
- Do: handle no focused route (prompt to pick one), loading spinner, error retry, and a draft route with no plan (friendly empty state) — no crash.
- Verify: `npm run dev` → each state renders cleanly.
- Status: [x]

## Task 53 [P]: Visit-block positioning unit test
- Files: `panel/src/planner/schedule/position.ts`, `panel/src/planner/schedule/position.test.ts`
- Do: extract a pure `blockGeometry(start, end, dayStart)` → `{ topPx, heightPx }`; Vitest for a 10:00–10:30 visit vs day_start 09:00.
- Verify: `npm test -- position` passes.
- Status: [x]

## Task 54: Mount schedule respecting layout presets
- Files: `panel/src/planner/PlannerPage.tsx`
- Do: ensure the `schedule`/`split` layout presets show the SchedulePane and `map` hides it (and vice-versa), via WorkspaceLayout.
- Verify: `npm run dev` → layout buttons correctly show/hide the schedule.
- Status: [x]

## Task 55: Phase-5 verification pass
- Files: (none)
- Do: `cd panel && npm run lint && npm test && npm run build`.
- Verify: all pass; schedule renders time-accurate visits, breaks, per-day minutes, findings, and the week navigator shifts weeks.
- Status: [x]

<!-- HARD STOP — Phase 5 checkpoint: summarize schedule grid + week navigator, evidence, commit
     `feat(006): time-accurate schedule grid + week navigator (breaks, minutes, findings)`. Manual UI test
     script: 1) focus a route → schedule shows the week's visits as timed blocks; 2) grey break blocks
     present; 3) per-day minutes vs 450 colored; 4) finding chips on affected days; 5) next/prev shifts the
     week, "Bu hafta" resets; 6) layout buttons show/hide the schedule. Then "CHECKPOINT — waiting for your
     go/feedback" and END THE TURN. -->

---

## Phase 6 — Selection & editing

## Task 56: Pool-store checkbox/list multi-select (e2e path, clarification #10)
- Files: `panel/src/planner/components/editing/SelectionListPane.tsx`
- Do: a scrollable list rendered in the WorkspaceLayout `bottom` strip (shown by the `table` preset) of the province's **pool** stores (`useStoresGeo(province, false)`) — each row a checkbox (`data-testid="select-store-{id}"`) wired to `toggleSelect(id)`, plus a "Tümünü seç" (select all in view) toggle. Rows reflect `selection` membership. This is the deterministic multi-select the Playwright flow drives (the lasso stays for humans). All labels via `t()`.
- Verify: `npm run dev` → switch to the `table` preset → pool stores listed; ticking a checkbox updates the selection count.
- Status: [x]

## Task 57: Selection floating action bar
- Files: `panel/src/planner/components/editing/SelectionBar.tsx`
- Do: appears when `selection.size > 0`; shows "N seçili" + buttons "Rotaya ekle (N)" and "Temizle" (`clearSelection`). "Add" disabled when no focused route. All labels via `t()`.
- Verify: `npm run dev` → selecting pool stores (checkbox list or lasso) shows the bar with the right count.
- Status: [x]

## Task 58: Bulk-add wiring
- Files: `panel/src/planner/components/editing/SelectionBar.tsx`
- Do: "Rotaya ekle" calls `useBulkAddStops(focusedRouteId, { storeIds:[...selection], frequency: Weekly, weekdayMask, serviceMinutes: null })`; on success clear selection.
- Verify: `npm run dev` → adding selected pool stores increases the route's stop count (panel updates) and pins un-fade.
- Status: [x]

## Task 59: Bulk-add result — accepted vs rejected
- Files: `panel/src/planner/components/editing/BulkAddResult.tsx`
- Do: render `BulkAddResultDto` after add — `added` count + a list of `rejected` (store + reason) each with a "Buraya taşı" (move here) button (wired in Task 62).
- Verify: `npm run dev` → adding a store already on another route shows it under rejected with its reason.
- Status: [x]

## Task 60: Stop edit form
- Files: `panel/src/planner/components/editing/StopEditForm.tsx`
- Do: opened from a stop row; fields frequency `<select>`, service-minutes number input, sequence number; Save → `useUpdateStop(id, stopId, body)`; Cancel closes. Labels via `t()`.
- Verify: `npm run dev` → editing a stop's minutes updates the panel + health + schedule.
- Status: [x]

## Task 61: dnd-kit sortable stops → batch reorder (clarification #14)
- Files: `panel/src/planner/components/panel/StopsList.tsx`
- Do: wrap the stops list in dnd-kit `DndContext` + `SortableContext`; on drag end, compute the new ordered `stopIds` and persist in **one call** via `useReorderStops(routeId, orderedStopIds)` (the `POST /routes/{id}/stops:reorder` batch endpoint — **not** N per-stop PATCHes). Optimistic reorder in the list, reconciled by the returned `RouteDetailDto` / query invalidation.
- Verify: `npm run dev` → dragging a stop reorders it with a single network call to `stops:reorder`; schedule re-renders in the new order after refetch.
- Status: [x]

## Task 62: Move-store wiring
- Files: `panel/src/planner/components/map/StorePopover.tsx`, `panel/src/planner/components/editing/BulkAddResult.tsx`
- Do: the "Move here"/"Buraya taşı" buttons call `useMoveStop(sourceRouteId, stopId, focusedRouteId)`. For a map popover on a store on another route, resolve its stopId via that route (or expose a move-by-store helper). Invalidate both routes.
- Verify: `npm run dev` → moving a store off another route reassigns it to the focused route (pin highlights, source route stop count drops).
- Status: [x]

## Task 63: Add-patch form
- Files: `panel/src/planner/components/editing/PatchForm.tsx`
- Do: form for MVP patch types `SkipStore | AddStore | TimeShift` (`<select>`), a store picker (for Skip/Add), a **mandatory `endsOn` date** (disable submit if empty — mirrors backend V9), optional `paramsJson`/reason; Save → `useCreatePatch(id, body)`.
- Verify: `npm run dev` → adding a SkipStore patch makes that visit disappear (or a TimeShift render dashed) in the schedule after refetch.
- Status: [x]

## Task 64: Client-side expiry validation
- Files: `panel/src/planner/components/editing/PatchForm.tsx`
- Do: block submit + show `t('planner.patchExpiryRequired')` when `endsOn` is empty or before `startsOn`.
- Verify: `npm run dev` → submitting without an expiry is blocked with the message.
- Status: [x]

## Task 65 [P]: Editing i18n keys
- Files: `panel/src/i18n/locales/tr.json`
- Do: add all editing strings (selection list, selection bar, stop edit, patch form, move, rejected reasons) as `t()` keys; confirm no hardcoded Turkish remains in Phase-6 components.
- Verify: `grep -rnE "[çğıöşüÇĞİÖŞÜ]" panel/src/planner/components/editing` returns only comments (no JSX string literals); `npx tsc -b` passes.
- Status: [x]

## Task 66: Phase-6 verification pass
- Files: (none)
- Do: `cd panel && npm run lint && npm test && npm run build`.
- Verify: all pass; checkbox-list select, bulk-add, stop edit, dnd batch-reorder, move, patch all update the panes + health live.
- Status: [x]

<!-- HARD STOP — Phase 6 checkpoint: summarize editing, evidence, commit
     `feat(006): selection editing — checkbox-list + bulk-add, stop edit, dnd batch-reorder, move, patch`.
     Manual UI test script: 1) table preset → tick pool stores in the list → bar shows count → "Rotaya ekle"
     → health/stops update; 2) add a cross-route store → shows under rejected with "move here"; 3) drag a
     stop to reorder → one stops:reorder call → schedule updates; 4) edit a stop's minutes → day total
     changes; 5) add a SkipStore patch → visit drops. Then "CHECKPOINT — waiting for your go/feedback" and
     END THE TURN. -->

---

## Phase 7 — Publish flow

## Task 67: PublishModal scaffold
- Files: `panel/src/planner/components/publish/PublishModal.tsx`
- Do: modal opened by a "Yayınla" button in the panel/toolbar; on open fetch `validateRoute(id)` (or reuse `useHealth`) and list findings grouped by severity (🔴 errors, 🟡 warnings), each with code + message.
- Verify: `npm run dev` → clicking Publish opens the modal listing the route's findings.
- Status: [x]

## Task 68: Clean publish path (no errors)
- Files: `panel/src/planner/components/publish/PublishModal.tsx`
- Do: when `errorCount == 0`, the Publish button calls `usePublish(id, {})`; on success show `visitsMaterialized` (`t()`) and a close button.
- Verify: `npm run dev` → publishing an error-free route succeeds and shows the materialized count.
- Status: [x]

## Task 69: Override-with-reason gate
- Files: `panel/src/planner/components/publish/PublishModal.tsx`
- Do: when `errorCount > 0`, show required `reason` + `objective` textareas; the Publish button stays disabled until both non-empty (mirrors backend 422); submit passes them to `usePublish`.
- Verify: `npm run dev` → publishing a route with errors requires both fields before enabling.
- Status: [x]

## Task 70: Override result display
- Files: `panel/src/planner/components/publish/PublishModal.tsx`
- Do: on override success show `overrodeErrors: true` + the `decisionJournalId` (`t('planner.decisionRecorded')`).
- Verify: `npm run dev` → overriding shows the recorded-decision confirmation with an id.
- Status: [x]

## Task 71: Post-publish invalidation
- Files: `panel/src/planner/api/mutations.ts`, `PublishModal.tsx`
- Do: confirm `usePublish.onSuccess` invalidates `['route', id]`, `['plan', id]`, `['health', id]`; close the modal after success so the workspace reflects the published plan.
- Verify: `npm run dev` → after publish, the schedule/health refresh without a manual reload.
- Status: [x]

## Task 72: Publish button placement + guards
- Files: `panel/src/planner/components/panel/RouteDetailPanel.tsx`
- Do: add the "Yayınla" button to the panel header, disabled when no route is focused or a publish is in flight (`isPending`).
- Verify: `npm run dev` → button disabled with no focus, spinner/disabled while publishing.
- Status: [x]

## Task 73 [P]: PublishModal unit test
- Files: `panel/src/planner/components/publish/PublishModal.test.tsx`
- Do: Vitest — with mocked findings containing an error, assert Publish is disabled until reason+objective filled; with no errors, assert Publish is enabled immediately.
- Verify: `npm test -- PublishModal` passes.
- Status: [x]

## Task 74: Publish i18n keys
- Files: `panel/src/i18n/locales/tr.json`
- Do: add all publish strings via `t()` (title, reason/objective labels, success/override messages, warnings).
- Verify: no hardcoded Turkish in `publish/`; `npx tsc -b` passes.
- Status: [x]

## Task 75: Phase-7 verification pass
- Files: (none)
- Do: `cd panel && npm run lint && npm test && npm run build`.
- Verify: all pass; both publish paths (clean + override) work and refresh the workspace.
- Status: [x]

<!-- HARD STOP — Phase 7 checkpoint: summarize publish flow, evidence, commit
     `feat(006): publish flow — review modal + override-with-reason gate`. Manual UI test script: 1) focus a
     clean route → Yayınla → succeeds, shows materialized count; 2) focus a route with a 🔴 finding → Yayınla
     → reason+objective required → fill → publish → shows "decision recorded" + id; 3) workspace refreshes
     after publish. Then "CHECKPOINT — waiting for your go/feedback" and END THE TURN. -->

---

## Phase 8 — Tests, i18n sweep, docs

## Task 76: Mutation-invalidation unit test
- Files: `panel/src/planner/api/mutations.test.ts`
- Do: Vitest — mock `planner.ts` + a `QueryClient`; assert `useBulkAddStops.onSuccess` and `useReorderStops.onSuccess` invalidate the route/plan/health/stores-geo keys (spy on `invalidateQueries`).
- Verify: `npm test -- mutations` passes.
- Status: [x]

## Task 77: i18n completeness sweep
- Files: `panel/src/planner/**`, `panel/src/i18n/locales/tr.json`
- Do: grep all planner components for Turkish string literals in JSX; move any stragglers to `tr.json` keys; ensure `tr.json` has no missing keys referenced by `t()`.
- Verify: `grep -rnE ">[^<]*[çğıöşüÇĞİÖŞÜ]" panel/src/planner` returns nothing (all via `t()`); `npm run build` passes.
- Status: [x]

## Task 78: Playwright config for live backend
- Files: `panel/playwright.config.ts`, `panel/tests/e2e/README.md`
- Do: ensure the Playwright config points `baseURL` at the dev server (`:5173`) with the Vite proxy to backend `:5076`; README documents prereqs (backend + SQL Server up, `dotnet run --project backend/src/Evo.Seeder -- --profile demo`, login `admin@evo.local`/`Demo1234!`).
- Verify: `npx playwright test --list` shows the suite; README lists prereqs.
- Status: [x]

## Task 79: E2E — login + open workspace
- Files: `panel/tests/e2e/planner-core.spec.ts`
- Do: step 1 — log in via the UI (or seed a session), navigate to `/planner`, assert the filter bar + route rail render with ≥1 seeded route.
- Verify: `npx playwright test planner-core` passes step 1 (with seeded backend running).
- Status: [x]

## Task 80: E2E — filter to a route
- Files: `panel/tests/e2e/planner-core.spec.ts`
- Do: step 2 — click the first route in the rail; assert the detail panel shows that route (code visible) and the health card renders.
- Verify: `npx playwright test planner-core` passes through step 2.
- Status: [x]

## Task 81: E2E — bulk-add a store (checkbox-list path)
- Files: `panel/tests/e2e/planner-core.spec.ts`
- Do: step 3 — switch to the `table` preset, tick a pool store in the checkbox list (`data-testid="select-store-*"` — the multi-select path, **not** the freehand lasso, per clarification #10), click "Rotaya ekle", assert the stop count / stops list increases.
- Verify: `npx playwright test planner-core` passes through step 3.
- Status: [x]

## Task 82: E2E — health updates
- Files: `panel/tests/e2e/planner-core.spec.ts`
- Do: step 4 — capture a health value (e.g. a weekday's minutes or stop count) before the add and assert it changed after (proves live invalidation).
- Verify: `npx playwright test planner-core` passes through step 4.
- Status: [x]

## Task 83: E2E — publish
- Files: `panel/tests/e2e/planner-core.spec.ts`
- Do: step 5 — click Yayınla; if the review modal shows errors, fill reason+objective; confirm; assert the success/materialized message. Make the flow tolerant of both clean and override paths.
- Verify: `npx playwright test planner-core` passes end-to-end (with seeded backend).
- Status: [x]

## Task 84: Update docs — ARCHITECTURE + API
- Files: `docs/ARCHITECTURE.md`, `docs/API.md`
- Do: ARCHITECTURE — add the panel workspace architecture (shared Zustand store + TanStack Query, MapLibre/dnd-kit/Recharts/react-i18next), mark the Planner UI as landed for M1. API — document `GET /api/v1/stores/geo` (params, `StoreGeoDto`, auth) **and `POST /api/v1/routes/{id}/stops:reorder` (`ReorderStopsRequest`, returns `RouteDetailDto`, Supervisor)**.
- Verify: both docs mention the new pieces; `grep -n "stores/geo" docs/API.md` and `grep -n "stops:reorder" docs/API.md` match.
- Status: [x]

## Task 85: Update docs — DECISIONS + ROADMAP
- Files: `docs/DECISIONS.md`, `docs/ROADMAP.md`
- Do: DECISIONS — record: geo-API-in-006, the batch stops:reorder endpoint, the library choices (MapLibre/dnd-kit/Zustand+TanStack/react-i18next/Recharts) with the Recharts-over-visx justification, and the reassignment/simulate/Effective-Base/full-table deferrals. ROADMAP — flip the "Planner UI spec" M1 item toward done and note remaining deferrals as later specs.
- Verify: `grep -n "006" docs/DECISIONS.md` and `docs/ROADMAP.md` show the new entries.
- Status: [x]

## Task 86: Final Phase 8 verification pass
- Files: (none)
- Do: `dotnet test backend/Evo.sln`; `cd panel && npm run lint && npm test && npm run build`; with the seeded backend running, `npx playwright test`.
- Verify: backend green, panel lint/test/build green, Playwright core flow green.
- Status: [x]

<!-- HARD STOP — Phase 8 checkpoint (not the final one — Phase 9 visual-parity pass follows per
     Clarification #15). Summarize tests/i18n/docs, evidence, commit `feat(006): planner UI tests + docs`,
     manual test script = the Playwright core flow run manually once. Then "CHECKPOINT — waiting for your
     go/feedback" and END THE TURN. -->

---

## Phase 9 — Visual-parity pass against the prototype (Clarification #15)

<!-- Added 2026-07-17 after the user flagged that Phases 1-5 used generic inline styles instead of the
     prototype's actual CSS. Before this phase: invoke the design-system skill and re-read
     evo-planner-prototype-v0.5.html's actual CSS block (style tag, ~line 60-320) — pane-head bars, the
     compact 10-13px type scale, border colors, badge/chip shapes, map marker numbering. Go pane-by-pane;
     each task's "Do" should name the exact prototype selector(s) being ported. -->

## Task 87: Global chrome parity
- Files: `panel/src/planner/components/TopFilterBar.tsx`, `panel/src/planner/PlannerPage.tsx`
- Do: match the prototype's top bar (`#topbar`, line ~296-317): app name + version left, province/route/week controls center-left, layout toggle group, right-aligned search + Yayınla + icon buttons. Match spacing/border/font-size exactly, not approximately.
- Verify: `npm run dev` → side-by-side with the prototype screenshot, top bar matches (spacing, borders, button styles).
- Status: [x]

## Task 88: Route rail parity
- Files: `panel/src/planner/components/RouteRail.tsx`
- Do: match the prototype's `#leftPane`/rail rows (line ~110-... `.rutItem`-style rows): route code + assignee + revenue + warning icon + stop count, "Havuz (N)" pool section, "+ Yeni rut" button. Add the pool-count badge next to "Rutlar/Havuz" tabs if present in the prototype.
- Verify: `npm run dev` → rail matches the prototype's route-list density and iconography.
- Status: [x]

## Task 89: Map pane parity — numbered markers + route polylines
- Files: `panel/src/planner/components/map/storeLayer.ts`, `MapPane.tsx`
- Do: add a `symbol` layer showing each stop's sequence number on its marker when a route is focused (matching the prototype's numbered circles), and a `line` layer drawing the focused route's stop-to-stop polyline in sequence order. Match the prototype's pane-head bar (`HARİTA — pin: tıkla · ...`) styling.
- Verify: `npm run dev` → focusing a route shows numbered pins connected by a polyline, matching the prototype's map pane.
- Status: [x]

## Task 90: Schedule pane parity
- Files: `panel/src/planner/components/schedule/SchedulePane.tsx`, `VisitBlock.tsx`, `WeekNavigator.tsx`
- Do: match the prototype's `TAKVİM` pane-head bar and per-person day-grid layout (each merchandiser gets their own row of day columns, not one grid per route) if that's how multi-person routes render in the prototype; match visit-block styling (colored left-bar, category dot, minutes badge) and the compact weekday+error/warning-count header (`Pzt 🔴2`).
- Verify: `npm run dev` → schedule pane's block styling and per-person layout matches the prototype.
- Status: [x] (2026-07-17, completed via spec 007) — ported `.pane-head`/`.day-cell`/`.day-total`/
  `.vblock`/`.brk` classes AND (spec 007) the full `.sched-grid` structure: time-axis column with
  hourly labels, `.hline` hour gridlines, and a `.person-cell` row (assignee/route/week-load bar)
  above the calendar. Per-person MULTI-ROUTE swimlanes (prototype stacks several merchandisers'
  rows when multiple routes are visible at once) is confirmed out of scope, not deferred by
  omission — 006/007 only ever focus one route at a time, and a route has at most one active
  assignment in this data model, so a second stacked row has no second person to show without
  first building multi-route-at-once rendering (a bigger, undiscussed feature). Documented in
  docs/DECISIONS.md (2026-07-17, 007 client entry).

## Task 91: Detail panel + health card parity
- Files: `panel/src/planner/components/panel/RouteDetailPanel.tsx`, `HealthCard.tsx`, `StopsList.tsx`
- Do: match the prototype's `Detay` panel (tabs: Bilgi/Görevler/Geçmiş — Bilgi active by default; empty state copy), and the compact health-metric layout (single-line "Ciro: X / Y" + inline bar, "Haftalık dakika" mini-bar row per weekday, "Karışım" donut with legend chips below).
- Verify: `npm run dev` → detail panel tabs + health metrics match the prototype's density and layout.
- Status: [x] (2026-07-17) — ported `.panel-head`/`.panel-body`/`.pill`/`.empty`/`.panel-tabs`/
  `.hist-item` classes, width 250px matching the prototype exactly, single-line Ciro bar layout.
  Added the real Bilgi/Görevler/Geçmiş tab switcher: Bilgi = existing health+stops content;
  Geçmiş = real data from `GET /audit-log?entityType=Route` (spec 003's route-change-log facade),
  filtered client-side by routeId (no server-side entityKey filter exists — fine at demo-data
  volume, flagged in code if the audit log grows); Görevler shows an honest "M2'de gelecek" empty
  state rather than fake content, since the task/rule engine has no backing data yet.

## Task 92: Global palette + typography audit
- Files: `panel/src/theme/tokens.ts` (extend if the prototype's CSS has tokens not yet captured), all `panel/src/planner/**` components
- Do: diff every color/spacing/font-size literal used in planner components against the prototype's actual `:root` CSS vars and computed styles; fix mismatches. Confirm the type scale (9-15px) and spacing scale (2-14px) are used consistently, not ad hoc pixel values.
- Verify: `grep -rnE "font-size:\s*[0-9]" panel/src/planner` shows no raw literals outside `theme/tokens.ts` reads; visual spot-check against prototype for at least the map, schedule, and detail panes.
- Status: [x]

## Task 93: Phase-9 verification pass
- Files: (none)
- Do: `cd panel && npm run lint && npm test && npm run build`.
- Verify: all pass; a full side-by-side comparison against `evo-planner-prototype-v0.5.html` for the Bölünmüş layout shows no unintentional visual differences.
- Status: [x]

<!-- FINAL PHASE — run /end-session instead of a plain checkpoint (CLAUDE.md rule 3d). Summarize the whole
     006 spec (geo API + batch reorder + 8 UI phases + visual-parity pass), show the full green suite + a
     Playwright run, commit `feat(006): visual-parity pass against the prototype`, give the full manual UI
     test script (the core flow + a visual spot-check), update the roadmap, and end the session. -->
