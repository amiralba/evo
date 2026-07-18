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
const body = slice(301, 436)
const script = slice(438, 3593)

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
    // Reset transient UI/edit state so a data (re)load starts clean.
    filter = null; focus = null; selection = new Set(); changes = []; expandedRoutes = new Set();
    if (typeof renderAll === 'function') renderAll();
    if (typeof d.weekLabel === 'string') { var wl = document.getElementById('wkLabel'); if (wl) wl.textContent = d.weekLabel; }
  } catch (e) { console.error('[evo] __evoLoadData', e); }
};

if (typeof window.__evoOnBoot === 'function') { try { window.__evoOnBoot(); } catch (e) { console.error('[evo] onBoot', e); } }
`

writeFileSync(resolve(OUT, 'proto.css'), css)
writeFileSync(resolve(OUT, 'body.html'), body)
writeFileSync(resolve(OUT, 'engine.js'), script + footer)
console.log(`extracted: css ${css.split('\n').length} / body ${body.split('\n').length} / engine ${(script + footer).split('\n').length} lines -> ${OUT}`)
