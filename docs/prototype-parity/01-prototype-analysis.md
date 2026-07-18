# EVO Planner Prototype v0.5 — Exhaustive Dissection

Source: `/Users/amiralba/Documents/projects/EVO/evo-planner-prototype-v0.5.html` (3596 lines: HTML + inline `<style>` + inline `<script>`).
This is the canonical visual + interaction reference for the React panel. Line numbers below cite the source file.

The prototype is a **single-page workspace** (`body{height:100vh;display:flex;flex-direction:column;overflow:hidden}`, line 79). Everything is one screen — the page never navigates. "Yönetim", "Ayarlar", and "Gelen kutusu" are right-sliding half-panels layered over the live planner (`.page` transitions `right`, lines 206–207). All rendering flows through one `renderAll()` (line 3591) that fans out to `renderHeader / renderRail / renderMap / renderSched / renderPanel / renderStatus / renderActionBar / renderTable / renderDraftBanner`.

---

## 1. Overall layout & regions

### 1.1 Top-level DOM structure (body children, in order)

| # | Element | ID / class | Role | Lines |
|---|---------|-----------|------|-------|
| 1 | `<div class="topbar">` | `.topbar` | Fixed top bar (region + week nav + layout/mode toggles + search + publish + icons) | 302–326 |
| 2 | `<div id="draftBanner">` | `#draftBanner` | Amber banner shown only in new-route draft mode (`display:none` default) | 328 |
| 3 | `<div class="main">` | `.main` | The 3-region flex row (rail + panes + panel); `flex:1;display:flex;overflow:hidden` | 330–369 |
| 4 | `<div class="page" id="adminPage">` | `#adminPage` | Yönetim sliding panel | 374–394 |
| 5 | `<div class="page" id="settingsPage">` | `#settingsPage` | Sistem ayarları sliding panel | 397–406 |
| 6 | `<div class="page" id="inboxPage">` | `#inboxPage` | Gelen kutusu sliding panel | 410–418 |
| 7 | `<div class="drawer" id="drawer">` | `#drawer` | Bottom table drawer (animated `max-height`) | 420–424 |
| 8 | `<div class="statusbar">` | `.statusbar` | Bottom status/fairness bar + Undo/Journal/Table buttons | 426–433 |
| 9 | `<div id="overlay">` | `#overlay` | (empty; unused overlay hook) | 435 |

### 1.2 `.main` inner regions (the workspace) — lines 330–369

```
.main (flex row)
├── .rail        (170px fixed)      — left sidebar: Rutlar / Havuz tabs + list
├── .pane #mapPane (flex:1)         — MAP: pane-head + #mapSvgWrap(svg #mapSvg + .map-tools)
├── .pane #schedPane (flex:1)      — CALENDAR: pane-head + .sched-scroll #schedScroll
├── .pane #tablePane (flex:1)      — TABLE mode (display:none default): #tblTabs + #tblToolbar + #tblScroll
└── .panel       (250px fixed)      — right DETAIL panel: panel-head + panel-tabs + panel-body
```

Widths / behavior (from CSS):
- `.rail` = **170px**, `flex-shrink:0`, `.list` is `overflow-y:auto` (lines 93, 97).
- `.pane` = `flex:1; min-width:0; position:relative` — map and calendar **split 50/50** when both visible (line 108).
- `#mapPane` has `border-right:2px solid var(--border2)` (line 110); `#mapSvgWrap` is `flex:1;overflow:hidden;background:#EDEFE6` (line 111).
- `.panel` = **250px** fixed, `flex-shrink:0`, `border-left` (line 152). `.panel-body` is `overflow-y:auto` (line 159).
- `.pane-head` = 11px uppercase gray hint bar per pane, `flex-shrink:0` (line 109).
- `.drawer` animates `max-height:0 → 240px` over `.25s` (`.open` class), `.drawer-inner{max-height:240px;overflow-y:auto}` (lines 174–176).
- `.page` panels start at `right:-620px`, width 600px (`max-width:92vw`), slide to `right:0` via `.on` class, `transition:right .22s`, `box-shadow:-8px 0 24px` (lines 206–207).

### 1.3 Layout presets / view modes (the `#layoutSeg` toggle)

Four layout presets, segmented control in topbar (lines 306–311), `data-l` values `map | split | sched | table`; default `split` (`.on`). Handler at line 2492 sets `layout` then `renderHeader()`. Visibility logic in `renderHeader()` (lines 2463–2466):

| Layout (`data-l`) | Turkish label | mapPane | schedPane | tablePane |
|---|---|---|---|---|
| `map` | Harita | shown | hidden | hidden |
| `split` (default) | Bölünmüş | shown | shown | hidden |
| `sched` | Takvim | hidden | shown | hidden |
| `table` | Tablo | hidden | hidden | shown (calls `renderDataTable()`) |

There is a **second** segmented control `#modeSeg` (lines 312–315): **Efektif** (`eff`, default) vs **Baz** (`base`) — this is a data/edit MODE, not a layout. `mode` gates whether schedule blocks are editable and whether patches/value-strips/travel-connectors render (see §5). Switching to Baz shows toast "Baz görünüm: aylık rutin, yamalar hariç — salt okunur" (line 2491).

---

## 2. Every interactive control (Control → Type → Action)

### 2.1 Topbar controls (lines 302–326)

