# Design-Doc UI/UX Contract (Reference Point 3)

**Purpose.** Extract the *written* UI/UX intent and product logic from the EVO design doc so it can
serve as the third reference point — alongside the v0.5 HTML prototype and the shipped React panel —
when judging whether the panel "matches intent." Where the doc and prototype disagree, the doc is the
statement of intent; the prototype is one implementation of it.

**Sources.**
- `EVO-Route-Planning-Design.md` — primary. §6 (Planner UI/UX), §7 (workflows), §3.2 (validation),
  §4 (state machines), §10 (decisions log), §11 (v0.5 iteration). Line numbers cited inline as
  `(design §X, Lnnn)`.
- `older ver-ignore/v0.5-change-list.md` — build/defer/reject triage of the prototype brainstorm.
- `docs/ROADMAP.md` — which slices actually shipped (M0–M3) and what is deferred to M4+.

> **Scope caution when comparing.** Much of what §6 describes was *intentionally* deferred past the
> panel's current milestone (M3). Section 5 below is the deferred-vs-built ledger — check it before
> filing any missing pane/modal as a "bug."

---

## 1. Intended planner layout & panes (from §6.0–§6.1)

### 1.1 One workspace, three panes, one state
The planner is **a single page — you never navigate away while designing a route** (design §6.0, L446–447).
Map (*where*), Schedule grid (*when*), and Table (*bulk*) are **panes of one workspace, not separate
views**.

- **Default layout: Map | Schedule split with a draggable divider** (design §6.0, L448). Header buttons
  are **layout presets** (`Map · Split · Schedule · Table`) that *maximize a pane* — "same page, no
  navigation" (L448–449). They are presets, **not** route navigation.
- **The Table has two surfaces** (design §6.0, L449):
  1. a quick-view **bottom drawer** that "slides up over the workspace for a fast selection dump," and
  2. a **full-canvas Table preset** (v0.4) — the 4th header button — giving the complete tabbed table
     workspace (§6.6). Both "close back into the flow without leaving the page."
- Decisions-log restatement: *"Single page: Map | Schedule split + Table drawer; layout presets, never
  page navigation while planning"* (design §10, L719).

### 1.2 Shared filter + selection state drives all panes
- *"A shared filter + selection state drives all panes simultaneously: lasso on the map → blocks glow in
  the schedule → table drawer opens pre-filtered. One floating action bar (add to route, bulk edit, patch,
  export) serves any selection, made anywhere."* (design §6.0, L450)
- **Relative filtering by click** (design §6.0, L451): *"clicking a route (left rail, map hull, or its
  name anywhere) filters the whole workspace to it — map highlights its stores/line, schedule shows its
  person's rows, table scopes to its stops. Clicking a person does the same for their assignment. Click
  again / Esc to clear. Filtering is how you 'open' a route — there is no separate route page."*
  (Restated in decisions log L721: *"Filtering: Relative … that is opening a route."*)
- Selection is **bidirectional across views** (design §10, L696): a selection made in the table lights up
  on map and grid, and vice-versa. The full-canvas table's Mağazalar-tab checkboxes write the same shared
  `selection` set (design §6.6, L560).
- **Build ordering intent:** *"Build the shared state layer first; the panes are thin renderers over it."*
  (design §6.0, L456)

### 1.3 Docked right detail panel
- *"Detail panel docked right for the focused entity (store · route · person), always the same tabs:
  Info · Tasks · History + actions."* (design §6.0, L452; restated §10 L720)
- On the map, **a pin click first shows a mini popover** (name, revenue sparkline, quick actions) with an
  **expand control that docks it into the panel** (design §6.0, L452; §6.2 L495).
- The same three-tab card component is reused from map pin, table row, or grid block — *"one component"*
  (design §6.2, L495; §6.8 L566).

### 1.4 Screen layout skeleton (design §6.1, L460–481)
Top bar: Region selector ▾ · Route selector ▾ · **+ New Route**; a filter row (Chain ▾, Category ▾,
**☑ Hide stores on other routes**). Body: **MAP on the left, ROUTE PANEL docked right**; the route panel
is a live health card (name · status · assignee-since · Revenue bar · Minutes gauge · Category mix ·
Stability · Stops list with `[sort ▾]` and drag-to-reorder). Footer: **a warnings strip**
(*"⚠ 2 warnings: Mon under 450 min · SERVICE mix near 20% cap"*).

