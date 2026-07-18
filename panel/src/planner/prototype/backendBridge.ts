import * as planner from '../../api/planner'
import { resetMapFit } from './prototypeMap'

/**
 * Fetches real backend data and pushes it into the hosted prototype via window.__evoLoadData
 * (defined in engine.js's host-bridge footer). This replaces the prototype's mock seed arrays
 * with live routes/stores/merchandisers/plan — WITHOUT changing the prototype's behavior: it
 * still buffers every edit into changes[] and only commits on Yayınla (wired separately).
 */

// Backend enums → prototype's string/letter vocab.
const FORMAT: Record<number, string> = { 1: 'Jet', 2: 'M', 3: 'MM', 4: '3M', 5: '4M', 6: '5M' }
const CATEGORY: Record<number, 'P' | 'V' | 'S'> = { 1: 'P', 2: 'V', 3: 'S' }
// Prototype assigns each route a line color; backend has none, so pick deterministically by index.
const ROUTE_COLORS = ['#185FA5', '#0F6E56', '#854F0B', '#A32D2D', '#993C1D', '#4B3F8F', '#1D9E75', '#EF9F27']
const ROUTE_STATUS_ACTIVE = 2

interface ProtoWindow extends Window {
  __evoLoadData?: (d: unknown) => void
}

function minutesOfDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** Backend plan dates are Mon–Fri; map to the prototype's day index 0..4 (Mon=0). */
function weekdayIndex(dateIso: string): number {
  const g = new Date(dateIso + 'T00:00:00').getDay() // 0 Sun .. 6 Sat
  return Math.min(4, Math.max(0, g - 1))
}

/** The planning week to load: this week's Mon–Fri, or next week's if today is the weekend
 * (the backend only regenerates the plan from today forward). */
function planningWeek(): { from: string; to: string } {
  const now = new Date()
  const g = now.getDay()
  const offset = g === 0 ? 1 : g === 6 ? 2 : 1 - g // Sun→+1, Sat→+2, Mon–Fri→this Monday
  const mon = new Date(now)
  mon.setDate(now.getDate() + offset)
  mon.setHours(0, 0, 0, 0)
  const fri = new Date(mon)
  fri.setDate(mon.getDate() + 4)
  // Format from LOCAL date parts — toISOString() converts to UTC and shifts the day west of
  // GMT, which mislabels the week and can drop Friday from the fetch window.
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: iso(mon), to: iso(fri) }
}