| Label (TR) | DOM | Type | Action | Lines |
|---|---|---|---|---|
| `Ankara ▾` | `<button>` (no id) | BUTTON (decorative) | **No handler** — static region picker mock | 304 |
| `‹` | `#wkPrev` | BUTTON | `setWeek(currentWeek-1)` — prev week (clamped 26–34) | 305 / 2488 |
| `Hafta 28 · 6–10 Tem` | `#wkLabel` | (label) | Text set by `renderHeader`; appends `🔒` if read-only, `(gelecek)` if >28 | 305 / 2454 |
| `›` | `#wkNext` | BUTTON | `setWeek(currentWeek+1)` | 305 / 2489 |
| Harita/Bölünmüş/Takvim/Tablo | `#layoutSeg button[data-l]` | TOGGLE (segmented) | Sets `layout`, `renderHeader()` (see §1.3) | 306–311 / 2492 |
| Efektif / Baz | `#modeSeg button[data-m]` | TOGGLE (segmented) | Sets `mode`, `renderAll()`; Baz shows read-only toast | 312–315 / 2490 |
| filter chip | `#filterChip` | (dynamic) | Renders active filter chip w/ `✕` → `setFilterNull()` | 316 / 2456–2460 |
| search input | `#globalSearch` | SEARCH + KEYBOARD | Live results dropdown `#searchResults`; `/`, `⌘K` focus; Enter picks first; Esc closes | 319 / 2494–2522 |
| `Yayınla (n)` | `#publishBtn` | BUTTON → MODAL | Opens Publish modal (§3) | 322 / 2394 |
| `?` | `#helpBtn` | BUTTON → MODAL | Opens Help modal (§3) | 323 / 2969 |
| `🔔 3` | `#inboxBtn` | BUTTON → SLIDE-PANEL | `showPage('inbox')` | 324 / 3042 |
| `⚙` | `#adminBtn` | BUTTON → SLIDE-PANEL | `showPage('admin')` | 325 / 3041 |

### 2.2 Left rail (lines 331–337; render 1096–1157)

| Control | Type | Action |
|---|---|---|
| `Rutlar` / `Havuz <pill count>` tabs | TAB | Sets `railTab`, `renderRail()` (line 2487). Havuz pill = count of unassigned active stores (line 1098) |
| route-item (`.route-item`) | BUTTON/FILTER | Click → `toggleRouteFilter(r.id, e.shiftKey)` (line 1133). Shift = additive multi-select |
| expand caret `▸/▾` (`.exp`) | TOGGLE | `expandedRoutes` add/delete, re-render rail; shows ordered store list (lines 1116, 1109–1114) |
| ordered store row (`.rstore`, `draggable`) | DRAG-HANDLE + BUTTON | Click → focus store; drag+drop → `resequenceRoute()` reorders visit sequence (lines 1117–1131) |
| `+ Yeni rut` (`.pool-item`) | BUTTON → MODAL | `openNewRouteModal()` (blocks if draft active) (lines 1136–1139) |
| pool-item (`.pool-item`, draggable) | DRAG-SOURCE + BUTTON | Click → focus store; drag → drop on calendar day cell to assign (lines 1142–1148) |
| `+ Yeni mağaza` | BUTTON → MODAL | `openNewStoreModal()` (line 1153) |

### 2.3 Map pane (lines 339–349; render 1188–1243)

| Control | Type | Action |
|---|---|---|
| `▭ Seç` | `#lassoBtn` | TOGGLE (default `.on`) | **No JS handler** — marquee is always active; button is cosmetic (lines 343) |
| `≡ Katman` | `#layersBtn` | BUTTON | **No handler** — mock (line 344) |
| `⚗ Simüle` | `#whatifBtn` | BUTTON | **No handler** — mock (line 345) |
| store pin (`<circle>`) | MAP-INTERACTION | Click → `showPopover(s,e)` (line 1224) |
| route line (invisible hit `polyline`, 14px) | MAP-INTERACTION | Click → `toggleRouteFilter(r.id, e.shiftKey)` (lines 1201–1207) |
| empty-space drag | MAP-INTERACTION | Marquee/lasso rectangle selection (lines 1288–1325) |

### 2.4 Right detail panel (lines 362–368; render 1593–1871)

- `panel-tabs`: **Bilgi / Görevler / Geçmiş** (`data-t = info/tasks/hist`), sets `panelTab`, `renderPanel()` (line 1871). Content is entirely context-driven by `focus` (store/route/routes/person/selection/draft). See §4.

### 2.5 Status bar (lines 426–433)

| Control | Type | Action |
|---|---|---|
| `#statusWarns` | dynamic link | Renders `🔴 n hata · 🟡 n uyarı · 🔵 n bilgi · Sorun Merkezi`; click → `openConflictCenter()` (lines 2469–2477) |
| `⚖ Adalet: …` | `#fairness` | text | Per-person "değerli %" fairness readout (lines 2478–2484) |
| `↶ Geri al` | `#undoBtn` | BUTTON | `undoLast()` — pops `changes[]`, runs undo fn (lines 430 / 2385–2389) |
| `📖 Kararlar` | `#journalBtn` | BUTTON → MODAL | `openJournal()` — Decision Journal (lines 431 / 2078) |
| `▤ Tablo` | `#drawerBtn` | BUTTON → DRAWER | `openDrawer()` toggle (lines 432 / 1875) |

