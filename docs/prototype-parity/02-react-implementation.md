# EVO React Panel — Implementation Inventory (as-built)

**Scope:** Exhaustive inventory of what `panel/src/` actually implements today, for
comparison against `evo-planner-prototype-v0.5.html`. Source read in full for every
component under `planner/**`, `pages/**`, `App.tsx`, all CSS, and `theme/tokens.ts`.
All paths below are relative to `/Users/amiralba/Documents/projects/EVO/panel/src/`.

Version label shown in the UI: **v0.6** (`TopFilterBar.tsx:31`, hardcoded).

---

## 1. Overall layout & routing

### Routes (`App.tsx`)
`BrowserRouter` → `AuthProvider` → `Routes`. Three routes only:

| Path | Element | Guard | File |
|------|---------|-------|------|
| `/login` | `Login` | none | `pages/Login.tsx` |
| `/` | `Dashboard` | `ProtectedRoute` | `pages/Dashboard.tsx` |
| `/planner` | `PlannerPage` | `ProtectedRoute` | `planner/PlannerPage.tsx` |

No 404/catch-all route. No nested routes. `ProtectedRoute` (`auth/ProtectedRoute.tsx`)
gates the two authed pages.

- **`Login`** (`pages/Login.tsx`) — bare `<form>` inside `<section id="login">`: email + password
  inputs, submit button, inline `role="alert"` error. On success `navigate('/')`. No styling beyond
  `index.css` base. Comment notes app-wide error/toast pattern is a *deferred decision*
  (specs/003 non-goals).
- **`Dashboard`** (`pages/Dashboard.tsx`) — minimal placeholder: `<h1>EVO</h1>`, greeting
  (`Merhaba, {displayName}`), a backend-health status badge (`getHealth()` → loading/ok/error),
  a `<Link to="/planner">Planlama</Link>`, and a `Çıkış` (logout) button. This is a stub landing
  page, **not** a real dashboard/home.
- **`PlannerPage`** — the actual workspace (see below).

### Planner workspace layout (`PlannerPage.tsx` + `planner.css`)

Vertical flex column `.planner-root` (100vh, `overflow:hidden`), composed as:

```
.planner-root  (column, defines all --* CSS vars, bg #fafaf7)
├── <TopFilterBar/>        → .topbar          (fixed, flex-shrink:0)
├── .main  (flex row, flex:1, overflow:hidden)
│   ├── <RouteRail/>       → .rail            (width 170px, fixed, scroll-y)
│   ├── <WorkspaceLayout/> (flex:1 column)    ← map | schedule | table
│   │     map={<MapPane/>}
│   │     schedule={ focusedRouteId ? <SchedulePane/> : .empty }
│   │     bottom={<SelectionListPane/>}
│   └── .panel  (width 250px, fixed, scroll-y) → <RouteDetailPanel/>
└── <SelectionBar/>        → docked full-width dark bar (only when selection > 0)
```

**Region sizing (from `planner.css`):**
- `.rail` — **170px** fixed left column, `overflow-y:auto`. Route list.
- Center = `WorkspaceLayout`, `flex:1`.
- `.panel` — **250px** fixed right column, `overflow-y:auto`. Route detail.
- `.topbar` — 8px/14px padding, fixed height, `flex-shrink:0`.

**`WorkspaceLayout` (`components/WorkspaceLayout.tsx`) — the map/schedule split:**
- Driven by `workspaceStore.layout` (`'split' | 'map' | 'schedule' | 'table'`).
- `showMap = layout==='map' || 'split'`; `showSchedule = layout==='schedule' || 'split'`;
  `showBottom = layout==='table'`.
- In **split** mode: map pane `flexBasis: {splitPct}%`, schedule pane `flexBasis: {100-splitPct}%`,
  separated by a 6px `col-resize` handle (`background: colors.border`). `splitPct` local state,
  default **50**, clamped to **[20, 80]** via pointer-drag on the handle. This resizer is **inline
  styles only** — not from the prototype CSS.
- In **table** mode: map+schedule region hidden, `bottom` (`SelectionListPane`) rendered under a
  `border-top`. Note: in table mode **neither map nor schedule shows** — only the pool checkbox list.
