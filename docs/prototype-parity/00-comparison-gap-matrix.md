# Prototype ↔ Design ↔ React — Comparison & Gap Matrix

**Purpose.** Single synthesis of the three reference points, built to drive a future
"make the React panel match the prototype exactly" pass. **This is research only — no code
changes are proposed here as actions; this is the map you plan from.**

**The three reference points** (read the detail files for evidence):
1. `01-prototype-analysis.md` — the v0.5 HTML prototype (canonical **visual + interaction** reference).
2. `03-design-doc-ui-contract.md` — the design doc's **written intent** (§6 UI/UX + §10 decisions).
3. `02-react-implementation.md` — what the React panel (`panel/src`) **actually ships today** (labelled v0.6).

**How to read a disagreement:** design doc = intent, prototype = one concrete implementation of that
intent, React = current reality. When prototype and design agree and React differs → **parity gap**.
When React differs because the feature is on the M4/deferred ledger → **not a bug, leave it**.

---

## 0. The single most important finding

The prototype's **entire interaction model hangs on two things the React panel does not have**:

1. **The toast (`toast(msg, btns[])`, 7-second dark pill) is the primary decision surface** — patch-vs-
   permanent ("Kalıcı yap"), duration scope ladder (this visit / this store / this route / all format),
   patch-window choices, and Undo all live there. **React has NO toast system at all** (mutation success
   and failure are silent). Prototype `01` §3.2; React `02` §2 ("no toast system"), §3 ("No toasts…").
   → Without a toast layer, several "built" flows (drag-patch, resize-scope) are only half the prototype
   experience. **This is the #1 parity prerequisite** — most other interaction parity depends on it.

2. **`renderAll()` re-renders every pane from one shared state on every change.** React models this well
   with the zustand `workspaceStore` (`focusedRouteId` / `selection` / `layout`), but the shared state is
   **thinner** than the prototype's (`filter` / `focus` / `selection` / `changes` / `mode` / `layout`).
   React has no `changes[]` (undo stack), no `mode` (Efektif/Baz), no multi-entity `focus` (only a focused
   route — not store/person/routes/selection/draft), no additive `filter`.

Everything below is detail hanging off those two facts.

---

## 1. Layout & regions — parity matrix

| Region | Prototype (`01`) | Design intent (`03`) | React (`02`) | Verdict |
|---|---|---|---|---|
| Page shell | single-page, `100vh` flex column, never navigates | one page, layout presets not navigation (§6.0) | `.planner-root` 100vh flex column, `/planner` route | ✅ **Match** |
| Top bar | region ▾ · week ‹ › · **4 layout toggles** · **Efektif/Baz** · filter chip · **search** · **Yayınla(n)** · ? · 🔔 · ⚙ | region ▾ · route ▾ · +New · filter row · search | `TopFilterBar`: logo · **province `<select>`** · **route `<select>`** · 4 layout toggles · spacer · inbox btn | ⚠️ **Drift** — see §2 |
| Left rail | **170px**, **Rutlar/Havuz tabs**, expandable routes w/ ordered stores, drag-reorder, +Yeni rut, +Yeni mağaza | rail routes expandable to store lists, click = highlight+detail (§10 L730) | **170px** `RouteRail`, flat route-card list, **no tabs, no pool, no expand, no drag, no add** | ⚠️ **Partial** |
| Map pane | `flex:1`, SVG mock map, marquee always on, pins w/ seq #, route lines, popover | Map pane, pin popover expands to panel (§6.2) | `flex:1` `MapPane`, **MapLibre demo tiles**, circle layer, lasso, seq markers, polyline, popover | ⚠️ **Partial** (real map lib, but demo basemap; see §5) |
| Schedule pane | `flex:1`, **06:00–23:00**, 0.5px/min, CELL_H 510, lunch+2 teas | time-accurate 5-min grid, locked breaks (§6.5) | `flex:1` `SchedulePane`, **09:00–18:00**, **1.2px/min**, 648px, **lunch only** | ⚠️ **Drift** — geometry & hours differ; teas removed on purpose |
| Right panel | **250px**, tabs Bilgi/Görevler/Geçmiş, context-driven by 6 focus types | 250-ish docked, Info/Tasks/History, one reused card (§6.0) | **250px** `RouteDetailPanel`, tabs Bilgi/Görevler/Geçmiş, **route-focus only** | ⚠️ **Partial** — tabs match; only route focus (no store/person/selection/draft context) |
| Table | bottom **drawer** (visit duration edit) **+** full **Tablo** preset (5-tab canvas, CSV) | drawer + full-canvas Table preset (§6.0, §6.6) | **Tablo layout = pool checkbox list only** (`SelectionListPane`); **no drawer, no 6-tab canvas** | ❌ **Missing** (drawer = gap; full table = deferred, §5) |
| Status bar | fairness readout, warn counts→Sorun Merkezi, Undo, Kararlar, Tablo | warnings strip (§6.1) | **none** | ❌ **Missing** (warnings strip is in-scope intent) |
| Slide-in panels | Yönetim / Ayarlar / Gelen kutusu (right-slide `.page`) | admin/settings behind gear (out of flow) | inbox = **centered modal** (`NotesInbox`), no admin/settings | ⚠️ Inbox present as modal not slide-panel; admin/settings deferred (§5) |
| Action bar | floating dark pill anchored bottom-center of **map** | one floating action bar for any selection (§6.0 L450) | `SelectionBar` = **docked full-width** bar (code comment admits substitution) | ⚠️ **Drift** — placement differs; `.actionbar` CSS is dead |