### 2.6 Keyboard shortcuts (global; lines 2523–2535, plus search-local 2519–2522)

| Key | Action |
|---|---|
| `Esc` | If a slide-page open → back to planner; else clear selection + filter, hide popover, `renderAll()` |
| `⌘Z` / `Ctrl+Z` | `undoLast()` |
| `⌘K` / `Ctrl+K` | Focus + select global search |
| `/` | Focus search (unless typing in input/textarea/select/contenteditable) |
| `Enter` (in search) | Select first result |
| `Esc` (in search) | Blur + hide results |
| `Shift`+click (route/line) | Additive multi-route filter |

---

## 3. Modals — full inventory

All modals use the `.modal-bg` (fixed, `rgba(20,20,18,.45)` backdrop, z-index 80) + `.modal` (card, radius 12, width 480 default, `max-height:80vh`) pattern (lines 189–193). They are created imperatively via `document.createElement` and appended to `<body>`; closed by `.remove()`. **No open/close animation** on modals (only the slide-`.page` panels animate). Backdrop-click-to-close is **inconsistent** — only some wire `bg.onclick=e=>{if(e.target===bg)bg.remove()}`.

### 3.1 Modal reference table

| Modal | Trigger | Title | Key fields | Buttons → behavior | Backdrop close? | Lines |
|---|---|---|---|---|---|---|
| **Yeni rut** | Rail `+ Yeni rut` | "Yeni rut" | Auto code (readonly), Ad (input, default "Sincan Hattı"), Coğrafi kapsam (mock), Ciro hedefi (number) | Vazgeç → remove; **Haritada kur →** → push draft route, enter draft mode, toast | No | 600–623 |
| **Havuzdan mağaza ekle** | Route panel `+ Havuzdan mağaza`, draft panel, table `＋`/pool-picker | "Havuzdan mağaza ekle → CODE" | Search box, live list of pool stores each with `+ Ekle` | `+ Ekle`→`assignStore`; **Bitti** → remove | No | 626–651 |
| **Yeni mağaza (havuza)** | Rail `+ Yeni mağaza` | "Yeni mağaza (havuza)" | Ad, Zincir, Tip(select STORE_TYPES), Kategori(P/V/S), Ciro | Vazgeç; **Kaydet → konum seç** → sets `pendingNewStore`, toast "click map location" | No | 655–678 |
| **Kişi değiştir** | Route panel "Kişi değiştir", table `👤` | "Kişi değiştir — CODE (şu an: X)" | Search, candidate list (busy people disabled), **Sebep (zorunlu)** select (5 reasons) | Vazgeç; commit auto-fires on person+reason (`tryCommit`) — retargets visits, `logChange`, toast | No | 747–804 |
| **Rut düzenle** | Route panel `✎ Ad/Hedef`, table `✎` | "✎ Rut düzenle — CODE" | Ad, Ciro hedefi | Vazgeç; **Kaydet** → logChange rename/target | **Yes** (831) | 816–838 |
| **Rut ata (store→route)** | Table stores `⇄` | "⇄ Rut ata — STORE" | Search (code/name/person), top-8 routes + `✕ Havuza çıkar` | Kapat; row click → `moveStoreTo` | **Yes** (855) | 841–874 |
| **🚗 Yol süresi** | Calendar travel connector click | "🚗 Yol süresi — A ↔ B" | Tahmin (readonly), Kullanılan, Elle süre (number) | Vazgeç; **Tahmine dön** (if manual set); **Kaydet** → `travelOverrides`, logChange, toast | No | 1942–1982 |
| **📖 Karar Günlüğü** | Status `📖 Kararlar` | "📖 Karar Günlüğü" | Read-only list of decisions (publish/repair/perm/patch, reason, objective, errors) | Kapat | No | 2078–2093 |
| **+ Yama** | Store panel `+ Yama` | "+ Yama — STORE" | Tür(pause), Pencere select (closedUntil / leave / this week / date range) | Vazgeç; **Uygula** → remove visits w/ patchUntil, logChange+logDecision, toast | No | 2175–2212 |
| **✨ Onarım** (Repair) | Inbox issues `✨ Onarım`, `openRepair()` | "✨ Onarım — LABEL" | Disruption picker → per-visit decision rows (gün select, kişi select ranked candidates, Atla, ✕ clear), İş hedefi select | ‹Geri; Vazgeç; **Kararları taslağa uygula (n/m)** (disabled until ≥1 decided) | No | 2263–2368 |
| **Görev düzenle** | Store/route tasks `✎`, table `✎` | "Görev düzenle — X" | Görev select, Yeni süre, Kapsam(store/route), Geçerlilik(kalıcı/bu hafta/bugün), live impact preview | Vazgeç; **Kaydet** → taskOverride + rulesData + applyDelta | No | 2634–2689 |
| **Yayın özeti (Publish)** | Topbar `Yayınla` | "Yayın özeti — n değişiklik" + err/warn badges | Changes grouped by person·day, each `Geri al`; error box + mandatory `#pubReason` textarea (≥5 chars); İş hedefi select | Vazgeç; **Onayla ve yayınla** (disabled if unmet) | No | 2398–2450 |
| **? Kullanım kılavuzu (Help)** | Topbar `?` | "? Kullanım kılavuzu — tüm ipuçları" | Long help text (`.hlp`) covering all regions/shortcuts | **Anladım** (primary) | **Yes** (3039) | 2969–3040 |
| **📜 Denetim kaydı** | Admin foot `📜 Denetim kaydı` | "📜 Denetim kaydı" | adminLog + settingsLog entries | Kapat | No | 3240–3248 |
| **⚠ Yönetim değişikliği — onay** | Admin `Kaydet` | "⚠ Yönetim değişikliği — onay" | Diff list of pending admin changes + who/when | Vazgeç; **Onayla ve uygula** → commit draft, adminLog | No | 3249–3281 |
| **🧩 Modül düzenle (store)** | Store tasks `🧩` | "🧩 TASK — STORE (sadece bu mağaza)" | Module list editor + live "SAHA ÖNİZLEME" agent-screen preview | Genel şablona döndür (if custom); Vazgeç; **Kaydet (bu mağaza)** | No | 3360–3397 |
| **Şablon düzenle / Yeni şablon** | Admin `Düzenle`/`+ Yeni şablon`, table `✎` | "Şablonu düzenle / Yeni şablon" | Ad, Süre, Kanıt, Sıklık, Hedef(tip/zincir), Son tarih(date), Saha talimatı, module editor + preview, live target count | Vazgeç; **Taslağa ekle** → writes to adminDraft | No | 3398–3450 |
| **⚠ Sistem ayarı — onay** | Settings `Kaydet` | "⚠ Sistem ayarı değişikliği — onay" | Dirty settings diff (from→to) + who/when | Vazgeç; **Onayla ve uygula** → settingsLog, apply, QUOTA update | No | 3494–3519 |

