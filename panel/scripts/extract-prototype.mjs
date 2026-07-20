/**
 * Slices the v0.5 planner prototype (evo-planner-prototype-v0.5.html) into the three static
 * assets the React PrototypeHost mounts:
 *   public/evo-prototype/proto.css   <style>  (body{} retargeted to .evo-proto-root)
 *   public/evo-prototype/body.html   <body>   markup, verbatim
 *   public/evo-prototype/engine.js   <script> block, verbatim + a small host-bridge footer
 *
 * The engine is loaded as a CLASSIC script by PrototypeHost so its top-level function
 * declarations stay global (the prototype's inline onclick="foo()" handlers depend on that).
 *
 * Re-run after editing the prototype:  node panel/scripts/extract-prototype.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../../evo-planner-prototype-v0.5.html')
const OUT = resolve(here, '../public/evo-prototype')
mkdirSync(OUT, { recursive: true })

const lines = readFileSync(SRC, 'utf8').split('\n')
// 1-indexed tag boundaries: <style>67 </style>298  <body>300 <script>437 </script>3594
const slice = (a, b) => lines.slice(a - 1, b).join('\n')

let css = slice(68, 297)
let body = slice(301, 436)
let script = slice(438, 3593)

// Give the region button an id so the province control can wire it (it's a static mock otherwise).
body = body.replace('<button>Ankara ▾</button>', '<button id="evoRegionBtn">Ankara ▾</button>')

// --- Inbox resolve ---
// The "Çözüldü" button marks a field note done locally; also persist it (NoteStatus 3) via the
// notes bridge. Note status is field comms, not a schedule effect — immediate, no Yayınla.
const NOTE_DONE_ANCHOR = "inboxData.find(x=>x.id===b.dataset.id).status='done';renderInbox();"
if (!script.includes(NOTE_DONE_ANCHOR)) throw new Error('inbox doneBtn anchor not found — prototype changed?')
script = script.replace(
  NOTE_DONE_ANCHOR,
  "inboxData.find(x=>x.id===b.dataset.id).status='done';if(window.__evoResolveNote)window.__evoResolveNote(b.dataset.id);renderInbox();",
)

// --- Calendar people filter ---
// `people` now includes unassigned merchandisers (candidates for the reassign/new-route pickers),
// so visiblePeople() must not put them on the calendar as empty rows — only people with a route or
// visits belong there when nothing is filtered.
const VISPEOPLE_ANCHOR = 'function visiblePeople(){\n  if(!filter)return people;'
if (!script.includes(VISPEOPLE_ANCHOR)) throw new Error('visiblePeople anchor not found — prototype changed?')
script = script.replace(
  VISPEOPLE_ANCHOR,
  'function visiblePeople(){\n  if(!filter)return people.filter(function(p){return routes.some(function(r){return r.person===p.id;})||visits.some(function(v){return v.personId===p.id;});});',
)

// --- Draft schedule duration ---
// storeDur() = sum of task-template minutes, but the mock templates are cleared, so every draft
// store computes to 0 and generateDraftSchedule stacks them all at 06:00. Fall back to a sane 45'
// slot for the draft PREVIEW (the real per-store durations are resolved by the backend on publish).
const DRAFTDUR_ANCHOR = 'const s=store(sid),d=storeDur(s);'
if (!script.includes(DRAFTDUR_ANCHOR)) throw new Error('draft-schedule duration anchor not found — prototype changed?')
script = script.replace(DRAFTDUR_ANCHOR, 'const s=store(sid),d=storeDur(s)||45;')

// --- Yeni rut modal: route code + geo scope follow the selected city ---
const NRCODE_ANCHOR = "const code='ANK-'+String(routes.length+1).padStart(2,'0');"
if (!script.includes(NRCODE_ANCHOR)) throw new Error('new-route code anchor not found — prototype changed?')
script = script.replace(
  NRCODE_ANCHOR,
  "const code=(window.__evoCityPrefix?window.__evoCityPrefix():'RUT')+'-'+String(routes.length+1).padStart(2,'0');",
)
const NRGEO_ANCHOR = '<span>Ankara ▾ · <span style="color:var(--tx3);">ilçe seç'
if (!script.includes(NRGEO_ANCHOR)) throw new Error('new-route geo anchor not found — prototype changed?')
script = script.replace(NRGEO_ANCHOR, "<span>${window.__evoProvince||'Ankara'} ▾ · <span style=\"color:var(--tx3);\">ilçe seç")

// --- Map delegation (M4) ---
// Let the React MapLibre controller (window.__evoRenderMap) take over map rendering; the
// prototype's SVG map is skipped when the hook is present. #mapSvg stays in the DOM (empty) so
// the marquee init doesn't throw; MapLibre is overlaid in #mapSvgWrap.
const RENDERMAP_ANCHOR = 'function renderMap(){'
if (!script.includes(RENDERMAP_ANCHOR)) throw new Error('renderMap anchor not found — prototype changed?')
script = script.replace(RENDERMAP_ANCHOR, RENDERMAP_ANCHOR + 'if(window.__evoRenderMap){window.__evoRenderMap();return;}')

// --- Backend publish hook (M3) ---
// The prototype's confirmPub commits by clearing changes[] locally; splice in a call to the
// React publishBridge (window.__evoPublish) FIRST, so Yayınla flushes the buffered edits to the
// backend before the local buffer is cleared. Reproducible string-replace on the verbatim slice.
// Keep the real (backend) week label across re-renders — renderHeader() otherwise recomputes it
// from the prototype's fixed July-2026 calendar every paint, reverting our injected label.
const WEEKLABEL_ANCHOR = 'function weekLabel(w){'
if (!script.includes(WEEKLABEL_ANCHOR)) throw new Error('weekLabel anchor not found — prototype changed?')
script = script.replace(WEEKLABEL_ANCHOR, WEEKLABEL_ANCHOR + 'if(window.__evoWeekLabelText)return window.__evoWeekLabelText;')

const PUBLISH_ANCHOR = 'changes=[];bg.remove();renderAll();'
if (!script.includes(PUBLISH_ANCHOR)) throw new Error('publish anchor not found — prototype changed?')
script = script.replace(
  PUBLISH_ANCHOR,
  "if(window.__evoPublish){try{window.__evoPublish({reason:errs.length?ra.value.trim():null,objective:$('#pubObjective').value});}catch(e){console.error('[evo] publish',e);}}" +
    PUBLISH_ANCHOR,
)

// The prototype lays out on body{...}; we mount into a .evo-proto-root container inside the
// React tree, so retarget that one rule and pin it to the viewport. Everything else verbatim.
css = css.replace(
  'body{background:var(--bg);color:var(--tx);font-size:13px;height:100vh;display:flex;flex-direction:column;overflow:hidden;}',
  '.evo-proto-root{position:fixed;inset:0;z-index:0;background:var(--bg);color:var(--tx);font-size:13px;display:flex;flex-direction:column;overflow:hidden;}',
)

const footer = `

/* ==== EVO host bridge (appended; not part of the prototype) ====
   Runs in the engine's top-level scope, so it can mutate the prototype's const arrays
   (people/routes/stores — in place) and reassign its let state (visits/baseVisits/weekData/…).
   The React backend bridge calls window.__evoLoadData(...) with mapped backend data; the
   prototype's own changes[] buffer still gates every commit behind Yayınla. */
