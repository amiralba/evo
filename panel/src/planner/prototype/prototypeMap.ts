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
  toggleRouteFilter?: (routeId: string, additive: boolean) => void
}

let map: maplibregl.Map | null = null
let wired = false
let fitted = false

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
      activeRouteId: s.activeRouteId ?? null,
      activeRouteCode: null,
      sixMonthRevenue: (s.rev ?? 0) * 1000,
    }))
}

/** Focused route's stops ordered by first-visit (day,start) → [lng,lat] pairs for the polyline. */
function routeCoords(s: EvoState, routeId: string | null): [number, number][] {
  if (!routeId) return []
  const earliest = new Map<string, number>()
  for (const v of s.visits) {
    const k = v.day * 10000 + v.start
    if (!earliest.has(v.storeId) || k < earliest.get(v.storeId)!) earliest.set(v.storeId, k)
  }
  return s.stores
    .filter((x) => x.activeRouteId === routeId && typeof x.lng === 'number' && earliest.has(x.id))
    .sort((a, b) => earliest.get(a.id)! - earliest.get(b.id)!)
    .map((x) => [x.lng as number, x.lat as number])
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
  upsertStoreLayer(m, geo, fr)
  upsertRouteLine(m, routeCoords(s, fr))

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
  }

  if (!wired && m.getLayer('stores-circles')) {
    wired = true
    m.on('click', 'stores-circles', (e) => {
      const rid = e.features?.[0]?.properties?.activeRouteId as string | undefined
      if (rid) (window as MapWindow).toggleRouteFilter?.(rid, false)
    })
    m.on('mouseenter', 'stores-circles', () => {
      m.getCanvas().style.cursor = 'pointer'
    })
    m.on('mouseleave', 'stores-circles', () => {
      m.getCanvas().style.cursor = ''
    })
  }

  if (!fitted) {
    fitted = true
    const bounds = new maplibregl.LngLatBounds()
    geo.forEach((g) => bounds.extend([g.longitude ?? 0, g.latitude ?? 0]))
    if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 })
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

/** Let the next apply() refit — used when the loaded store set changes (province switch). */
export function resetMapFit(): void {
  fitted = false
}