- Layout state is transient in-memory (zustand), not persisted.

**Key nuance:** `SelectionListPane` (the pool store list) is only visible in `layout==='table'`.
The schedule only renders when a route is focused; otherwise an `.empty` placeholder
("Haritadan veya listeden bir rota seçin.").

---

## 2. Every component & what it renders

### Top-level planner chrome

#### `TopFilterBar` (`components/TopFilterBar.tsx`)
Renders `.topbar`. Contents left→right:

| Control | Renders | Behavior |
|---------|---------|----------|
| Logo | `EVO · {title}` + `.pill` v0.6 | static |
| Province `<select>` | 5 hardcoded provinces: Adana, Ankara, İstanbul, İzmir, Bursa | `setProvince()` (store) |
| Route `<select>` | `{routeCode} — {name}` from `useRoutes(province)` | `focusRoute(id)` on change |
| `.seg #layoutSeg` | 4 buttons: Harita / Bölünmüş / Takvim / Tablo | `setLayout(key)`; active = `.on` |
| `.spacer` | — | pushes inbox right |
| Inbox button (`data-testid="inbox-trigger"`) | "Gelen Kutusu" + open-count `.pill` | opens `NotesInbox` modal; count from `useNotes({status:1})` |

Province list is **hardcoded**, not fetched. Layout segmented control mirrors prototype's
`#layoutSeg`.

#### `RouteRail` (`components/RouteRail.tsx`)
Renders `.rail > .list` of `.route-item` cards from `useRoutes(province)`. Each card:
`.code` (status dot + `routeCode`), `.sub` (name), `.sub` (status label + `{stopCount} durak`).
- Status dot color: `STATUS_DOT` map {1:tx3, 2:teal-d, 3:gray-m}. Status label:
  {1:Taslak, 2:Aktif, 3:Pasif}.
- Click toggles focus: `focused ? clearFocus() : focusRoute(routeId)`. Focused card gets `.on`.
- No search/filter box inside the rail. No grouping. No person/merchandiser rail.

### Schedule pane

#### `SchedulePane` (`components/schedule/SchedulePane.tsx`) — the heart
Renders `.pane #schedPane`. Only mounts when a route is focused.

- **`.pane-head`**: "TAKVİM — blok: sürükle / alt kenar: süre uzat" + (past-week) read-only note.
- **`WeekNavigator`** (see below).
- **Grid** `.sched-grid` = CSS grid `110px 36px repeat(5, minmax(120px,1fr))`:
  - Row 1: two spacers + 5 `.day-head` (weekday label `['Pzt','Sal','Çar','Per','Cum']` + ISO date).
  - Row 2: `.person-cell` (merchandiser name, routeCode, week-load `.loadbar`, `%{weekLoadPct} yük`),
    `.time-axis` (hour labels 09:00–18:00), then 5 `.day-cell` columns.
- **Day column** = `.day-cell` height `GRID_HEIGHT = (18*60 - 9*60)*1.2 = 648px`:
  - Hour gridlines `.hline`.
  - `.day-total {ok|over|under}` badge: `{minutes} dk / 450`. Class: over if >450, under if <400.
  - Break blocks `.brk` from `BREAK_BLOCKS` (single "Öğle" 12:30–13:15; tea breaks removed 2026-07-17).
  - `VisitBlock` per visit.
  - Per-day validation findings as `.badge` chips below the cell (severity err/warn colored).
- **Always renders 5 weekday columns** even when `/plan` returns fewer days (empty days synthesized
  via `weekdayDates` — `SchedulePane.tsx:100-115`).
- **Week load**: `weekLoadPct = total plannedMinutes / (450*5)`; loadbar color red>100 / amber<80 / green.
- Loading/error/empty states via `.empty`.

**Data:** `usePlan(routeId, week.from, week.to)`. `parseDay()` maps `PlanDayDto.visits` →
`ParsedVisit` (startMin from `minutesOfDay`, durationMin from end−start, `isPatch = source===2`,
plus `status/checkInAt/actualMinutes`).