### 3.2 Toast (not a modal but the core feedback surface) — lines 1901–1914

`.toast` fixed bottom-center dark pill (line 185), z-index 60, auto-dismiss after **7000ms**. `toast(msg, btns[])` where each btn `{t,f}` renders a blue `.act` button; always has an `✕` dismiss. Toasts carry the **scope-choice actions** for drags/resizes (e.g. "Kalıcı yap (Baz)", patch windows, "Geri al"). This is the primary decision surface for patch-vs-permanent.

### 3.3 `prompt()`/`confirm()` native dialogs

- `renameRoute` / `setRouteTarget` use `prompt()` (lines 807, 811) — legacy path; the modal `openRouteEditModal` is the real one.
- `applyPatchWindow` date-range uses `prompt('Yama bitiş tarihi…')` (line 2166); patch modal date range same (line 2201).
- `deactivateRoute` / `cancelDraft` use `confirm()` (lines 882, 1018).
- Leaving admin with unsaved diffs → `confirm()` (line 2700).
- Several `alert('Prototip: …')` placeholders (before/after photos, simulate, note, presets — lines 1676, 1687, 1808, 3099).

---

## 4. Sidebars & panels

### 4.1 Left rail (`.rail`, persistent, 170px) — §2.2

Two tabs (`railTab`): **Rutlar** (active routes as cards with color dot, code, optional draft pill, person·ciro·points, expand caret) and **Havuz** (unassigned active stores as dashed draggable cards + `+ Yeni mağaza`). Inactive routes hidden. `poolCount` pill = unassigned active stores.

### 4.2 Right detail panel (`.panel`, persistent, 250px) — render 1593–1871

Tabbed **Bilgi / Görevler / Geçmiş**. Content depends on `focus.type`:

- **draft** (setting up new route) → "kurulum kartı": checklist (points/ciro/duration/mix), person select (auto-generates preview week), pool-picker button, **Aktifleştir** / **Vazgeç** (lines 1596–1621).
- **selection** (marquee/multi) → total ciro, mix, unassigned count, point list, bulk-assign buttons (1625–1646).
- **store** → Bilgi (ciro, trend sparkline, route, person, weekly visits, closedUntil status, **Ziyaret amacı** select PURPOSES, **Ziyaret sıklığı** select FREQS, **📊 Planlama Kanıtı** evidence box with comp%/plan-vs-actual/shelf/sales/ROI/rec, searchable route reassign, `+ Yama` / `+ Not`). Görevler = full task manager (⠿ drag reorder, ✎ edit, 🧩 modules, 🗑 remove, add, **🔍 Kural Denetçisi** source-chain audit). Geçmiş = mock timeline (1647–1794).
- **routes** (multi-filter) → combined summary: total points, ciro/target, people, overlap check, simulate button (1795–1808).
- **route** (single) → Bilgi (ciro/target, mix, stability, active patches, assignment history, patch list w/ revert, `+ Havuzdan mağaza` / `Kişi değiştir` / `✎ Ad/Hedef` / `⏸ Pasifleştir` or `▶ Aktifleştir`). Görevler = route task rules + points. Geçmiş = mock (1809–1849).
- **person** → Bilgi (weekly load, route, changes, compliance). Görevler = mock task list. Geçmiş = mock notes (1850–1868).

### 4.3 Slide-in half-panels (`.page`, toggled, 600px, right-slide) — `showPage()` line 2698

Only one open at a time; `showPage(p)` toggles `.on`, calling the same name again closes back to planner. Esc closes to planner.

