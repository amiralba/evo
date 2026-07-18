import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { upsertStoreLayer, upsertRouteLine } from '../components/map/storeLayer'
import type { components } from '../../api/generated/schema'

type StoreGeoDto = components['schemas']['StoreGeoDto']

/**
 * Drops the React MapLibre map (OpenFreeMap "liberty" OSM streets) into the hosted prototype in
 * place of its SVG mock map (M4). engine.js's renderMap() is patched to delegate to
 * window.__evoRenderMap when present, so this runs on every prototype re-render — reading live
 * engine state (window.__evoState) and repainting store pins, focus emphasis, and the focused
 * route's sequence polyline (reusing the standalone map's storeLayer helpers). Clicking a pin
 * filters the workspace to that store's route (the prototype's route-filter path).
 *
 * Robustness note: inside the freshly-injected prototype DOM the map's 'load' event is unreliable
 * (fires late / container sizes after it), so nothing critical hangs off 'load'. Instead an
 * idempotent apply() — guarded by isStyleLoaded() — is driven from styledata/idle/timeouts and
 * every prototype re-render; it resizes, (re)builds layers, wires clicks once, and fits once.
 */

interface ProtoStore {
  id: string
  name?: string | null
  chain?: string | null
  rev?: number
  lat?: number | null
  lng?: number | null
  catInt?: number | null
  // `route` is the prototype's LIVE membership (assignStore updates it); activeRouteId is only the
  // snapshot from backend load, so it goes stale for stores added/moved in-session. Use `route`.
  route?: string | null
  activeRouteId?: string | null
}
interface ProtoVisit {
  storeId: string
  day: number
  start: number
}
interface EvoState {
  stores: ProtoStore[]
  visits: ProtoVisit[]
  filter: { type: string; id?: string; ids?: Set<string> } | null
  focus: { type: string; id?: string } | null
}
type MapWindow = Window & {
  __evoState?: () => EvoState
  __evoRenderMap?: () => void
  __evoMap?: maplibregl.Map
  __evoFocusStore?: (storeId: string) => void
  toggleRouteFilter?: (routeId: string, additive: boolean) => void
  store?: (id: string) => unknown
  showPopover?: (s: unknown, e: MouseEvent) => void
  hidePopover?: () => void
}

let map: maplibregl.Map | null = null
let wired = false
// Signature of the last camera target ('all' | 'route:<id>' | 'store:<id>') — the camera only
// moves when this changes, so it doesn't fight the user's own pan/zoom.
let lastCam = ''

function fitToCoords(m: maplibregl.Map, coords: [number, number][]): void {
  if (!coords.length) return
  if (coords.length === 1) {
    m.easeTo({ center: coords[0], zoom: Math.max(m.getZoom(), 13.5), duration: 600 })
    return
  }
  const b = new maplibregl.LngLatBounds()
  coords.forEach((c) => b.extend(c))
  if (!b.isEmpty()) m.fitBounds(b, { padding: 80, maxZoom: 14, duration: 600 })
}

function state(): EvoState | null {
  return (window as MapWindow).__evoState?.() ?? null
}

function focusedRouteId(s: EvoState): string | null {
  if (s.filter && s.filter.type === 'routes' && s.filter.ids && s.filter.ids.size === 1) {
    return [...s.filter.ids][0]
  }
  if (s.focus && s.focus.type === 'route' && s.focus.id) return s.focus.id
  return null
}

/** Live route membership — the prototype updates `route`; activeRouteId is only the load snapshot. */
function storeRoute(s: ProtoStore): string | null {
  return s.route ?? s.activeRouteId ?? null
}

function toGeo(stores: ProtoStore[]): StoreGeoDto[] {
  return stores
    .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
    .map((s) => ({
      id: s.id,
      name: s.name ?? '',
      chainName: s.chain ?? null,
      format: 1,
      category: (s.catInt ?? 1) as StoreGeoDto['category'],
      latitude: s.lat as number,
      longitude: s.lng as number,
      activeRouteId: storeRoute(s),
      activeRouteCode: null,
      sixMonthRevenue: (s.rev ?? 0) * 1000,
    }))
}