#### `VisitBlock` (`components/schedule/VisitBlock.tsx`)
A positioned `.vblock`. Top = `(startMin−dayStart)*1.2`, height = `max(4, dur*1.2)`.
- Class composition: `vblock` + outcome class OR `catS` + (`patched` if isPatch).
  - `OUTCOME_CLASS`: {2:`outcome-done`, 3:`outcome-missed`, 4:`outcome-skipped`}. If `status`
    undefined → default `catS` (gray). **Note:** planned-but-no-outcome blocks always render gray
    `catS`, NOT the prototype's category coloring (catP/catV are defined in CSS but never applied by
    the component).
- Shows `.t` (storeName), `.s` (`{dur} dk`). `title` tooltip = check-in time + "gerçekleşen X /
  planlanan Y" when `checkInAt` present, else "store — dur".
- `.rz` resize handle (bottom 7px, `ns-resize`) rendered only when `!readOnly && !ghost`.
- `onPointerDown` on body → `onMoveStart`; on `.rz` → `onResizeStart` (stopPropagation).
- Ghost mode: opacity 0.5, `pointerEvents:none`.

#### `WeekNavigator` (`components/schedule/WeekNavigator.tsx`)
Inline-styled flex bar: `‹ Önceki`, formatted range (`tr-TR` day+month), `Sonraki ›`,
and a right-aligned `Bu hafta` reset pill. Handlers `prevWeek/nextWeek/currentWeek` from `schedule/week.ts`.

### Right detail panel

#### `RouteDetailPanel` (`components/panel/RouteDetailPanel.tsx`)
Renders inside `.panel`. Empty state when no route focused. Otherwise:
- **`.panel-head`**: routeCode + status `.pill` + **`Yayınla` primary button**
  (`data-testid="publish-trigger"` → opens `PublishModal`). Sub-lines: name, merchandiser name.
- **`.panel-tabs`** — 3 tabs (`PanelTab = 'info' | 'tasks' | 'history'`):

| Tab | Label | Renders |
|-----|-------|---------|
| `info` | Bilgi | `HealthCard` + `StopsList` + `+ Yama ekle` toggle (inline `PatchForm`) |
| `tasks` | Görevler | store `<select>` + `TasksTab` (for selected stop, date=today) |
| `history` | Geçmiş | `HistoryTab` |

There is **no HealthCard as its own tab** — it lives at the top of the Bilgi tab.

#### `StopsList` (`components/panel/StopsList.tsx`)
`@dnd-kit` sortable list. Each `StopRow`: drag handle `⠿`, sequence #, storeName, serviceMinutes
(or "varsayılan"), frequency badge ({1:Günlük, 2:Haftalık, 3:İki Haftalık}). Row click →
toggles `StopEditForm` inline. `onDragEnd` → `arrayMove` → `useReorderStops.mutate(ids)`.
Empty state "Bu rotada durak yok.". Fully inline-styled (not prototype classes).

#### `HealthCard` (`components/panel/HealthCard.tsx`)
Uses **recharts**. Data from `useHealth(routeId)`. Renders:
- Revenue bar (`sixMonthRevenue / revenueTarget`, green if met else red).
- Weekday minutes bar chart (Pzt–Cum) with a 450-min `ReferenceLine`; per-bar color over/under/ok.
- Category mix donut (`PieChart`, colors teal/amber/gray/blue) when data present.
- Error/warning count pills (🔴/🟡) from `errorCount`/`warningCount`.
Empty state "Bu rota için henüz sağlık verisi yok.".

#### `HistoryTab` (`components/panel/HistoryTab.tsx`)
`useRouteAuditLog(true)` (fetches one page of Route audit entries, filters client-side by
`entityKey === routeId`). Renders `.hist-item` timeline (localized timestamp + `EVENT_LABEL`
Turkish map for StopAdded/Removed/Moved/Reordered/FreqChanged/Assigned/Unassigned/Patched/Published).
Empty state "Bu rota için henüz geçmiş kaydı yok.". **Read-only** — no filtering/paging UI.

#### `TasksTab` (`components/panel/TasksTab.tsx`)
`useStoreTaskPlan(storeId, date)`. Renders one `.kv` row per resolved task: name +
minutes + a source `.pill` (template/format/chain/route/store/manual, derived from last trace
layer). Clicking pill → toggles inline `.popover` showing the rule-resolution trace
(`layer: before → after (op)`). Clicking the row → opens `TaskScopeModal`. Completed tasks
(`status===3`) show a `✓ {resultSummary}` sub-line (photo count / form-answer count / note).
Footer `.kv` "Ziyaret toplamı" total. Empty state "Bu ziyaret için görev bulunamadı.".