export async function loadBackendIntoPrototype(province = 'Ankara'): Promise<void> {
  const win = window as ProtoWindow
  if (typeof win.__evoLoadData !== 'function') return

  const week = planningWeek()
  const [routesRes, merchandisers, geo, notesRaw] = await Promise.all([
    planner.listRoutes(province),
    planner.getMerchandisers(),
    planner.getStoresGeo(province),
    planner.getNotes({}).catch(() => []),
  ])
  const routeItems = routesRes.items ?? []

  // Real field notes for the inbox (💬 Saha), mapped to the prototype's inbox-item shape.
  // NoteStatus 3 = resolved -> done; NoteKind 1 = request, 2 = note.
  const notes = notesRaw.map((n) => ({
    id: n.id,
    type: n.kind === 1 ? '📋 Talep' : '💬 Not',
    who: n.authorName ?? 'Saha temsilcisi',
    txt: n.body ?? '',
    status: n.status === 3 ? 'done' : 'open',
    anchor: n.anchorId ?? null,
  }))

  const personByRouteCode = new Map(merchandisers.filter((m) => m.activeRouteCode).map((m) => [m.activeRouteCode, m.id]))

  const routes = routeItems.map((r, i) => ({
    id: r.id,
    code: r.routeCode,
    name: r.name,
    person: personByRouteCode.get(r.routeCode ?? undefined) ?? null,
    color: ROUTE_COLORS[i % ROUTE_COLORS.length],
    target: Math.round((r.revenueTarget ?? 0) / 1000),
    active: r.status === ROUTE_STATUS_ACTIVE,
  }))
  const personByRouteId = new Map(routes.map((r) => [r.id, r.person]))

  // The prototype's calendar renders one row per entry in `people` (visiblePeople() returns them
  // all when unfiltered), so inject ONLY the merchandisers assigned to a loaded route — otherwise
  // the whole merchandiser roster (~100) becomes ~100 empty calendar rows. Candidate lists for the
  // reassign/new-route pickers are wired separately.
  const routedPersonIds = new Set(routes.map((r) => r.person).filter((id): id is string => Boolean(id)))
  const routedById = new Map(merchandisers.map((m) => [m.id, m]))
  const people = [...routedPersonIds].map((id) => {
    const m = routedById.get(id)
    return { id, name: (m?.name ?? '').trim(), active: m?.active ?? true, activeRouteCode: m?.activeRouteCode ?? null }
  })

  // Project real lat/lng into the prototype's 600×520 SVG box (temporary — the SVG map is
  // replaced by the React MapLibre map in a later step; until then this keeps the map plausible).
  const lats = geo.map((s) => s.latitude ?? 0)
  const lngs = geo.map((s) => s.longitude ?? 0)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const spanLat = maxLat - minLat || 1
  const spanLng = maxLng - minLng || 1
  const PAD = 40
  const W = 600
  const H = 520
  const stores = geo.map((s) => ({
    id: s.id,
    name: s.name,
    chain: s.chainName ?? '—',
    format: FORMAT[s.format ?? 2] ?? 'M',
    cat: CATEGORY[(s.category as number) ?? 1] ?? 'S',
    rev: Math.round((s.sixMonthRevenue ?? 0) / 1000),
    x: PAD + ((( s.longitude ?? minLng) - minLng) / spanLng) * (W - 2 * PAD),
    y: PAD + ((maxLat - (s.latitude ?? maxLat)) / spanLat) * (H - 2 * PAD),
    route: s.activeRouteId ?? null,
    active: true,
    // Extra fields (ignored by the prototype) for the MapLibre controller:
    lat: s.latitude ?? null,
    lng: s.longitude ?? null,
    catInt: (s.category as number) ?? null,
    activeRouteId: s.activeRouteId ?? null,
  }))

  const plans = await Promise.all(
    routes
      .filter((r) => r.active && r.id)
      .map((r) =>
        planner
          .getPlan(r.id!, week.from, week.to)
          .then((days) => ({ routeId: r.id!, days }))
          .catch(() => ({ routeId: r.id!, days: [] })),
      ),
  )

  const visits: Array<Record<string, unknown>> = []
  for (const { routeId, days } of plans) {
    const personId = personByRouteId.get(routeId) ?? null
    for (const day of days) {
      if (!day.date) continue
      const di = weekdayIndex(day.date)
      for (const v of day.visits ?? []) {
        if (!v.start || !v.end || !v.storeId) continue
        const dur = Math.round((new Date(v.end).getTime() - new Date(v.start).getTime()) / 60_000)
        visits.push({
          id: `${v.routeStopId ?? v.storeId}@${day.date}`,
          storeId: v.storeId,
          personId,
          day: di,
          start: minutesOfDay(v.start),
          dur,
          patched: v.source === 2,
        })
      }
    }
  }

  // Remember what the publish bridge needs: which province/week to re-load and diff against.
  ;(win as unknown as { __evoProvince?: string }).__evoProvince = province

  win.__evoLoadData({
    people,
    routes,
    stores,
    visits,
    notes,
    weekFrom: week.from,
    weekTo: week.to,
    weekLabel: `${week.from.slice(5).replace('-', '/')} – ${week.to.slice(5).replace('-', '/')}`,
  })
}

const PROVINCES = ['Ankara', 'İstanbul', 'İzmir', 'Bursa', 'Adana']

/** Wire the prototype's region button (a static mock) to cycle provinces and reload backend data,
 * refitting the map to the new province's stores. */
export function installProvinceControl(): void {
  const btn = document.getElementById('evoRegionBtn')
  if (!btn) return
  let idx = 0
  btn.addEventListener('click', () => {
    idx = (idx + 1) % PROVINCES.length
    const province = PROVINCES[idx]
    btn.textContent = `${province} ▾`
    resetMapFit()
    void loadBackendIntoPrototype(province).catch((e) => console.error('[evo] province switch', e))
  })
}
