import { useEffect, useRef } from 'react'
import { loadBackendIntoPrototype, installProvinceControl, installWeekNav } from './backendBridge'
import { installPublishBridge } from './publishBridge'
import { installMapBridge } from './prototypeMap'
import { installTasksBridge } from './tasksBridge'

/**
 * Hosts the v0.5 planner prototype VERBATIM inside the React panel.
 *
 * The prototype (evo-planner-prototype-v0.5.html) is sliced at build-support time into three
 * static assets under panel/public/evo-prototype/ (see scripts/extract-prototype.mjs):
 *   - proto.css   the <style> block (body{} retargeted to .evo-proto-root)
 *   - body.html   the <body> markup (topbar / main / pages / drawer / statusbar)
 *   - engine.js   the <script> block, loaded as a CLASSIC script so its top-level function
 *                 declarations stay global and the prototype's inline onclick="foo()" handlers
 *                 keep resolving — identical semantics to the original inline <script>.
 *
 * We keep the prototype's DOM subtree in a module-level node that is created once, attached to
 * the document before the engine loads (so renderAll() can find #mapPane etc.), and merely
 * re-parented in/out of this component on route mount/unmount. That means the engine boots a
 * single time and every one-time binding it makes (e.g. $('#undoBtn').onclick=…) survives SPA
 * navigation — no re-injection, no const-redeclaration, no stale refs.
 *
 * Draft-until-publish is inherent: the prototype buffers every edit into its own `changes[]`
 * and only commits on Yayınla. The backend bridge (data-in + publish-out) is wired separately
 * via window.__evoOnBoot / window hooks; this component only handles hosting + lifecycle.
 */

let protoRoot: HTMLDivElement | null = null
let bootPromise: Promise<void> | null = null
let revealed = false

/** The engine paints its MOCK seed data the instant it boots, then the backend load replaces it —
 * a visible flash on every refresh. So the prototype root starts hidden and is revealed only once
 * the first backend load has finished (or failed); the host div shows a plain loading bg until then. */
function reveal(): void {
  revealed = true
  if (protoRoot) protoRoot.style.opacity = '1'
}

async function bootOnce(host: HTMLElement): Promise<void> {
  const root = document.createElement('div')
  root.className = 'evo-proto-root'
  root.style.opacity = revealed ? '1' : '0'
  root.style.transition = 'opacity .18s ease'
  root.innerHTML = await fetch('/evo-prototype/body.html').then((r) => r.text())
  host.appendChild(root)
  protoRoot = root
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.id = 'evo-engine-script'
    s.src = '/evo-prototype/engine.js'
    // async=false preserves execution ordering; the markup is already in the DOM above.
    s.async = false
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('evo engine failed to load'))
    document.body.appendChild(s)
  })
}

function ensureBooted(host: HTMLElement): Promise<void> {
  if (!bootPromise) bootPromise = bootOnce(host)
  // On any (re)mount, re-parent the persistent prototype node into the current host.
  return bootPromise.then(() => {
    if (protoRoot && protoRoot.parentElement !== host) host.appendChild(protoRoot)
  })
}

function ensureCss(): void {
  if (!document.getElementById('evo-proto-css')) {
    const link = document.createElement('link')
    link.id = 'evo-proto-css'
    link.rel = 'stylesheet'
    link.href = '/evo-prototype/proto.css'
    document.head.appendChild(link)
  }
}

export function PrototypeHost() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    ensureCss()
    installPublishBridge()
    installMapBridge()
    installTasksBridge()
    void ensureBooted(host)
      .then(() => {
        // Replace the prototype's mock seeds with live backend data once the engine is up.
        installProvinceControl()
        installWeekNav()
        return loadBackendIntoPrototype('Ankara')
      })
      .catch((e) => console.error('[evo] backend load', e))
      .finally(reveal) // reveal only after real data is in (or on failure, so we never hang hidden)

    return () => {
      // Detach the prototype node (keep the module-level reference so it re-attaches intact
      // on remount) and drop the global reset stylesheet so other routes aren't restyled.
      if (protoRoot && protoRoot.parentElement) protoRoot.parentElement.removeChild(protoRoot)
      document.getElementById('evo-proto-css')?.remove()
    }
  }, [])

  return (
    <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#FAFAF7' }}>
      {/* Sits behind the prototype root; shows only while it's hidden (during first load). */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#98968D',
          font: "13px -apple-system,'Segoe UI',Roboto,sans-serif",
        }}
      >
        Yükleniyor…
      </div>
    </div>
  )
}