/** Focused route's visited stops ordered by first-visit (day,start) — the visit sequence. */
function orderedRouteStores(s: EvoState, routeId: string | null): ProtoStore[] {
  if (!routeId) return []
  const earliest = new Map<string, number>()
  for (const v of s.visits) {
    const k = v.day * 10000 + v.start
    if (!earliest.has(v.storeId) || k < earliest.get(v.storeId)!) earliest.set(v.storeId, k)
  }
  return s.stores
    .filter((x) => storeRoute(x) === routeId && typeof x.lng === 'number' && earliest.has(x.id))
    .sort((a, b) => earliest.get(a.id)! - earliest.get(b.id)!)
}

/** Sequence-number labels (1..n) on the focused route's pins — the prototype shows these on the
 * map so the visit order is legible; a symbol layer renders white numbers centered on each pin. */
function upsertSeqLabels(m: maplibregl.Map, ordered: ProtoStore[]): void {
  const data: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: ordered.map((x, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [x.lng as number, x.lat as number] },
      properties: { seq: String(i + 1) },
    })),
  }
  const src = m.getSource('route-seq') as maplibregl.GeoJSONSource | undefined
  if (src) src.setData(data)
  else m.addSource('route-seq', { type: 'geojson', data })
  if (!m.getLayer('route-seq-labels')) {
    m.addLayer({
      id: 'route-seq-labels',
      type: 'symbol',
      source: 'route-seq',
      layout: {
        'text-field': ['get', 'seq'],
        'text-size': 11,
        'text-font': ['Noto Sans Bold'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.55)', 'text-halo-width': 1.4 },
    })
  }
}

/** Idempotent: resize, and once the style is ready build/refresh layers, wire clicks, fit once. */
function apply(): void {
  const m = map
  if (!m) return
  m.resize()
  if (!m.isStyleLoaded()) return
  const s = state()
  if (!s) return
  const geo = toGeo(s.stores)
  if (!geo.length) return

  const fr = focusedRouteId(s)
  const ordered = orderedRouteStores(s, fr)
  upsertStoreLayer(m, geo, fr)
  upsertRouteLine(m, ordered.map((x) => [x.lng as number, x.lat as number]))
  upsertSeqLabels(m, ordered)
  if (m.getLayer('route-sequence-line')) {
    m.setPaintProperty('route-sequence-line', 'line-width', 3)
    m.setPaintProperty('route-sequence-line', 'line-color', '#185FA5')
  }

  // Match the prototype's category-COLORED pins (P teal / V amber / S gray) rather than the shared
  // React layer's blue fill + category ring (whose P/V ring mapping is also swapped vs the design).
  if (m.getLayer('stores-circles')) {
    m.setPaintProperty('stores-circles', 'circle-color', [
      'match',
      ['coalesce', ['get', 'category'], 0],
      1, '#1D9E75', // P — Potansiyel (teal)
      2, '#EF9F27', // V — Değerli (amber)
      3, '#B4B2A9', // S — Servis (gray)
      '#378ADD',
    ])
    m.setPaintProperty('stores-circles', 'circle-stroke-color', '#ffffff')
    m.setPaintProperty('stores-circles', 'circle-stroke-width', 2)
    // Bigger pins so they're actually clickable (the 5px default is a hard target); the focused
    // route's stops are emphasised larger still.
    m.setPaintProperty(
      'stores-circles',
      'circle-radius',
      fr ? ['case', ['==', ['get', 'activeRouteId'], fr], 9, 7] : 7,
    )
  }

  if (!wired && m.getLayer('stores-circles')) {
    wired = true
    // Pin click -> the prototype's store popover card (name / category / revenue / route +
    // "Genişlet →" to expand into the panel). Deferred past this click's bubble so the prototype's
    // document-click "hide popover" handler (which fires for the map canvas, not an SVG circle)
    // doesn't remove it on the very same click.
    m.on('click', 'stores-circles', (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined
      if (!id) return
      const ev = e.originalEvent
      window.setTimeout(() => {
        const w = window as MapWindow
        // `store()` is a const in the engine (not on window); read the prototype store object
        // straight from engine state instead, then hand it to the global showPopover().
        const s = w.__evoState?.().stores.find((x) => x.id === id)
        if (s) w.showPopover?.(s, ev)
      }, 0)
    })
    // Hide the popover only on a USER pan/zoom (which carries originalEvent) — not on the
    // programmatic resize()/easeTo() that apply() runs on idle, which otherwise closed it ~1s later.
    m.on('movestart', (e) => {
      if ((e as { originalEvent?: unknown }).originalEvent) (window as MapWindow).hidePopover?.()
    })
    // Route-line click -> filter the workspace to that route.
    m.on('click', 'route-sequence-line', () => {
      const s = state()
      const fr = s ? focusedRouteId(s) : null
      // the line only exists for the focused route; clicking it toggles the filter off/on
      const anyRoute = s?.stores.find((x) => x.activeRouteId)?.activeRouteId
      const rid = fr ?? anyRoute
      if (rid) (window as MapWindow).toggleRouteFilter?.(rid, false)
    })
    m.on('mouseenter', 'stores-circles', () => {
      m.getCanvas().style.cursor = 'pointer'
    })
    m.on('mouseleave', 'stores-circles', () => {
      m.getCanvas().style.cursor = ''
    })
  }

  // Camera follows focus: a focused store centers on it, a focused route fits its stops (so the
  // route line is actually visible), otherwise the whole province. Only moves when the target
  // changes, so it doesn't override the user panning around.
  const focusStoreId = s.focus && s.focus.type === 'store' ? s.focus.id : null
  const camSig = focusStoreId ? `store:${focusStoreId}` : fr ? `route:${fr}` : 'all'
  if (camSig !== lastCam) {
    lastCam = camSig
    if (focusStoreId) {
      const fs = s.stores.find((x) => x.id === focusStoreId)
      if (fs && typeof fs.lng === 'number' && typeof fs.lat === 'number') {
        m.easeTo({ center: [fs.lng, fs.lat], zoom: Math.max(m.getZoom(), 13.5), duration: 600 })
      }
    } else if (fr) {
      fitToCoords(
        m,
        s.stores.filter((x) => x.activeRouteId === fr && typeof x.lng === 'number').map((x) => [x.lng as number, x.lat as number]),
      )
    } else {
      fitToCoords(m, geo.map((g) => [g.longitude ?? 0, g.latitude ?? 0]))
    }
  }
}