- **#adminPage (Yönetim)** — lines 374–394. Header + subtitle "Türkiye genelini etkiler". `admin-tabs`: **Görev şablonları** / **Mağaza tipi kuralları** (`data-t=templates/rules`). Body `#adminBody` (renderAdmin, 3186). Footer: **Kaydet** (disabled until diffs), **Vazgeç**, dirty counter, **📜 Denetim kaydı**, **⚠ Sistem ayarları →**. Draft model: all edits accrue in `adminDraft`; Kaydet → onay modal → commit + audit log.
  - Templates tab: cards per template (default min, proof, rec, target/until badge, instruction), **Düzenle**/**Pasifleştir**, **+ Yeni şablon** (3190–3207).
  - Rules tab: **Görev × mağaza tipi süre matrisi** (editable number cells per STORE_TYPES × active templates; overridden cells colored blue), + exceptions list (store/route overrides from panel ✎) each with Kaldır (3208–3237).
  - **Note:** there is a legacy first `renderAdmin` (lines 3048–3134) covering templates/rules/**presets**/**settings/ayarlar** inline; it is **overridden** by the second definition (line 3186) — the presets tab and inline-settings paths are dead code. `presetsData` is referenced but never defined (dead).
- **#settingsPage (Sistem ayarları)** — lines 397–406, renderSettings 3464. Amber warning banner. Grouped number inputs (SETTING_DEFS: quota, snap, target, esc, batch), **Kaydet**(dirty-gated) → onay modal → settingsLog, **Vazgeç**, change-history audit card. Back to Yönetim / Close buttons.
- **#inboxPage (Gelen kutusu)** — lines 410–418, renderInbox 3547. Two tabs (`inboxTab`): **💬 Saha** (field notes/requests/overdue from `inboxData`; each item: type icon, who, text, `📍 bağlama git` anchor, `Uygula (n dk)` for requests, `Çözüldü`) and **⚠ Sorunlar** (= the Conflict Center / Sorun Merkezi; renderInboxIssues 3523: grouped err/warn/info, click row → jump-and-flash, `⚡ Otomatik düzelt`, `✨ Onarım`). `openConflictCenter()` (line 2043) simply switches to inbox → issues tab. The old separate Sorun Merkezi modal was folded into the inbox in v0.5.6.

### 4.4 Bottom table drawer (`.drawer`, toggled) — render 1876–1900

`▤ Tablo` (statusbar) or action-bar "▤ Tabloda gör" opens it. Shows filtered `visits` (by visible people, or by selection). Columns: Mağaza, Kategori, Kişi, Gün, Saat, **Süre (dk)** (editable number input, 5-step, live reflow + logChange), Yama. Row click → focus store. Distinct from the full **Tablo layout mode** (§6/`renderDataTable`).

---

## 5. Interaction behaviors ("what happens if I do this")

### 5.1 Drag & drop

**a) Calendar block move** (`startMove`, lines 1499–1558): pointerdown on `.vblock` (not on resize handles). Threshold 5px to start; creates a **fixed ghost** clone (`opacity:.85`) that follows cursor, plus a **drop indicator** (dashed blue box with live `HH:MM–HH:MM · Ndk` label snapped to 5-min at cursor). Target `.day-cell` gets `.dragover` (blue). On drop: sets personId/day/start (snapped, `skipBreaks`), **`v.patched=true`**, `reflow`, `logChange(..., patch=true)`. Then a **toast with scope choices**: `Kalıcı yap (Baz)` + patch-window options (store closedUntil / person leave / date range) + `Geri al`. **Default = patch (this week only)**; permanent requires the toast action. If no move → click = focus store.

**b) Calendar block bottom-resize** (`startResize`, lines 1559–1583): drag `.rz` handle → duration changes in **5-min snaps** (min 10, max 240), live `reflow` + re-render. On release: `logChange` then toast **"Nereye uygulansın?"** with 4 scope buttons: *Sadece bu ziyaret (tarihli)* / *Bu mağaza hep* / *Bu rutta (CODE)* / *Tüm FORMAT tipi*. Scope choices (except first) run `previewApply` → impact-preview toast first (§5.9), then rule-wide `applyDur`.

**c) Calendar block top-resize** (`startResizeTop`, lines 1476–1498): drag `.rzT` → moves **start time, end fixed** (calendar standard), 5-min snap. On release marks patched, toast with Kalıcı/patch-window/Geri al.

**d) Rail store reorder** (lines 1117–1131): drag `.rstore` within a route → `resequenceRoute` (reorders each day's visits by new order, keeps first slot time), toast "Ziyaret sırası güncellendi" + Geri al.

**e) Pool → calendar day** (lines 1441–1457): drag `.pool-item` onto a `.day-cell` → assigns store to that person's route, appends visit (dur 30) at end of day, reflow, logChange, toast.

**f) Task row reorder** (store Görevler, lines 1770–1787): drag `.ptRow` → `storeTaskOrder[s.id]` updated (field-application order), toast + Geri al.

Read-only weeks and `mode==='base'` disable calendar drag entirely (blocks get `cursor:default;opacity:.7`, lines 1415–1417).

### 5.2 Selection & cross-pane sync