### Editing components (`components/editing/`)

- **`StopEditForm`** — inline panel (gray box) under a stop row. Fields: frequency `<select>`,
  serviceMinutes number, sequence number. Save → `useUpdateStop`. Cancel closes.
- **`PatchForm`** — inline gray box (in Bilgi tab and as SchedulePane's drag-created patch editor).
  Patch-type `<select>` (SkipStore=1, AddStore=3, TimeShift=5, MoveVisit=6). Store `<select>` (for
  1/3), start/end date inputs, reason text. **Mandatory expiry**: `endsOn` required and ≥ startsOn,
  else `expiryInvalid` blocks save with red hint. When opened from a drag (`prefill`), type select is
  disabled and it shows the new time / from→to summary. Save → `useCreatePatch`.
- **`SelectionBar`** — docked full-width dark bar (`background: var(--tx)`), visible only when
  `selection.size > 0`. Shows "{n} seçili", "Rotaya ekle ({n})" (disabled if no focused route),
  "Temizle". Add → `useBulkAddStops` with `{frequency:2, weekdayMask:0, serviceMinutes:null}` →
  shows `BulkAddResult`. Comment (`SelectionBar.tsx:37`) explicitly notes it does NOT reproduce the
  prototype's floating `.actionbar` pill anchored to the map — it's a docked substitute.
- **`SelectionListPane`** — the "Tablo" bottom pane. Pool-store checkbox list (`useStoresGeo(province,
  false)` → only pool stores). Select-all header + per-store `<label>` checkbox (name, chainName,
  formatTRY revenue). Max-height 220px scroll. This is the only "table" view — **not** the prototype's
  6-tab full-canvas data table.
- **`BulkAddResult`** — shows added count + rejected list with reason badges
  (store_not_found / out_of_geo_scope / on_another_route). For `on_another_route` rejections, a
  "Buraya taşı" button → `onMoveHere` (→ `useMoveStoreToRoute`).

### Map components (`components/map/`)

- **`MapPane`** — `.pane #mapPane`. MapLibre GL map (`useMapLibre`). Renders store circle layer,
  focus paint (dim non-focused-route stores), numbered sequence markers + dashed route polyline for
  focused route, click→`StorePopover`. Head text "HARİTA — pin: tıkla · kement: seç". Contains
  `LassoTool`. `fitBounds` to province stores on load/province change.
- **`useMapLibre`** — creates the map with **demo tiles**
  (`https://demotiles.maplibre.org/style.json`) centered on Turkey [35,39] zoom 5. **No OSM/real
  basemap; no OSRM.**
- **`storeLayer.ts`** — GeoJSON source + circle layer; `applyFocusPaint` (category stroke colors,
  radius/opacity emphasis for focused route); `upsertRouteLine` (dashed blue sequence polyline).
- **`LassoTool`** — top-left toggle button "Kement". When active: click adds polygon vertices,
  double-click closes polygon → `storesInPolygon` (turf point-in-polygon, **pool stores only**) →
  `setSelection`. Shows "{n} seçili" chip. **No visible polygon drawn while lassoing** (only cursor
  changes to crosshair) — no rubber-band outline is rendered.
- **`StorePopover`** — `.popover` at click point. Name, chainName, revenue, activeRouteCode/"Havuz".
  Actions: "Rotaya ekle" (pool store + focused route → `bulkAdd`), "Buraya taşı" (store on another
  route → `moveHere`). Buttons disabled when `!canAct` or handler absent. × close.

### Modals

Five overlay components use the `.modal-bg`/`.modal` shell:

| Modal | Trigger | Content | Buttons | Close |
|-------|---------|---------|---------|-------|
| `PublishModal` | Yayınla btn in panel head | validate findings (🔴 errors / 🟡 warnings), override reason+objective textareas (required only if errors), success view (visitsMaterialized, decisionJournalId) | Vazgeç / **Yayınla** (disabled until override ready) → after success: Kapat | onClose |
| `TaskScopeModal` | click a task row in TasksTab | minutes input, 3 scope radios (INSTANCE / STORE_RULE / FORMAT_RULE), rule-impact preview box | Vazgeç / **Kaydet** | auto-close on mutate success |
| `NotesInbox` | inbox btn in TopFilterBar | open notes list (`useNotes({status:1})`), each with anchor+kind labels, body | per-note **Onayla**(→2) / **Çözüldü**(→3); footer Kapat | Kapat |
| *(inline, not `.modal`)* `PatchForm` | +Yama ekle / schedule drag | gray inline box (§editing) | Kaydet / Vazgeç | onClose |
| *(inline, not `.modal`)* `StopEditForm` | click stop row | gray inline box | Kaydet / Vazgeç | onClose |

Only `PublishModal`, `TaskScopeModal`, `NotesInbox` are true centered overlay modals. `PatchForm`
and `StopEditForm` are inline expanders, not overlays. No confirm/discard dialogs, no toast system.

---

## 3. Interaction behaviors actually implemented

### Schedule drag & drop (`schedule/*.ts` + `SchedulePane.tsx`)
- **Pointer-driven** (custom, not a DnD lib). `startDrag('move'|'resize', dayIndex, visitIndex)`;
  global `pointermove`/`pointerup` listeners; `hitTestDay` finds the target column by clientX for
  cross-day moves.
- **Constants:** `PX_PER_MINUTE=1.2`, day 09:00–18:00, snap 5 min (`snapMinutes`), duration clamped
  **[10,240]**, start clamped within day.
- **Live preview:**
  - Same-day move/resize → `reflowDay` rubber-band: repositions the changed visit and sequentially
    repacks later visits, pushing each past the lunch break (`sameDayPreview`). Day-total updates live.
  - Cross-day move → a floating **ghost** `VisitBlock` (readOnly, opacity via ghost) rendered in the
    target column (`crossDayGhost`); source column outlined `2px solid var(--blue-d)`.
- **Drop decision** (`dropDecision.ts` — pure, unit-tested):
  - resize → direct `UpdateStopRequest {serviceMinutes}` via `useUpdateStop` (**permanent baseline
    edit**, no patch).
  - same-day move → `PatchForm` prefill type **5 TimeShift** (patch, needs expiry).
  - cross-day move → `PatchForm` prefill type **6 MoveVisit** (patch, needs expiry).
  - no-op if unchanged.
- So: **resize = permanent, move = patch.** This is the core "baseline vs patch" distinction in the UI.
- `patchPayload.ts` builds `CreatePatchRequest` (paramsJson-encoded startMinutes / from-to dates).
- **Read-only when `isPastWeek`** (`week.from < currentWeek().from`): `startDrag` early-returns,
  blocks pass `readOnly` to `VisitBlock`, head shows "(geçmiş hafta — salt okunur)".
- **No toasts/notifications** on success or failure — mutation errors surface nowhere in the UI
  (only react-query state; no error boundary/toast).

### Map interactions
- Click store pin → popover. Click empty → dismiss.
- Lasso select (pool stores only, polygon, no visible outline).
- Add-to-route / move-to-route from popover and from bulk selection.
- Focus emphasis paint + sequence polyline + numbered markers.
- **Not implemented:** heatmaps, clustering, drawing/editing on map, live-location ping
  visualization (M3 pipeline landed backend-side but panel map does not render pings).

### Selection state & cross-pane sync (`state/workspaceStore.ts`)
Zustand store, single source of truth:
- `province` (default 'Ankara'), `focusedRouteId`, `selection: Set<string>`, `layout` (default 'split').
- Actions: `setProvince, focusRoute, clearFocus, toggleSelect, setSelection, clearSelection, setLayout`.
- **Cross-pane sync:** `focusedRouteId` drives RouteRail highlight, map focus paint + polyline,
  SchedulePane mount, RouteDetailPanel. `selection` drives map lasso count, SelectionListPane
  checkboxes, and SelectionBar. All panes read the same store — genuinely synced.
- Store is **not persisted** and holds no undo/history.

### Filtering / search
- Only **province filter** (dropdown) and **route picker** (dropdown). No text search, no store
  search, no global search, no task/status filters, no date filter besides week nav.

### Keyboard shortcuts
- **Only `Escape`** (`PlannerPage.tsx:22-31`) → `clearFocus()` + `clearSelection()`. No other
  shortcuts (no arrow-key nav, no undo, no delete).

### Publish flow (`PublishModal.tsx`)
1. On open, `POST /validate` → findings.
2. Splits into errors (sev 1) / warnings (sev 2). `needsOverride = errors > 0`.
3. If override needed, requires **both** reason and objective (non-empty) to enable Yayınla.
4. Publish → `usePublish` → success view shows `visitsMaterialized` and (if `overrodeErrors`)
   `decisionJournalId` ("Karar kaydedildi"). Implements the "never block, always justify" rule.

### Read-only / disabled states
- Past-week schedule (fully read-only).
- Buttons disabled during pending mutations (`isPending`), on invalid patch expiry, on
  missing override fields, on missing focused route (bulk add / popover actions).
- No global role-based read-only (Supervisor vs Field agent) is implemented in the panel UI.

### Duration / resize editing
- Schedule resize handle → `serviceMinutes` update (permanent).
- `StopEditForm` serviceMinutes number field (permanent).
- `TaskScopeModal` minutes → task-instance/rule scope (permanent, with impact preview).
- Note: visit duration is edited directly as `serviceMinutes` here; the design's "duration = sum of
  task durations resolved by rules" is only reflected in TasksTab's read-only total, not enforced in
  the resize path.

---

## 4. Design tokens & styling

### `theme/tokens.ts` (used for inline styles + recharts)
Explicitly "extracted from the prototype `:root`; do not invent values."

**colors** (`colors`):
```
bg #FAFAF7  card #FFFFFF  border #E3E1D9  border2 #CBC9BF
text #2C2C2A  text2 #6B6A64  text3 #98968D
blue #378ADD / blueDark #185FA5 / blueLight #E6F1FB
teal #1D9E75 / tealDark #0F6E56 / tealLight #E1F5EE
amber #EF9F27 / amberDark #854F0B / amberLight #FAEEDA
red #E24B4A / redDark #A32D2D / redLight #FCEBEB
green #639922 / greenLight #EAF3DE
grayLight #F1EFE8  grayMid #B4B2A9
```
**severityColors**: err {redDark/redLight}, warn {amberDark/amberLight}, info {blueDark/blueLight}.
**categoryColors**: P {tealDark/tealLight}, V {amberDark/amberLight}, S {text2/grayLight}. *(defined
but note: VisitBlock only uses catS + outcome classes, never catP/catV.)*
**loadStatusColors**: ok green / over red / under amberDark.
**spacing** (xxs 2 → xxxl 14px, 9 steps). **radius** (sm 4 / md 5 / lg 6 / xl 8 / pill 12 / card 10).
**fontSize** (xs 9 → xxl 15px, base 13). **fontFamily** = `-apple-system,'Segoe UI',Roboto,sans-serif`.
Also a combined `tokens` export.

### `planner.css` (the ported prototype stylesheet)
Header comment: "Ported directly from evo-planner-prototype-v0.5.html's `<style>` block
(line ~68-320). Class names and values kept 1:1."

- **Colors are duplicated** as CSS custom properties on `.planner-root` (`--bg, --card, --border,
  --border2, --tx, --tx2, --tx3, --blue/-d/-l, --teal…, --amber…, --red…, --green/-l, --gray-l,
  --gray-m`). These mirror `tokens.ts` but are a **separate hardcoded copy** (two sources of truth
  for the same palette). Components mix both: some use `var(--blue-d)` (CSS), others `colors.blue`
  (JS).
- Key classes present and matching the prototype:
  `.topbar, .logo, .seg(.on), .spacer, .main, .rail, .route-item(.on), .dot, .pane, .pane-head,
  .panel, .panel-head, .panel-tabs(.on), .hist-item, .panel-body, .kv, .badge, .chip, .pill,
  .sched-grid, .person-cell(.loadbar), .time-axis, .hline, .day-head, .day-cell, .day-total(.ok/
  .over/.under), .vblock(.catP/.catV/.catS/.patched/.outcome-done/.outcome-missed/.outcome-skipped),
  .brk, .empty, .popover, .modal-bg/.modal/.modal-head/.modal-body/.modal-foot, .pub-errbox,
  .pub-textarea, .actionbar`.
- `.sched-grid` grid template: `110px 36px repeat(5, minmax(120px,1fr))`, `column-gap:4px`,
  `row-gap:8px`.
- **`.actionbar` is defined in CSS but never used** (SelectionBar renders its own docked bar with
  inline styles instead — see §2). Dead CSS kept for reference.
- `.chip` class defined but not used by any component read.
- **Styling split:** layout chrome (rail/panel/topbar/schedule grid/modals) uses `planner.css`
  classes; forms (PatchForm, StopEditForm, SelectionBar, SelectionListPane, WeekNavigator, HealthCard,
  BulkAddResult, StorePopover partly) use **inline styles from `tokens.ts`**. So the codebase is a
  hybrid: half tokenized-CSS-var, half inline-JS-token.
- `App.css` is **empty** (comment only). `index.css` is a light-only reset (palette hardcoded again:
  `#fafaf7`/`#2c2c2a`), `color-scheme: light`. No dark mode anywhere.

---

## 5. What is clearly MISSING or STUBBED vs a full planner

**Missing pages / navigation:**
- `Dashboard` is a health-check stub, not a real home/overview.
- No admin/Yönetim pages, no inbox page (only the modal), no global search, no settings.

**Prototype features referenced but not built (confirmed by code + CLAUDE.md deferrals):**
- **Full-canvas 6-tab data table** — only a pool checkbox list (`SelectionListPane`) exists for the
  "Tablo" layout.
- **Floating `.actionbar` pill** on the map — replaced by a docked `SelectionBar` (CSS `.actionbar`
  is dead code; comment at `SelectionBar.tsx:37` acknowledges the substitution).
- **Effective/Base schedule toggle** — not present; schedule always shows effective plan.
- **Live-location map visualization** — backend ping pipeline exists (M3) but no map layer renders it.
- **Category coloring of planned visits** — `catP`/`catV` CSS exist; `VisitBlock` never applies them
  (planned-no-outcome always gray `catS`). Only realized-outcome coloring is wired.
- **Onarım / repair workbench, Conflict Center (Sorun Merkezi), history timeline (full),
  planned-vs-realized analytics / Planning-Evidence panel** — all M4, not built.
- **Multi-route / multi-person stacked schedule rows** — schedule shows a single route/person only.
- **Module-stack editor (SET_FREQUENCY/SET_MODULES/PATCH_MODULE)** and standalone task-template/rule
  CRUD (Yönetim) — deferred.

**Stubbed / mocked pieces:**
- **Map basemap = MapLibre demo tiles**, not OSM Turkey; no OSRM travel-time integration.
- **No toast/notification system** — mutation errors and successes are silent (login page has its own
  inline error only; comment notes app-wide error UI is a deferred decision).
- **Province list hardcoded** (5 provinces) rather than fetched.
- **Audit log** fetched as one 200-row page and filtered client-side (`planner.ts:131` comment flags
  it needs a real `entityKey` filter if it grows).
- **Break blocks** are a client constant (`breaks.ts`), not fetched from the settings API.
- `getNotifications` API function exists (`planner.ts:211`) but **no component consumes it** — the
  merchandiser-notifications endpoint is wired in the client layer but unused in UI.

**Behavioral gaps:**
- No undo/redo, no keyboard nav beyond Escape, no drag of stores from map→schedule, no lasso outline
  rendering, no role-based UI gating (Supervisor vs Field agent), no persistence of layout/selection.
- No confirm dialogs for destructive-ish actions (add/move happen immediately).

**Overall assessment:** The React panel is a faithful but partial port. The map + single-route
schedule (drag/resize/patch), route detail (health/stops/tasks/history), patch/publish flows, task
rule-scope resolution, and notes inbox are real and functional. The larger "workspace" surfaces of
the prototype — full data table, multi-row schedules, effective/base toggle, Onarım, analytics,
live-location, category coloring — are absent or stubbed, consistent with the M0–M3 scope and M4
deferrals in CLAUDE.md.