function initMap(): void {
  const wrap = document.getElementById('mapSvgWrap')
  if (!wrap) return
  wrap.style.position = 'relative'
  const svg = document.getElementById('mapSvg')
  if (svg) svg.style.pointerEvents = 'none' // empty SVG must not swallow map clicks
  const tools = wrap.querySelector<HTMLElement>('.map-tools')
  if (tools) tools.style.zIndex = '5'

  let el = document.getElementById('evoMapGl')
  if (!el) {
    el = document.createElement('div')
    el.id = 'evoMapGl'
    el.style.cssText = 'position:absolute;inset:0;z-index:1;'
    wrap.appendChild(el)
  }

  const m = new maplibregl.Map({
    container: el,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [35, 39],
    zoom: 5,
  })
  map = m
  ;(window as MapWindow).__evoMap = m

  new ResizeObserver(() => m.resize()).observe(wrap)
  m.on('load', apply)
  m.on('styledata', apply)
  m.on('idle', apply)
  // Style-load and backend-data-arrival race (idle/styledata can fire before data is loaded, and
  // nothing fires after), so poll apply() until the store layer actually lands, then stop.
  pollUntilApplied()
}

function pollUntilApplied(attempt = 0): void {
  apply()
  if (map && !map.getLayer('stores-circles') && attempt < 40) {
    window.setTimeout(() => pollUntilApplied(attempt + 1), 250)
  }
}

function update(): void {
  if (!map) initMap()
  else apply()
}

export function installMapBridge(): void {
  ;(window as MapWindow).__evoRenderMap = update
}

/** Let the next apply() re-fit — used when the loaded store set changes (province switch). */
export function resetMapFit(): void {
  lastCam = ''
}