- **Map marquee** (lines 1288–1325): pointerdown on empty SVG → dashed blue `.marquee` rubber-band. On release: if <6px = treated as click (place pending new store if any, else clear selection). Else selects all stores inside box → `selection` Set, `focus={type:'selection'}`. Scales client px → SVG 600×520 viewBox coords.
- **Selection Set** = store ids; drives map pin enlargement (`r:10`, blue dashed stroke), panel selection view, action bar, table filter.
- **Action bar** (`renderActionBar`, 1327–1336): dark floating pill bottom-center of map when `selection.size>0`: "N nokta seçili" + per-route `→ CODE` bulk-assign buttons + `▤ Tabloda gör` + `✕`.
- **Cross-pane sync**: single `visits`/`selection`/`focus`/`filter` state → `renderAll()` repaints all panes. Store selected on map → checkbox checked in Tablo mode `stores` table (`cfg.select` shares `selection`, lines 2936–2939); focus store → calendar block gets `.sel` outline + map pin enlarges; search-select store → expands route + scrolls+flashes calendar block.
- **Filter** (`filter`): route filter (single or Shift-additive Set) or person filter. `visibleStores()/visiblePeople()` narrow map + calendar. Filter chip in topbar with `✕`. Clicking a person name in calendar toggles person filter (line 1376).

### 5.3 Hover states & tooltips

- Buttons: `:hover{background:var(--gray-l)}` (line 81); primary hover lightens (line 83).
- `.route-item:hover` border/bg change (line 99); dataTable row hover = blue-l (line 245).
- Calendar block `title` (line 1409): `NAME · Amaç: PURPOSE · yama: …`.
- Travel connector `title` (line 1434): full route-time detail (source, confidence, impossible-by-Xdk, "tıkla: süreyi düzenle").
- Task rows `title=instruction` (line 1722); every duration shows source tag (`.src`) inline.
- Rail expanded stores show sequence number badges; map pins show white sequence number.
- Store popover (`showPopover`, 1244–1264): name, category badge, chain·format, 6-month ciro + ASCII sparkline `▁▂▄▃▅▆`, route/person, `→ Ruta ekle…` select (if unassigned) + `Genişlet →`.

### 5.4 Filtering / search

- **Global search** `#globalSearch` (2494–2522): ≥2 chars → searches active stores/routes/people, dropdown of up to 8 (`.sres`), bold label + gray sub. Click: store→focus+scroll-flash to block; route→toggle filter; person→filter+focus. Enter=first; `/` & `⌘K` focus; Esc closes.
- **Per-table search** in Tablo mode (`tblSearch`, live filter over `cfg.search` fields, Turkish-lowercase `trLow`).
- **Modal-local searches**: pool-picker, person-picker, route-picker, store-panel route reassign — all live-filter.

### 5.5 Duration editing surfaces

Four ways: calendar bottom-resize (§5.1b, with rule-scope), calendar block via task rules, **table drawer number input** (§4.4), **Tablo-mode** — actually Süre editing there routes through `openTaskEdit`. Also request "Uygula" in inbox applies a store-wide duration via `applyDur`.

### 5.6 Publish flow (lines 2394–2450)

`Yayınla` → if no changes, toast. Else compute issues. Modal groups `changes[]` by `person·day` (or "Genel (kural)"), each item has inline `Geri al` (removes+undoes that change, reopens modal). Header badge shows `🔴 n hata 🟡 n uyarı` or `✓ temiz`. If errors exist: red error box lists them + **mandatory reason textarea** (`#pubReason`, ≥5 chars enables confirm). İş hedefi (objective) select always present. **Onayla ve yayınla** disabled while errors unjustified; on confirm → `logDecision(kind:publish, objective, reason, errors)`, clears `changes`, toast "Yayınlandı ✓ … bilgilendirildi (toplu bildirim)". Errors never block — they gate on justification ("uyar, asla engelleme").

### 5.7 Read-only / disabled states

- `isRO()` = `currentWeek < 28` (line 492). Past weeks: schedule shows lock banner (line 1347), blocks non-draggable + click-to-focus only, all mutating actions toast "Geçmiş hafta — salt okunur" (guards in openRouteEditModal, openRoutePickerModal, deactivate*, openTravelEdit, openRepair, etc.).
- Tablo mode: mutating row-action buttons (`mut:true`) disabled when RO (`dis=a.disabled||(ro&&a.mut)`, line 2912); search/sort/export stay live.
- `mode==='base'`: calendar read-only, no patches/value-strips/connectors.
- Person-picker: busy people rows disabled (opacity .45).
- Publish/Admin/Settings confirm buttons disabled until valid.

### 5.8 Auto-fix & Repair

- `⚡ Otomatik düzelt` (`autoFixDay`, 2054–2071): only **shifts downstream** visits to clear overlaps/travel (never re-plans day), marks patched, toast.
- `✨ Onarım` (`openRepair`): manual decision workbench for disruptions (person leave / store closed). System **narrows + ranks** candidates (availability · quota · region proximity via `candidatesFor`) but the planner picks person+day per row; undecided rows stay in Sorun Merkezi. Applies as patches with window, logs decision with objective.

### 5.9 Rule impact preview (lines 2109–2134)

`ruleImpact` computes affected stores/visits/Δminutes/days newly over quota; `previewApply` shows a toast "Etki önizleme: N mağaza · N ziyaret · +Xdk … uygulansın mı?" before applying rule-wide changes. `openTaskEdit` shows a **live** impact box while editing.

### 5.10 Baz + Patch model (data engine, lines 484–548)