---

## 2. Top bar — control-by-control drift

| Prototype control | React equivalent | Gap |
|---|---|---|
| `Ankara ▾` region button (mock) | Province `<select>` (5 hardcoded) | React is a real select but **hardcoded list, not fetched**; visual form differs (button vs select) |
| Week `‹ Hafta 28 · 6–10 Tem ›` in **topbar** | `WeekNavigator` **inside SchedulePane** | Week nav **moved out of topbar into the schedule pane** — placement drift |
| 4 layout toggles (Harita/Bölünmüş/Takvim/Tablo) | 4 layout toggles, same labels | ✅ Match (but "Tablo" resolves to different content — §1) |
| **Efektif / Baz** mode toggle | — | ❌ **Missing** (deferred, §5) |
| Filter chip w/ ✕ | — | ❌ Missing (no active-filter chip because no additive filter model) |
| **Global search** (`/`, ⌘K, live dropdown, scroll-flash) | — | ❌ Missing (deferred, §5; keyboard hooks designed but unbuilt) |
| **Yayınla (n)** in topbar | **Yayınla** button in **route panel head** | ⚠️ Publish moved from global topbar to per-route panel; no pending-count badge |
| `?` Help modal | — | ❌ Missing (no help modal) |
| `🔔 3` inbox → slide panel | Inbox button → **modal** w/ open-count pill | ⚠️ Present, but modal not slide-panel; only 💬 Saha half (⚠ Sorunlar deferred) |
| `⚙` admin → slide panel | — | ❌ Missing (deferred, §5) |

---

## 3. Modals — inventory diff

Prototype has **~19 imperative `.modal-bg`/`.modal` dialogs**. React has **3 true modals + 2 inline expanders**.