### 1.5 What lives OUTSIDE the workspace
*"Rules/templates, presets admin, analytics, and settings remain separate pages behind the gear — they're
out of the daily planning flow."* (design §6.0, L456). Settings is deliberately behind Yönetim with a
warn-toned banner (design §10, L707).

### 1.6 Width / desktop-first
No explicit min-width pixel value is stated in the design doc. The intent is unambiguously
**desktop-first, heavy-interaction**: a drag-drop calendar/map workspace with a draggable split divider,
lasso, multi-select, side-by-side map+scheduler (design §6.0/§6.2 L498; CLAUDE.md stack note: *"heavy
drag-drop calendar/map UI"*). No mobile/responsive planner is designed — the mobile surface is the
separate read-only agent week view (§6.7). Treat the panel as a fixed desktop canvas; there is no written
responsive contract to match.

---

## 2. Interaction contract — the decided UX conventions

These are the load-bearing rules. Most are restated verbatim in the §10 decisions log, so they are
**committed intent**, not sketches.

### 2.1 Drag a block = patch-for-this-week by default (+ make-permanent toast)
> *"Drag block (move day/time/person) | Default = **patch for this week** (reversible); post-drop toast:
> *Moved for this week · Make permanent · Undo*. Cross-person drag = `REASSIGN_TEMP` patch or permanent
> stop move."* (design §6.5, L546)

Decisions log: *"Drag default: Patch-for-this-week, toast to make permanent; apply-to-all scope toast on
duration edits."* (§10, L693). Turkish label for the permanent action is **"Kalıcı yap"**; writing it to
Baz first shows an impact confirm — *"'Kalıcı yap' impact confirm: Writing a patch to Baz first shows how
many future visits it touches"* (design §11.2, L779; change-list 1.6).

### 2.2 Duration edit (drag edge) = rubber-band reflow preview + ghost-shift
> *"Drag edge (extend/shrink) | Duration edit with **rubber-band reflow preview**: downstream blocks
> ghost-shift live while dragging (jumping over locked breaks), day total updates (438 → 483 ⚠) *before*
> drop. Snap: 5dk."* (design §6.5, L547)

Decisions log: *"Duration edit reflow: Rubber-band preview — downstream blocks ghost-shift live, jumping
locked breaks."* (§10, L694). Grid is **time-accurate, 5-minute snapping** (§10, L692; `snap_minutes=5`
setting L414).

### 2.3 Apply-to-all scope toast (on any duration edit)
> *"Post-drop scope toast on any duration edit: *This visit only · This store always · All Migros MM ·
> Undo* — writing an instance override, a store rule, or a format rule respectively (same chain as the
> modal, §6.4)."* (design §6.5, L548)

The same three-way scope choice is the core of the task-edit modal (§6.4, L529–535):
`◉ Only this visit (one-off override) / ○ This store from now on (creates rule) / ○ All Migros MM stores
(updates format rule)`.

### 2.4 Read-only past weeks — disabled, not hidden
- *"Edit locks | Past days and today's already-checked-in visits are locked (dimmed). Editing the rest of
  *today* prompts: 'Ayşe is on route — she'll be notified. Continue?' Future days edit freely."*
  (design §6.5, L552)
- Weeks are browsable: *"past = read-only (planned-vs-realized surface), current/future = editable"*
  (§10, L710). Past weeks are a **surface you still see** (planned-vs-realized), not hidden.
- In the full-canvas table this becomes: *"on read-only past weeks the mutating action buttons grey out
  while search/sort/export stay live"* (design §6.6, L560).

### 2.5 Warnings never block; publish gate with justification
- *"**Nothing hard-blocks publish.** Errors gate it behind a mandatory written justification + business
  objective, recorded to the Decision Journal ('override-with-reason')."* (design §3.2 v0.5 note, L302)