`baseVisits` = permanent pattern; `weekData[w]` = per-week effective copy (`projectWeek` filters inactive stores/routes and biweekly); patches are per-week visit mutations with mandatory `patchUntil` window that auto-reverts. `clearFutureWeeks` re-projects future weeks preserving their patches. `makePermanent` writes a patch into Baz. Sequence numbers derive from first visit `(day,start)` — single source `visits`, so rail/map/calendar stay synced.

---

## 6. Tablo (full table) mode — lines 2715–2967

Config-driven single table component. `TBL_ORDER = ['routes','stores','people','templates','patches']` (line 2718; campaigns removed in v0.5.4). Each `TABLES[key]` defines `title, rows(), search[], cols[] (render/text/sort), actions(), rowClick, select?, isActive?`.

- **Tabs** `#tblTabs` with per-tab live count (line 2876).
- **Toolbar** `#tblToolbar`: search input (disabled if no search fields), rowcount, optional adminChip ("N Yönetim değişikliği onay bekliyor"), **⬇ Dışa aktar** (CSV with UTF-8 BOM `﻿`, respects current search+sort, filename `evo-<tab>-H<week>.csv`, lines 2953–2967).
- **Sortable columns** (click `th` → asc/desc arrow ▲/▼), sticky header.
- **Row actions** (last col) call the **same** functions as panel/map (no duplicate logic): e.g. routes `🔎 Filtrele / ✎ Düzenle / 👤 Kişi / ＋ Mağaza / ⏸ Pasifleştir` (or `▶ Aktifleştir` when inactive). Stores table has `select:true` checkboxes shared with `selection` (+ select-all).
- Inactive rows: `tr.inact` → `td:not(:last-child){opacity:.45}` + "pasif" badge (lines 247, 2782).

---

## 7. Visual design tokens (from `<style>`, lines 68–298)

### 7.1 Color palette (`:root`, lines 68–77)

| Token | Hex | Meaning |
|---|---|---|
| `--bg` | `#FAFAF7` | App background (warm off-white) |
| `--card` | `#FFFFFF` | Card / surface |
| `--border` | `#E3E1D9` | Default border |
| `--border2` | `#CBC9BF` | Stronger border / control border |
| `--tx` | `#2C2C2A` | Primary text |
| `--tx2` | `#6B6A64` | Secondary text |
| `--tx3` | `#98968D` | Tertiary / hint text |
| `--blue` | `#378ADD` | Primary accent (hover, patch stroke) |
| `--blue-d` | `#185FA5` | Primary dark (buttons, active tabs, focus) |
| `--blue-l` | `#E6F1FB` | Primary light (selected bg, chips) |
| `--teal` | `#1D9E75` | Teal accent |
| `--teal-d` | `#0F6E56` | Teal dark (category "P"/Potansiyel text, route r2 color) |
| `--teal-l` | `#E1F5EE` | Teal light (badge P bg, tips) |
| `--amber` | `#EF9F27` | Amber accent (loadbar mid) |
| `--amber-d` | `#854F0B` | Amber dark (warnings, category "V"/Değerli text) |
| `--amber-l` | `#FAEEDA` | Amber light (badge V bg, draft pill, admin chip) |
| `--red` | `#E24B4A` | Error accent |
| `--red-d` | `#A32D2D` | Error dark text |
| `--red-l` | `#FCEBEB` | Error light bg (also `#fde8e8` fallback used inline) |
| `--green` | `#639922` | Success (ok totals, on-target ciro) |
| `--green-l` | `#EAF3DE` | Success light |
| `--gray-l` | `#F1EFE8` | Neutral light (hover bg, service badge, hlines) |
| `--gray-m` | `#B4B2A9` | Neutral mid (timeline dots) |

**Category colors** (store cat P/V/S): P = teal (`.badge.P`, `.vblock.catP` teal-l/teal-d, border `#9FE1CB`); V = amber (`.catV` amber-l/amber-d, border `#FAC775`); S = gray (`.catS` gray-l/tx2). Category emoji legend used throughout: 🟢 P (Potansiyel), 🟡 V (Değerli), ⚪ S (Servis). Lines 143–145, 168–170.

**Route line colors** (data, not tokens): r1 `#185FA5`, r2 `#0F6E56`, new-route draft `#993C1D`/`#185FA5` (lines 456–457, 617).

**Map SVG palette** (lines 1160–1187): base `#EDEFE6`, water `#C9DFF0`/stroke `#AECBE4`, parks `#D9E8CF`, roads white (7px arterials, 3.5px streets), buildings `#E3E4DA`, labels `#A9A79D` italic.

**Outcome/status status dots** (v0.5): `.vst.E{color:var(--red)}`, `.vst.W{color:var(--amber-d)}` — single worst-severity dot per block (lines 257–258).

### 7.2 Typography

- Font stack: `-apple-system,'Segoe UI',Roboto,sans-serif` (line 78; `kbd`/inputs inherit).
- Base `body font-size:13px` (line 79). Scale seen: 9px (axis/labels), 10px, 10.5px, 11px (meta/sub), 12px (body/buttons), 13px (route code/section), 14px (panel title), 15px (logo/modal head).
- Weights: 400 default, 500 (chip), 600 (labels/headers/active tabs), 700 (numbers/emphasis), 800 (help `?`).