window.__EVO_BOOTED__ = true;
window.__evoRenderAll = (typeof renderAll === 'function') ? renderAll : function(){};

window.__evoLoadData = function (d) {
  try {
    if (d.people) { people.length = 0; for (const p of d.people) people.push(p); }
    if (d.routes) { routes.length = 0; for (const r of d.routes) routes.push(r); }
    if (d.stores) { stores.length = 0; for (const s of d.stores) stores.push(s); }
    if (d.visits) {
      visits = d.visits;
      baseVisits = JSON.parse(JSON.stringify(d.visits));
      weekData = {}; weekData[currentWeek] = visits;
    }
    if (typeof d.quota === 'number') QUOTA = d.quota;
    // Snapshot the loaded plan so the publish bridge can diff current-vs-loaded and emit the
    // matching backend mutations on Yayınla (resize -> UpdateStop, move -> Patch).
    window.__evoSnapshot = {
      visits: JSON.parse(JSON.stringify(d.visits || [])),
      storeRoute: (d.stores || []).reduce(function (m, s) { m[s.id] = s.route || null; return m; }, {}),
      routePerson: (d.routes || []).reduce(function (m, r) { m[r.id] = r.person || null; return m; }, {}),
      routeMeta: (d.routes || []).reduce(function (m, r) { m[r.id] = { name: r.name, target: r.target, active: r.active !== false }; return m; }, {}),
      storeSchedule: (d.stores || []).reduce(function (m, s) { if (s.stopId) m[s.id] = { stopId: s.stopId, freqNum: s.freqNum, weekdayMask: s.weekdayMask, route: s.route || null }; return m; }, {}),
      storeActive: (d.stores || []).reduce(function (m, s) { m[s.id] = s.active !== false; return m; }, {}),
      weekFrom: d.weekFrom || null,
      weekTo: d.weekTo || null,
    };
    // Clear the prototype's remaining mock seed data — there is no fake task/rule/inbox data left;
    // the app shows only what the backend provides. (taskTemplates/typeRules have no list endpoint
    // yet, so they go empty; inbox comes from d.notes = GET /notes.)
    taskTemplates = [];
    typeRules = {};
    inboxData = Array.isArray(d.notes) ? d.notes : [];
    var ic = document.getElementById('inboxCount');
    if (ic) ic.textContent = String(inboxData.filter(function (x) { return x.status === 'open'; }).length);
    // Reset transient UI/edit state so a data (re)load starts clean.
    filter = null; focus = null; selection = new Set(); changes = []; expandedRoutes = new Set();
    if (typeof d.weekLabel === 'string') { window.__evoWeekLabelText = d.weekLabel; }
    if (typeof renderAll === 'function') renderAll();
  } catch (e) { console.error('[evo] __evoLoadData', e); }
};