| Prototype modal | React status | Notes |
|---|---|---|
| Yayın özeti (Publish) | ✅ `PublishModal` | Built; override-with-reason implemented. Trigger moved to panel head (§2). |
| Görev düzenle (task edit + scope) | ✅ `TaskScopeModal` | Built; 3-scope (INSTANCE/STORE_RULE/FORMAT_RULE) + impact preview. Prototype also has route scope + validity (kalıcı/bu hafta/bugün) — React scope set is narrower. |
| +Yama (patch) | ⚠️ `PatchForm` (**inline**, not modal) | Built as inline gray box; mandatory expiry enforced. Not a centered overlay. |
| Gelen kutusu / notes | ⚠️ `NotesInbox` (modal) | 💬 Saha half only; ⚠ Sorunlar deferred. Prototype is a slide-panel. |
| Havuzdan mağaza ekle | ❌ | Bulk-add exists via SelectionBar/popover, but no pool-picker modal |
| Yeni rut / Yeni mağaza | ❌ | No create-route / create-store flow in panel |
| Kişi değiştir (reassign + reason) | ❌ | Backend API exists (M1 005); **no panel modal** |
| Rut düzenle / Rut ata | ❌ | No rename/retarget/reassign-store modal |
| 🚗 Yol süresi (travel edit) | ❌ | No travel-time override UI (no OSRM either) |
| 📖 Karar Günlüğü (Decision Journal) | ❌ | Decision journal written on publish, but no viewer modal |
| ✨ Onarım | ❌ | Deferred M4 (§5) |
| 🧩 Modül düzenle / Şablon | ❌ | Deferred (module editor, admin) (§5) |
| Yönetim/Ayarlar onay modals | ❌ | Deferred (admin/settings) (§5) |
| Denetim kaydı (audit) | ❌ | HistoryTab shows route audit; no global audit modal |
| Help | ❌ | Missing |
| StopEditForm | ✅ (React-only inline) | Not in prototype as such; edits stop freq/minutes/seq |