### 7.3 Spacing, radius, shadows, transitions

- Padding rhythm: buttons `4px 10px`; topbar `8px 14px`; panes head `6px 10px`; panel-body/modal-body `12px 18px`; cards `12px 14px`.
- Gaps: 8px (topbar), 4–10px common.
- **Border-radius:** 4px (small/hlines/kbd), 5px (inputs), **6px** (buttons/chips-x/toasts sections), 7px (rows), **8px** (cards/items/popover/badge groups), **10px** (cards/action bar/toast), **12px** (modal, chip 12px pill), 50% (dots/pins).
- **Shadows:** popover `0 4px 14px rgba(0,0,0,.13)`; action bar `0 6px 18px rgba(0,0,0,.25)`; toast `0 6px 18px rgba(0,0,0,.3)`; search results `0 6px 18px rgba(0,0,0,.15)`; slide page `-8px 0 24px rgba(0,0,0,.14)`.
- **Transitions/animations:** drawer `max-height .25s`; page `right .22s`; `@keyframes v5flash` (block flash outline, `.8s ease 2` on `.flash`, lines 254–256); loadbar/pins width transitions implicit.
- Backdrop: `rgba(20,20,18,.45)` (modal-bg).

### 7.4 Calendar geometry constants (JS, line 443)

`DAY_START=360` (06:00), `DAY_END=1380` (23:00), `CELL_H=510px`, `PXMIN=510/1020≈0.5 px/min`. Grid: `110px 36px repeat(5, minmax(120px,1fr))` columns, `row-gap:26px` (line 123). Time axis every 60min; hlines dashed. Day cell 510px tall, radius 8. Snap = 5 min. Quota default **450** (`QUOTA`).

---

## 8. Mock data / demo behaviors

- **people** (line 448): p1 Ayşe K., p2 Mehmet D. (leave 7–9 Tem, days [1,2,3] — drives Onarım + leave-error), p3 Zeynep A. (no route yet, candidate).
- **routes** (455): r1 ANK-01 Çankaya Merkez (p1, #185FA5, target 1250), r2 ANK-02 Keçiören Hattı (p2, #0F6E56, target 1250).
- **stores** (463): s1–s11, Turkish chains (Migros/Carrefour/ŞOK/A101/BİM + kantinler), formats Jet/M/MM/3M/4M, categories P/V/S, coords x/y in 600×520 space, `perf` mock (comp%, act min, shelf[before,after], sales trend %, ROI 1–5), s4 `closedUntil:'24 Tem'`, s9 valuable-in-pool.
- **visits** (478): 14 seeded visits across p1/p2, week 28.
- **TODAY** = `'2026-07-10'`; week model 26–34, RO before 28, currentWeek 28.
- **taskTemplates** (2548): t1–t6 with module stacks (FOTO/BILGI/KONTROL/FORM), t6 "Süt reyonu anketi" = the ex-campaign (target Migros, until 2026-07-17).
- **typeRules** (2587): 4M/5M/Jet duration overrides. **settingsData** (2589): quota 450, target 1250, snap 5, esc 3, batch 15.
- **inboxData** (2690): 3 items (note, request w/ apply, overdue). **CURRENT_USER** = 'Süpervizör · Parham'.
- **Simulated engine bits**: travel time = Euclidean estimate `hypot*0.08` (min 3) unless manual override; confidence by distance; validation (`validate`) produces quota/overlap/travel/dayend/leave/closed/pool/due issues; evidence recommendations heuristic; repair candidates ranked heuristically. All comments flag "gerçek build" replacements (GPS, constraint solver, EVO sync, real tables).
- **Mock/placeholder controls with no handler**: `Ankara ▾`, `≡ Katman`, `⚗ Simüle`, several `alert('Prototip: …')` (before/after photos, simulate person, add note, presets). Presets admin tab + `presetsData` are dead (overridden renderAdmin).

---

## 9. Notable parity gotchas for the React rebuild

1. **Everything is one `renderAll()`** — full re-render on every change; React should model `filter/focus/selection/changes/mode/layout` as shared state (the "paylaşılan durum" principle, line 28).
2. **Patch-by-default**: calendar edits are this-week patches; permanent requires explicit toast action. Preserve the toast-as-decision-surface pattern (scope + patch-window choices).
3. **Never block, always justify**: errors gate publish on a reason, never disable it hard.
4. **Scope ladder for durations**: visit → store → route → format (resize toast) and mağaza > rut > format > zincir > genel (rules). Show impact preview before rule-wide apply.
5. **Sequence numbers are derived**, not stored — from first visit (day,start); keep single source.
6. **Read-only weeks** disable mutations everywhere but keep view/search/export.
7. **Admin/Settings are draft→save→confirm→audit**, not live; leaving dirty warns.
8. **Two "table" surfaces**: bottom drawer (`#drawer`, visit-level duration edit) vs full Tablo layout mode (config-driven, 5 entity tabs, CSV export, shared selection).
9. **Sorun Merkezi = Inbox › Sorunlar tab**, not a separate modal (v0.5.6). Status-bar counters and day-header badges deep-link into it.
10. **Dead/legacy code present**: first `renderAdmin` (presets/inline settings), `presetsData` (undefined), `renameRoute`/`setRouteTarget` prompts, `archiveRoute` alias — do not port.