- Severity model is uniform: **🔴 Error · 🟡 Warning · 🔵 Info** (design §3.2 note, L302).
- **Only two structural exceptions stay hard blocks** — V3 (store outside `geo_scope`) and V4 (store on
  another active route) — *"since they'd corrupt data, not merely degrade the plan"* (design §3.2, L302).
  Everything else is override-with-reason.
- *"450 quota: Warn only — never blocks editing or publishing (warnings visible in publish summary)"*
  (§10, L724).

### 2.6 Publish is a two-step review gate
> *"Publish | Edits are drafts until **Publish week**. Clicking Publish opens a **review modal**: all
> pending changes grouped by agent and day … each with revert; explicit **Confirm** applies everything
> atomically and fires batched Notifications. Published changes update agent phones live. Nothing reaches
> an agent without passing this summary."* (design §6.5, L554)

Decisions log: *"Publish: Two-step: review modal (changes grouped by agent/day, per-item revert) →
Confirm → atomic apply + batched notify."* (§10, L723). And the separation of concerns:
*"Rules/exceptions save immediately (affect future generation); all schedule effects always require
Yayınla"* (§10, L709).

### 2.7 Keyboard & navigation
> *"Keyboard & navigation: `/` or `Cmd/Ctrl+K` focus search; Enter selects first result and scrolls-to +
> flashes the visit block; help guide updated; help icon plain black '?'."* (design §11.2, L785;
> change-list 1.5)

Global search focuses/filters store/route/person → focus/filter (§10 L730). **Esc clears** the active
relative filter/selection (design §6.0, L451). Sidebar routes are expandable to store lists — *"click =
highlight on map + open detail"* (§10, L730).

### 2.8 Right-click context menu (schedule block)
*"Right-click | Skip (patch) · Change frequency · Move to another day · Add note."* (design §6.5, L550)

### 2.9 Multi-select
*"Multi-select | Shift-click blocks → move/patch/skip together; copy a day or whole week to another
person."* (design §6.5, L549)

### 2.10 Conflict chips inline + resolve popover
*"Conflict chips | Overlaps and quota violations render inline (error/warning chips per day); clicking an
overlap opens a **resolve popover** with the 2–3 legal fixes."* (design §6.5, L551). Placement rule:
*"one status dot per visit card, counts in day headers, full list in Gelen kutusu › ⚠ Sorunlar"*
(design §3.2, L302).

### 2.11 Visit order numbers — one source of truth, three surfaces
> *"Every routed store shows its sequence number (1..n) identically in sidebar, on map pins, and
> implicitly in the grid. Single source of truth = generated visits … Reordering works both ways:
> dragging blocks in the grid renumbers sidebar/map; dragging rows in the sidebar re-times the grid …
> Reorder is a logged, undoable change."* (design §10, L731)

### 2.12 Effective / Base toggle
*"A global **Effective / Base** toggle: Effective shows baseline ⊕ patches … Base shows the untouched
monthly routine. Patched items render **dashed** in Effective mode."* (design §6.0, L454). *(Deferred —
see §5.)*

### 2.13 Statutory breaks are locked grey blocks
Breaks (60-min lunch + two 15-min teas) render as **non-editable locked grey blocks** in every generated
day; planners cannot delete or create them; the merchandiser day view carries a permanent legal notice
(design §3.3, L308–310; §6.5 L542).

---

## 3. Modals / panels the design calls for

