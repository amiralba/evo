# Plan: Planner UI (006-planner-ui)

<!-- Owned by: architect/planner. Design decisions for THIS feature only. Renders over spec 005's API. -->

## Approach
A single `/planner` page composed of thin pane renderers over one shared client-side state, plus one small
backend geo endpoint to feed the map. Build order mirrors the design's rule (§6.0) — **shared state layer
first, panes as thin renderers over it**:

1. **Backend** — two additions (clarifications #13, #14): (a) `GET /api/v1/stores/geo` + `StoreGeoDto`
   (lat/lng, chain/category, active-route flag, 6-month revenue; `[Authorize]`, any authenticated user);
   (b) a batch `POST /api/v1/routes/{id}/stops:reorder` + `ReorderStopsRequest` (ordered `stopIds`, one
   transaction, one audit log, returns `RouteDetailDto`) so the dnd-kit reorder persists in a single call.
   Regenerate `contracts/openapi.json` (`dotnet build`) and the TS client (`npm run generate-api-client`).
   These are the only backend changes.
2. **Panel foundations** — add libraries (MapLibre, TanStack Query, Zustand, dnd-kit, react-i18next,
   Recharts, turf), bootstrap i18n (`tr.json`) + `QueryClientProvider`, and a typed `api/planner.ts` layer
   that wraps the existing `authorizedFetch` pattern and returns generated `schema.ts` types.
3. **Shared state + shell** — a Zustand `workspaceStore` (province, focusedRouteId, selection set, layout)
   and the `PlannerPage` shell (filter bar, route rail, Map|Schedule split with draggable divider, docked
   right panel). TanStack Query hooks with mutation→invalidation wiring (the "live health card" mechanism).
4. **Panes** — MapPane (MapLibre GeoJSON store layer, color coding, popover, lasso), RouteDetailPanel +
   HealthCard (Recharts), SchedulePane (time-accurate grid, breaks, findings).
5. **Editing** — selection floating bar → bulk-add; stop edit form; dnd-kit sortable stops → batch
   `stops:reorder` persist (one call on drop); move-store; add-patch (mandatory expiry).
6. **Publish** — review modal with the override-with-reason gate → decision journal → invalidate & refresh.
7. **Tests + docs** — Vitest units, Playwright core flow vs live seeded backend, doc updates.

Components live under `panel/src/planner/` (feature root): `state/`, `api/` (query hooks), `components/`
(`TopFilterBar`, `RouteRail`, `WorkspaceLayout`, `map/`, `schedule/`, `panel/`, `editing/`, `publish/`).
i18n under `panel/src/i18n/`. Reuse `theme/tokens.ts` for all colors (severity/category/load), the existing
`authorizedFetch`/session, and the generated `schema.ts` types (never hand-write API shapes).

## Contracts touched
- **New:** `GET /api/v1/stores/geo` → `StoreGeoDto[]` (docs/API.md). Backend files:
  `backend/src/Evo.Api/Stores/Dtos/StoreDtos.cs` (+`StoreGeoDto`), `backend/src/Evo.Api/Controllers/
  StoresController.cs` (+`Geo` action), `backend/tests/Evo.Api.Tests/Stores/StoresGeoEndpointTests.cs`.
- **New:** `POST /api/v1/routes/{id}/stops:reorder` → `RouteDetailDto` with `ReorderStopsRequest`
  (`stopIds` ordered list) (clarification #14, docs/API.md). Backend files:
  `backend/src/Evo.Api/Routes/Dtos/*` (+`ReorderStopsRequest`), `backend/src/Evo.Api/Controllers/
  RoutesController.cs` (+`ReorderStops` action, one transaction + one `RouteChangeLog`),
  `backend/tests/Evo.Api.Tests/Routes/RouteStopsReorderTests.cs`.
- **Regenerated:** `contracts/openapi.json`, `panel/src/api/generated/schema.ts`.
- **Consumed unchanged (spec 005):** `GET/POST /routes`, `GET/PATCH /routes/{id}`, `/routes/{id}/stops:bulk`,
  `/routes/{id}/stops/{stopId}` (PATCH), `/routes/{id}/stops/{stopId}:move`, `/routes/{id}/patches`,
  `/routes/{id}/plan`, `/routes/{id}/health`, `/routes/{id}/validate`, `/routes/{id}/publish`,
  `GET /merchandisers/{id}/day`, `GET /stores`.

## Risks
- **Map coordinates depend on seeded `Store.Location`.** The geo endpoint omits null-location stores; the
  seeder (004) must produce located Turkish stores or the map is empty. Verify with a seeded province in
  Phase 3.
- **MapLibre + React lifecycle leaks.** The map instance must be created once and cleaned on unmount, and
  GeoJSON sources updated (not recreated) on data change — a classic source of leaks/flicker. Encapsulate in
  a `useMapLibre` hook.
- **"Live health" correctness hinges on invalidation, not local mutation.** All edits must invalidate the
  server queries rather than optimistically patching Zustand, or the health card can drift from the backend
  truth. Keep server state exclusively in TanStack Query.
- **Playwright against a live backend is environment-sensitive** (seed state, ports). Pin prereqs in the
  test doc; make the flow tolerant of existing seeded routes (pick the first route, add the first pool
  store) rather than hard-coding IDs.
- **dnd-kit reorder persistence** — resolved (clarification #14): a new batch `POST /routes/{id}/stops:reorder`
  endpoint persists the full order in one transactional call on drop (returns `RouteDetailDto`), instead of N
  per-stop PATCHes. Watch the validation edge: the payload must contain exactly the route's active stop ids
  (400 otherwise) so a stale client can't corrupt sequence.
- **Scope creep toward the full table / simulate / reassign.** These are explicitly deferred; the `table`
  preset is only a selection list in MVP.