// Read-only view of engine state for the publish bridge (runs in engine scope, so the live
// let-bindings for visits/stores/routes are captured, not stale copies).
window.__evoState = function () {
  return { visits: visits, baseVisits: baseVisits, stores: stores, routes: routes, people: people, currentWeek: currentWeek, filter: filter, focus: focus, selection: selection, panelTab: panelTab };
};

// Post-render hook: after renderPanel paints, let the tasks bridge swap the store Görevler tab
// for a backend-driven list (GET /stores/{id}/task-plan). Wrap the function binding — callers
// reference renderPanel by name at runtime, so they pick up the wrapper.
if (typeof renderPanel === 'function') {
  var __evoOrigRenderPanel = renderPanel;
  renderPanel = function () {
    __evoOrigRenderPanel.apply(this, arguments);
    try { if (window.__evoAfterPanel) window.__evoAfterPanel(); } catch (e) { console.error('[evo] afterPanel', e); }
  };
}

// Focus a store in the detail panel (used by the MapLibre pin click — the prototype's own
// SVG showPopover doesn't apply once the real map replaces the SVG).
window.__evoFocusStore = function (id) {
  try {
    if (typeof store === 'function' && !store(id)) return;
    focus = { type: 'store', id: id };
    panelTab = 'info';
    if (typeof renderAll === 'function') renderAll();
  } catch (e) { console.error('[evo] focusStore', e); }
};

// L4 schedule-days LIVE preview: toggle a routed store's visit day on/off and reconcile the live
// visits[] so the calendar updates immediately — the store's weekdayMask alone doesn't drive
// rendering (visits[] does). Runs in engine scope so it can reassign visits/baseVisits and reuse the
// prototype's own V/reflow/dayVisits helpers, exactly like moveStoreTo. Buffered via logChange (undo
// restores the prior visits snapshot); persisted to the backend on Yayınla by the publish bridge.
window.__evoToggleStoreDay = function (sid, i) {
  try {
    var s = stores.find(function (x) { return x.id === sid; });
    if (!s || !s.route) return;
    var r = route(s.route);
    var pid = r && r.person;
    var prevMask = (typeof s.weekdayMask === 'number') ? s.weekdayMask : null;
    var prevFreq = (typeof s.freqNum === 'number') ? s.freqNum : null;
    var curMask = s.freqNum === 1 ? 31 : (s.weekdayMask || 0);
    var newMask = curMask ^ (1 << i);
    // Snapshot this store's visits for a faithful undo (moveStoreTo pattern).
    var oldV = visits.filter(function (v) { return v.storeId === sid; }).map(function (v) { return Object.assign({}, v); });
    var oldB = baseVisits.filter(function (v) { return v.storeId === sid; }).map(function (v) { return Object.assign({}, v); });
    s.freqNum = 2; // days now drive it -> Weekly
    s.weekdayMask = newMask;
    var dur = storeDur(s) || 45;
    var touched = {};
    for (var d = 0; d < 5; d++) {
      var want = (newMask & (1 << d)) !== 0;
      var has = visits.some(function (v) { return v.storeId === sid && v.day === d; });
      if (pid && want && !has) {
        var dv = dayVisits(pid, d);
        var start = dv.length ? dv[dv.length - 1].start + dv[dv.length - 1].dur : DAY_START;
        var nv = V(sid, pid, d, skipBreaks(start), dur);
        visits.push(nv);
        baseVisits.push(Object.assign({}, nv));
        touched[d] = 1;
      } else if (!want && has) {
        visits = visits.filter(function (v) { return !(v.storeId === sid && v.day === d); });
        baseVisits = baseVisits.filter(function (v) { return !(v.storeId === sid && v.day === d); });
        touched[d] = 1;
      }
    }
    if (pid) { Object.keys(touched).forEach(function (d) { reflow(pid, +d); }); }
    clearFutureWeeks();
    var names = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'];
    var lbl = names.filter(function (_, k) { return (newMask & (1 << k)) !== 0; }).join(', ') || 'yok';
    logChange(s.name + ': ziyaret günleri → ' + lbl, pid || null, null, function () {
      s.weekdayMask = prevMask;
      s.freqNum = prevFreq;
      visits = visits.filter(function (v) { return v.storeId !== sid; }).concat(oldV.map(function (v) { return Object.assign({}, v); }));
      baseVisits = baseVisits.filter(function (v) { return v.storeId !== sid; }).concat(oldB.map(function (v) { return Object.assign({}, v); }));
      clearFutureWeeks();
    });
  } catch (e) { console.error('[evo] toggleStoreDay', e); }
};

if (typeof window.__evoOnBoot === 'function') { try { window.__evoOnBoot(); } catch (e) { console.error('[evo] onBoot', e); } }
`

writeFileSync(resolve(OUT, 'proto.css'), css)
writeFileSync(resolve(OUT, 'body.html'), body)
writeFileSync(resolve(OUT, 'engine.js'), script + footer)
console.log(`extracted: css ${css.split('\n').length} / body ${body.split('\n').length} / engine ${(script + footer).split('\n').length} lines -> ${OUT}`)