| Panel / modal | What it does | Doc ref | Status vs current panel |
|---|---|---|---|
| **Right detail panel** (Info · Tasks · History tabs) | Docked-right card for focused store/route/person; map pin popover expands into it | §6.0 L452, §6.8 | **Built** (M1 006 ported Bilgi/Görevler/Geçmiş tabs; Görevler filled in M2 008) |
| **Route health card** | Live revenue bar / minutes gauge / category donut / stability; recomputes every edit | §6.3 L502–508 | **Built** (M1 006, Recharts) |
| **Task edit modal** (30dk→1saat) | Per-task duration list with **source trace**; scope prompt (this visit / this store / all format); inline day-total recalc | §6.4 L510–538 | **Built** (M2 008 Görevler + scope modal + Rule Inspector trace) |
| **Publish review modal** | Pending changes grouped by agent/day, per-item revert, Confirm → atomic + notify; **override-with-reason** justification for errors | §6.5 L554, §3.2 L302 | **Built** (M1 005 backend `decision_journal` + 006 PublishModal) |
| **Post-drop toasts** | "Moved for this week · Make permanent · Undo"; scope toast on duration edits | §6.5 L546–548 | **Built** (M1 006 / M1 007 drag-resize) |
| **Store pin mini-popover** | name, chain, category badge, 6-month revenue sparkline + total, current route, service minutes; actions Add/Move/History | §6.2 L489, L495 | **Partly built** (map pin popover in 006; sparkline richness may lag) |
| **Notes / inbox (Gelen kutusu)** | Two tabs: 💬 Saha (messages/requests/overdue) + ⚠ Sorunlar (severity list) | §11.2 L784, §6.7 | **Partly built** — M3 009 shipped a Notes inbox modal (Acknowledge/Resolve + open-count badge). The **⚠ Sorunlar / Conflict Center tab is deferred** (see §5) |
| **✨ Onarım decision workbench** | One row per affected visit; system narrows+ranks candidates (available · quota · proximity, reasoning shown); planner picks day+person or skips; partial decisions allowed; lands windowed patches + one Decision Journal entry | §7.3b L612–614, §11.2 L775 | **Deferred to M4** |
| **⚡ "Otomatik düzelt"** | Same-person/same-day time-shift only (opens overlap/travel gaps); never picks agent or day | §7.3b L614, §11.2 L776 | **Deferred to M4** |
| **Patch / "Add exception" modal** | Type picker (skip store / skip days / temp cover / time shift); **expiry required (V9)**; preview of affected future visits; confirm | §7.3 L610 | **Built** (M1 005/006 patch create) |
| **Reassign merchandiser modal** | pick person + start date + **reason (required)**; home-location distance shown | §7.4 L618, §7.1 | **Built** (M1 005 assignment API) |
| **Full-canvas Table workspace** (6 tabs) | Rutlar / Mağazalar / Kişiler / Görev şablonları / Yamalar / Kampanyalar; search + sort + CSV export; action columns call the **same** modals | §6.6 L560, §10 L732 | **Deferred** — M1/M2/M3 shipped only a Table **selection strip**, not the 6-tab canvas |
| **Simulate / new-route what-if card** | Lasso unassigned → floating card: Σ 6-month revenue vs 1.25M + est. weekly minutes; save as DRAFT | §6.2 L496, §7.5 | **Deferred** (`POST /simulate/route` not built) |
| **Live field layer / time scrubber** | Current positions on route lines + planned-vs-actual badge; scrubber is phase 2 | §6.2 L497, L499 | **Deferred to M4** (data pipeline landed M3; map viz is M4) |
| **Rule Inspector** | Dev-tools-style per-duration provenance chain (şablon → tip → rut → mağaza with arithmetic) | §11.2 L780 | **Built** (M2 008 trace popover) |
| **Rule-change Impact Preview** | Any scoped duration rule previews ripple first: stores · visits/week · Δdk/week · days over quota | §11.2 L781, change-list 1.9 | **Built** (M2 008 `rules/impact`) |
| **Planlama Kanıtı (Planning Evidence) panel** | Purpose-per-visit + value strip + evidence chain (plan→execution→shelf→sales), explicit no-causality framing | §11.2 L782, change-list 1.4 | **Deferred to M4** |
| **Yönetim admin pages** (templates + type-rule matrix + settings) | Behind the gear; draft→Kaydet→confirm-modal→Onayla, Turkey-wide warning, audit log | §5 L414–418, §10 L706–707 | **Deferred** — out of daily planning flow, not built |

---

## 4. Domain rules that shape the UI

These are invariants the UI must not violate. They come from §1 "Key principles," the entities in §2, and
the domain-rules block in CLAUDE.md.

1. **Baseline + Patch, never mutate.** *"The effective schedule = baseline ⊕ active patches. When a patch
   expires, the system reverts automatically."* (design §1, L37). Temporary changes are always Patches
   with **mandatory expiry** (§2.5; V9 blocks a patch without expiry at creation, §3.2 L293). UI
   consequence: a drag is a patch by default; permanence is an explicit extra step (§2.1 above).