**Modal behavior parity notes** (from `01` §3): prototype modals have **no open/close animation**,
**inconsistent backdrop-click-to-close** (only some wire it), close via `.remove()`. React modals use the
same `.modal-bg`/`.modal` shell — when reproducing, decide one consistent close behavior (prototype is
inconsistent; don't copy the inconsistency).

---

## 4. Interaction-behavior parity (the "what happens if I do this" table)

| Behavior | Prototype | Design intent | React | Verdict |
|---|---|---|---|---|
| Drag block move | patch-by-default + **toast** w/ Kalıcı yap + patch-window + Undo; ghost + dashed drop-indicator w/ live HH:MM label | patch-for-week + make-permanent toast (§2.1) | move → `PatchForm` prefill (TimeShift/MoveVisit), needs expiry; cross-day ghost; **no toast, no Undo** | ⚠️ **Partial** — mechanics there, decision-surface (toast) missing |
| Resize (bottom) | 5-min snap, live reflow, **toast w/ 4-scope ladder** (visit/store/route/format) | rubber-band reflow + apply-to-all scope toast (§2.2–2.3) | resize → **direct permanent `serviceMinutes` update**, live `reflowDay`; **no scope toast** | ⚠️ **Partial** — resize is permanent-only, loses the scope ladder |
| Resize (top) | moves start, end fixed, patch + toast | — | not implemented (only bottom `.rz`) | ❌ Missing |
| Rubber-band downstream ghost-shift | yes, jumping locked breaks | yes (§2.2) | yes (`reflowDay`/`sameDayPreview`, pushes past lunch) | ✅ **Match** |
| Pool → calendar drop | drag pool store onto day cell → assign | — | ❌ (no pool rail, no map→schedule drag) | ❌ Missing |
| Rail store reorder (drag) | yes → resequence | reorder both ways (§2.11) | ❌ in rail; **StopsList in panel** has dnd-kit reorder | ⚠️ Reorder exists but in panel, not rail |
| Map marquee/lasso select | marquee always on, rubber-band rectangle, syncs everywhere | lasso → blocks glow → drawer pre-filtered (§6.0) | `LassoTool` polygon, **pool stores only**, **no visible outline while drawing** | ⚠️ **Partial** — works but no rubber-band feedback, pool-only |
| Cross-pane selection sync | full (map↔grid↔table↔panel↔actionbar) | bidirectional (§1.2) | `selection` Set drives map/SelectionListPane/SelectionBar | ⚠️ **Partial** — synced, but fewer surfaces (no grid glow, no drawer) |
| Additive filter (Shift-click route/person) | yes; filter chip | relative filter = "opening" a route (§1.2) | route **dropdown** picks one; **no shift-add, no person filter, no chip** | ⚠️ **Drift** — filtering model is a dropdown, not click-to-filter |
| Store popover | rich: sparkline, ciro, add-to-route, expand→panel | pin popover expands into panel (§1.3) | `StorePopover`: name/chain/revenue/route + add/move; **no sparkline, no expand-to-panel** | ⚠️ **Partial** |
| Right-click context menu | — | Skip/Change freq/Move/Add note (§2.8) | ❌ | ❌ Missing (design-intended) |
| Keyboard | Esc / ⌘Z / ⌘K / / / Enter / Shift | `/`,`⌘K`,Esc (§2.7) | **Esc only** | ⚠️ **Partial** — only Esc; search shortcuts deferred |
| Undo | `↶ Geri al` + ⌘Z, `changes[]` stack | logged, undoable (§2.11) | ❌ no undo stack | ❌ Missing |
| Publish gate | never-block, reason ≥5 chars gates errors, objective select, per-item Geri al | override-with-reason, two-step (§2.6) | ✅ errors require reason+objective; success shows journal id | ✅ **Match** (minus per-item revert list richness) |
| Read-only past weeks | disabled-not-hidden everywhere, lock banner | disabled not hidden (§2.4) | ✅ past week read-only, head note, blocks non-draggable | ✅ **Match** |
| Impact preview before rule apply | toast "N mağaza · N ziyaret · +Xdk" | ripple preview first (§11.2) | ✅ `TaskScopeModal` impact box (`rules/impact`) | ✅ **Match** |
| Efektif/Baz mode | gates editability + patch/connector rendering | Effective/Base toggle, dashed patches (§2.12) | ❌ always effective | ❌ Missing (deferred, §5) |

---

## 5. Intentionally deferred — DO NOT flag as parity bugs

These are "missing" in React **by decision** (mostly recorded 2026-07-17). Leave them out of any
prototype-parity pass unless the milestone changes. Full ledger + dates in `03` §5.

- **M4 (Analytics & Onarım):** ✨ Onarım workbench · ⚡ Otomatik düzelt · Planning Evidence (Planlama
  Kanıtı) panel + value strip · **live-location map layer / time scrubber** (data pipeline landed M3, viz is M4).
- **Deferred (confirmed, not dropped):** Conflict Center / ⚠ Sorunlar tab · `POST /simulate/route`
  what-if card · **full-canvas 6-tab Table** · **Effective/Base toggle** · **global search** surface ·
  full History visual timeline · **Yönetim admin + Ayarlar settings pages** · module-stack editor ·
  multi-route/multi-person stacked schedule rows.
- **Real-build-only (never prototyped):** constraint solver / Coverage board · publish comms loop
  (delivered/read/ack) · per-user drafts + OCC merge · Setup Mode cold start · policy governance ·
  skills/leave/KPI fields · virtualized scale rendering.
- **Rejected / v2+:** full-day route optimization · AI confidence % (false precision) · hard blocks
  w/o escape · gamified fairness · heatmap dashboards · live collab · offline · NL campaign builder ·
  **RoutePreset (dropped)** · **Campaigns as a concept (folded into TaskTemplate.target + valid_until)**.
- **Mobile agent surface:** entirely simulated — no live field-agent write API, no real FCM/MinIO.

---

## 6. Dead code / DO-NOT-PORT list (from prototype)

When building React parity, do **not** faithfully reproduce these — they are prototype cruft (`01` §9):

- First `renderAdmin` (lines ~3048–3134, presets + inline settings) — **overridden** by the second def.
- `presetsData` — referenced but **never defined** (RoutePreset is dropped anyway).
- `renameRoute` / `setRouteTarget` via native `prompt()` — legacy; the modal is the real path.
- `archiveRoute` alias, several `alert('Prototip: …')` placeholders (photos, simulate person, add note).
- Mock no-op buttons: `Ankara ▾`, `▭ Seç` (lasso is always on), `≡ Katman`, `⚗ Simüle`.
- Inconsistent modal backdrop-click — pick one behavior, don't copy the inconsistency.

---

## 7. Design tokens — prototype vs React

**Good news:** `theme/tokens.ts` was extracted from the prototype `:root` verbatim ("do not invent
values") and matches the prototype palette 1:1 (both files list identical hexes — `01` §7.1, `02` §4).

**The one token risk:** the palette exists in **two places** — `theme/tokens.ts` (JS, for inline styles +
recharts) **and** `planner.css` `--*` custom properties (a separate hardcoded copy). Components mix both
(`var(--blue-d)` vs `colors.blue`). This is the classic drift seam. For a parity pass, decide one source
of truth (CSS vars driven from tokens, or tokens only) before adding UI.

**Geometry constants that differ (real visual gap):**

| Constant | Prototype | React |
|---|---|---|
| Day window | 06:00–23:00 (`DAY_START 360`, `DAY_END 1380`) | 09:00–18:00 |
| Pixels/minute | ~0.5 (`CELL_H 510` / 1020 min) | **1.2** (`PX_PER_MINUTE`, `GRID_HEIGHT 648`) |
| Grid columns | `110px 36px repeat(5, minmax(120px,1fr))` | **same** `110px 36px repeat(5, minmax(120px,1fr))` ✅ |
| Snap | 5 min | 5 min ✅ |
| Quota | 450 | 450 ✅ |
| Breaks | lunch + 2 teas | lunch only (teas removed 2026-07-17, intentional) |

→ The **schedule vertical scale and visible hours differ** — a block of the same duration is ~2.4× taller
in React and the day starts 3h later. This is a concrete visual-parity decision to make deliberately
(the prototype's 06:00–23:00 is generous; React's 09:00–18:00 is tighter). Not obviously a bug — but it
means schedules will never look pixel-identical until reconciled.

---

## 8. Suggested parity work-order (for the FUTURE change pass — not now)

Ranked by leverage (each assumes the prior; all are **future** work, nothing here is an action yet):

1. **Toast system** — the prototype's decision surface; unblocks true drag-patch/resize-scope parity. (§0)
2. **Reconcile token source of truth** (one palette) + **schedule geometry** decision (hours/px-per-min). (§7)
3. **Resize scope ladder + patch-vs-permanent via toast** (currently resize=permanent-only, move=silent patch). (§4)
4. **Left rail parity**: Rutlar/Havuz tabs, pool list, expand-to-ordered-stores, drag-reorder, +Yeni rut/mağaza. (§1)
5. **Filtering model**: click-to-filter (rail/map/name) + Shift-additive + filter chip, replacing the dropdown. (§4)
6. **Panel context types**: store / person / selection / draft focus (not route-only). (§1)
7. **Bottom table drawer** (visit-level duration edit) — distinct from deferred full-canvas table. (§1)
8. **Status/warnings strip** + inline conflict chips + resolve popover. (§1, design §2.10)
9. **Missing modals in-scope**: Kişi değiştir (reassign+reason), Rut düzenle/ata, Decision Journal viewer,
   Yol süresi, pool-picker, Help. (§3)
10. **Map polish**: real basemap, lasso rubber-band outline, popover sparkline + expand-to-panel. (§1, §4)
11. **Floating action bar** anchored to map (replace docked SelectionBar; `.actionbar` CSS already exists). (§1)
12. **Keyboard**: `/`, ⌘K, Undo (⌘Z) once search + undo stack exist. (§4)

**Everything in §5 stays deferred** and is out of any near-term parity pass.

---

## Appendix — verdict legend
✅ Match · ⚠️ Partial/Drift (built but diverges) · ❌ Missing. "Missing" splits into **in-scope gap**
(fix in a parity pass) vs **deferred** (§5, leave alone) — the row text says which.