2. **One active route per store — DB-enforced.** *"A store can be on at most one active route — enforced
   by the DB, which is what makes overlap errors impossible rather than merely discouraged."* (design §2.1,
   L65; partial unique index §5 L384). UI consequence: pickers/lasso only offer *unassigned, in-scope*
   stores; a store already on another route is **listed separately with a per-store 'move here' option,
   never silently added** (design §6.2 L488; V4 is a hard block, §3.2 L302).

3. **No delete — activate/deactivate only.** Routes, stores, people, task templates, and campaigns all have
   a single active ⇄ inactive toggle; *"records are always retained"* (design §10 L714; §4 state machines
   L329, L343). *"Inactive rows show greyed with a ▶ Aktifleştir action; inactive items drop out of the
   map, calendar, rail, pool, pickers, search, and schedule generation"* (§10 L714). Person deactivate is
   **blocked while they hold a route** — UI warns and refuses until reassigned (§4 L343).

4. **Visit duration = Σ task durations, resolved by Rules — never hand-typed.** Store format is a fixed
   global 6-level scale **Jet · M · MM · 3M · 4M · 5M** (code 1–6) (design §2.1 L59, §10 L708). Resolution
   order: `template default → chain/format rule → route rule → store rule → per-instance override`, with
   date-limited rules overriding permanent ones while active (design §2.9 L177–186). UI consequence: every
   duration in the task modal shows **its source** so planners see *why* an MM store costs 70 minutes
   (design §6.4 L538); `RouteStop.service_minutes` is only an optional manual override (§2.9 L188).

5. **Geography is a constraint, not a suggestion.** *"The picker physically cannot show out-of-scope
   stores."* (design §1, L39). *"Out-of-province stores don't render."* (design §6.2, L487). V3 (store
   outside `geo_scope`) is a hard structural block (§3.2 L302).

6. **Never auto-decide — surface tradeoff, human chooses.** *"The system narrows, ranks, previews impact
   and records reasons; the human chooses."* (design §1, L42). Applies to publish gate, Onarım (ranked
   candidates, planner picks), rule changes (impact preview first), analytics (evidence chain, no
   causality claims). No confidence percentages on AI plans (change-list 3.2 — *"false precision"*).

7. **Turkish UI vocabulary (identifiers stay English).** Domain terms the UI must use:
   **yama** = patch, **havuz** = pool, **Onarım** = repair workbench, **Baz** = baseline, **Yayınla** =
   publish, **Kalıcı yap** = make permanent, **Gelen kutusu** = inbox, **Sorunlar** = problems/issues,
   **İstisna** = exception, **Görevler** = tasks, **Geçmiş** = history, **Kampanyalar** = campaigns,
   **Yönetim** = admin. (design §1 L44 note; CLAUDE.md domain rules; §6.6/§10 throughout.)

8. **Statutory 450-minute day.** 450 **work** minutes + 90 break = 540 span; breaks are locked
   non-editable blocks; the day carries a permanent break-rights legal notice (design §3.3 L306–310).
   450 is warn-only, never a block (§10 L724).

---

## 5. Deferred vs built — do NOT flag deferred items as bugs

Milestones M0–M3 are COMPLETE; M4 has not started (`docs/ROADMAP.md` L17–83). The following prototype/
design features are **intentionally not built yet**, each confirmed on record (mostly 2026-07-17) — so a
comparison against the prototype will show them "missing" **by design**.

### 5.1 Deferred to M4 (Analytics & Onarım) — ROADMAP L80–82
- **✨ Onarım absence-repair decision workbench** (design §7.3b) — ranked candidates, per-visit picks.
- **⚡ Otomatik düzelt** same-person time-shift auto-fix (design §7.3b).
- **Planning Evidence / Planlama Kanıtı panel** + value strip + purpose-per-visit (design §11.2 L782;
  change-list 1.4) — planned-vs-realized analytics.
- **Live-location map layer / time scrubber** (design §6.2 L497, L499). *Data pipeline* landed in M3
  (`merchandiser_location_ping` + `GET /merchandisers/{id}/location-history`); **only the map rendering is
  M4** (ROADMAP L68–78, design §5 build-note L422–428).

### 5.2 Deferred (confirmed 2026-07-17, not silently dropped) — ROADMAP L39–41, L59–61, L76–78; DECISIONS
- **Conflict Center / Sorun Merkezi** — the ⚠ Sorunlar severity list/tab and jump-to-visit (design §3.2
  L302, §11.2 L784). *Note: the 💬 Saha half of the inbox shipped in M3 as the Notes modal.*
- **`POST /simulate/route`** — the what-if "can we add a person in region X?" flow (design §6.2 L496,
  §7.5, §9 L668).
- **Full-canvas 6-tab Table workspace** (Rutlar/Mağazalar/Kişiler/Görev şablonları/Yamalar/Kampanyalar)
  (design §6.6 L560). Only a Table **selection strip** shipped, not the tabbed canvas.
- **Effective / Base toggle** (dashed patched items) (design §6.0 L454).
- **Global search** (`/`, Cmd+K → focus/filter) (design §10 L730, §11.2 L785). *The keyboard hooks are
  designed but the global-search surface is deferred.*
- **History timeline** (the §6.8 three-entity timeline component). *M1 wired the Geçmiş tab to real
  audit-log data; the full visual timeline is deferred.*
- **Admin (Yönetim) pages** — standalone task-template CRUD, store-type rule matrix, settings page with
  draft→approve flow (design §5 L414–418, §10 L706).
- **Module-stack editor** (`SET_FREQUENCY` / `SET_MODULES` / `PATCH_MODULE` rules, `ModuleListEditor`)
  (design §2.8 L155, §10 L727).
- **Multi-route / multi-person stacked schedule rows** (per CLAUDE.md deferral list).
- **Standalone Yönetim admin pages for task-template/rule CRUD** (ROADMAP L60–61).

### 5.3 Real-build-only (never prototyped) — change-list Bucket 2 (L28–38)
Repair constraint solver / Coverage / Sacrifice Board (2.1); publish communication loop —
delivered/read/ack/"Anladım–Sorunum var" (2.2); per-user drafts + OCC / multi-planner merge (2.3); Setup
Mode / "Generate First Draft" cold start (2.4); policy-governance layer (2.5); skills/leave/KPI employee
fields + store business priority (2.6); virtualized rendering at scale (2.7).
*(Also enumerated in design §11.4, L798 as "Deliberately not built (still designed-only)".)*

### 5.4 Rejected / v2+ — change-list Bucket 3 (L40–47)
Full-day route optimization "Optimize Thursday" (3.1, opt-in only, V2); **confidence percentages on AI
plans (3.2 — explicitly rejected as false precision)**; hard blocks with no escape hatch (3.3 — superseded
by override-with-reason); gamified fairness score, heatmap dashboards, live collab, offline, NL campaign
builder (3.4). **RoutePreset is DROPPED** (design §2.13 L234 — weeks generate from Baz; nothing to copy).
**Campaigns removed as a concept** — folded into `TaskTemplate.target + valid_until` (design §2.8 L161,
§11.2 L783); no separate campaign entity/modal/tabs.

### 5.5 Mobile agent surface — out of current scope entirely
The §6.7 agent read-only week view and §2.12 notification delivery are simulated/seeded only: **no live
field-agent write API, no real FCM/MinIO, no batching window** (design §2.11 build-note L220, §2.12
build-note L228; ROADMAP L13). Notes are seeder-produced; `author_id` is nullable/mostly null.

---

## Quick cross-reference: what the shipped panel *should* already match

For parity work against the current panel (post-M3), the doc says these must be present and behave as
specified: **Map | Schedule split with layout presets** (§1.1); **shared bidirectional selection** (§1.2);
**docked right Info/Tasks/History panel** (§1.3); **live route health card** (§6.3); **drag = weekly patch
+ Kalıcı-yap toast** (§2.1); **drag-edge rubber-band reflow, 5dk snap** (§2.2); **apply-to-all scope toast
+ task-edit modal with source trace** (§2.3, §6.4); **past weeks disabled-not-hidden** (§2.4); **publish
review modal with override-with-reason** (§2.6); **patch create with mandatory expiry** (§7.3); **outcome
coloring + planned-vs-realized tooltip + Notes inbox** (M3). Anything from §5 above is *expected* to be
absent.
