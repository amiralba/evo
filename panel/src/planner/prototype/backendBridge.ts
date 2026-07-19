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

// How many weeks off the current planning week the ‹ › nav has moved (0 = current).
let weekOffset = 0

/** The planning week to load: this week's Mon–Fri (or next week's if today is the weekend, since
 * the backend only regenerates the plan from today forward), shifted by `weekOffset` weeks. */
/**
 * HTML-escape backend strings at the bridge boundary (audit §C H1): engine.js interpolates
 * everything into innerHTML with no escaping of its own, so a store/route/person name or note
 * body containing markup would execute in the supervisor's session. Escaping here is the single
 * choke point for all data entering the engine; publishBridge.unesc() inverts it for the few
 * fields that round-trip back into API writes (route name/code). Proper in-engine escaping is
 * part of decision D2b.
 */
export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
}

function planningWeek(): { from: string; to: string } {
  const now = new Date()
  const g = now.getDay()
  const base = g === 0 ? 1 : g === 6 ? 2 : 1 - g // Sun→+1, Sat→+2, Mon–Fri→this Monday
  const mon = new Date(now)
  mon.setDate(now.getDate() + base + weekOffset * 7)
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
    who: esc(n.authorName ?? 'Saha temsilcisi'),
    txt: esc(n.body ?? ''),
    status: n.status === 3 ? 'done' : 'open',
    anchor: n.anchorId ?? null,
  }))

  const personByRouteCode = new Map(merchandisers.filter((m) => m.activeRouteCode).map((m) => [m.activeRouteCode, m.id]))

  const routes = routeItems.map((r, i) => ({
    id: r.id,
    code: esc(r.routeCode ?? ''),
    name: esc(r.name ?? ''),
    person: personByRouteCode.get(r.routeCode ?? undefined) ?? null,
    color: ROUTE_COLORS[i % ROUTE_COLORS.length],
    target: Math.round((r.revenueTarget ?? 0) / 1000),
    active: r.status === ROUTE_STATUS_ACTIVE,
  }))
  const personByRouteId = new Map(routes.map((r) => [r.id, r.person]))

  // Per-stop schedule fields (stop id + frequency + weekday mask) for the L4 schedule-days editor.
  const routeStops = await Promise.all(
    routes.filter((r) => r.active && r.id).map((r) => planner.getRoute(r.id!).then((d) => d.stops ?? []).catch(() => [])),
  )
  const stopByStore = new Map<string, { stopId: string; freqNum: number; weekdayMask: number }>()
  for (const stops of routeStops) {
    for (const st of stops) {
      if (st.storeId && st.id) {
        stopByStore.set(st.storeId, { stopId: st.id, freqNum: (st.frequency as number) ?? 2, weekdayMask: st.weekdayMask ?? 0 })
      }
    }
  }

  // Inject the merchandisers the panel needs: those on a route in THIS province (calendar rows +
  // detail) plus every UNASSIGNED one (activeRouteCode null) as candidates for the reassign/new-
  // route pickers. Exclude merchandisers tied to other provinces' routes (can't be picked here).
  // The engine's visiblePeople() is patched (see extractor) to only put ROUTED people on the
  // calendar, so the unassigned candidates don't become empty rows.
  const loadedRouteCodes = new Set(routeItems.map((r) => r.routeCode).filter(Boolean))
  const people = merchandisers
    .filter((m) => m.active && (!m.activeRouteCode || loadedRouteCodes.has(m.activeRouteCode)))
    .map((m) => ({ id: m.id, name: esc((m.name ?? '').trim()), active: !!m.active, activeRouteCode: m.activeRouteCode ?? null }))

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
    name: esc(s.name ?? ''),
    chain: esc(s.chainName ?? '—'),
    format: FORMAT[s.format ?? 2] ?? 'M',
    cat: CATEGORY[(s.category as number) ?? 1] ?? 'S',
    rev: Math.round((s.sixMonthRevenue ?? 0) / 1000),
    x: PAD + ((( s.longitude ?? minLng) - minLng) / spanLng) * (W - 2 * PAD),
    y: PAD + ((maxLat - (s.latitude ?? maxLat)) / spanLat) * (H - 2 * PAD),
    route: s.activeRouteId ?? null,
    active: (s as { active?: boolean }).active !== false,
    // Extra fields (ignored by the prototype) for the MapLibre controller:
    lat: s.latitude ?? null,
    lng: s.longitude ?? null,
    catInt: (s.category as number) ?? null,
    activeRouteId: s.activeRouteId ?? null,
    // L4 schedule fields (routed stores): backend RouteStop id/frequency/weekday-mask.
    stopId: (s.id ? stopByStore.get(s.id)?.stopId : null) ?? null,
    freqNum: (s.id ? stopByStore.get(s.id)?.freqNum : null) ?? null,
    weekdayMask: (s.id ? stopByStore.get(s.id)?.weekdayMask : null) ?? null,
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
  ;(win as unknown as { __evoProvince?: string; __evoCityPrefix?: () => string }).__evoProvince = province
  ;(win as unknown as { __evoCityPrefix?: () => string }).__evoCityPrefix = () => cityPrefix(province)

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

// prettier-ignore
const PROVINCES = [
  'Adana','Adıyaman','Afyonkarahisar','Ağrı','Aksaray','Amasya','Ankara','Antalya','Ardahan','Artvin',
  'Aydın','Balıkesir','Bartın','Batman','Bayburt','Bilecik','Bingöl','Bitlis','Bolu','Burdur','Bursa',
  'Çanakkale','Çankırı','Çorum','Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum',
  'Eskişehir','Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Iğdır','Isparta','İstanbul','İzmir',
  'Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kırıkkale','Kırklareli','Kırşehir',
  'Kilis','Kocaeli','Konya','Kütahya','Malatya','Manisa','Mardin','Mersin','Muğla','Muş','Nevşehir',
  'Niğde','Ordu','Osmaniye','Rize','Sakarya','Samsun','Siirt','Sinop','Sivas','Şanlıurfa','Şırnak',
  'Tekirdağ','Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak',
]

function trLower(s: string): string {
  return s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
}

/** 3-letter route-code prefix for a province (Ankara→ANK, İstanbul→IST, İzmir→IZM), Turkish
 * letters normalised to ASCII. Exposed as window.__evoCityPrefix for the "Yeni rut" modal. */
function cityPrefix(province: string): string {
  const ascii = province
    .replace(/[İIı]/g, 'I')
    .replace(/[şŞ]/g, 'S')
    .replace(/[ğĞ]/g, 'G')
    .replace(/[üÜ]/g, 'U')
    .replace(/[öÖ]/g, 'O')
    .replace(/[çÇ]/g, 'C')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  return ascii.slice(0, 3) || 'RUT'
}

/** Turn the prototype's region button into a searchable province dropdown; picking one reloads
 * backend data and refits the MapLibre map to that province's stores. */
export function installProvinceControl(): void {
  const btn = document.getElementById('evoRegionBtn')
  if (!btn || btn.dataset.evoRegionWired) return // guard against StrictMode/remount double-install
  btn.dataset.evoRegionWired = '1'

  let dd: HTMLDivElement | null = null
  const onDoc = (e: MouseEvent) => {
    if (dd && !dd.contains(e.target as Node) && e.target !== btn) close()
  }
  function close() {
    dd?.remove()
    dd = null
    document.removeEventListener('click', onDoc)
  }
  function pick(province: string) {
    if (btn) btn.textContent = `${province} ▾`
    close()
    weekOffset = 0 // switching region returns to the current week
    resetMapFit()
    void loadBackendIntoPrototype(province).catch((e) => console.error('[evo] province switch', e))
  }
  function open() {
    if (!btn) return
    close()
    const r = btn.getBoundingClientRect()
    dd = document.createElement('div')
    dd.style.cssText =
      `position:fixed;top:${r.bottom + 4}px;left:${r.left}px;z-index:100;width:210px;max-height:340px;` +
      'display:flex;flex-direction:column;overflow:hidden;background:var(--card);border:1px solid var(--border2);' +
      'border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.15);'
    const search = document.createElement('input')
    search.type = 'text'
    search.placeholder = 'Şehir ara…'
    search.style.cssText =
      'margin:6px;padding:6px 8px;border:1px solid var(--border2);border-radius:5px;font-size:12px;background:var(--card);color:var(--tx);'
    const list = document.createElement('div')
    list.style.cssText = 'overflow-y:auto;flex:1;'
    dd.append(search, list)
    document.body.appendChild(dd)

    const render = (q: string) => {
      const filtered = PROVINCES.filter((p) => trLower(p).includes(trLower(q)))
      list.innerHTML = filtered.length
        ? filtered
            .map((p) => `<div data-p="${p}" style="padding:6px 10px;cursor:pointer;font-size:12px;color:var(--tx);">${p}</div>`)
            .join('')
        : '<div style="padding:8px 10px;color:var(--tx3);font-size:11px;">Bulunamadı</div>'
      list.querySelectorAll<HTMLElement>('[data-p]').forEach((el) => {
        el.onmouseenter = () => (el.style.background = 'var(--blue-l)')
        el.onmouseleave = () => (el.style.background = '')
        el.onclick = () => pick(el.dataset.p as string)
      })
    }
    render('')
    search.oninput = () => render(search.value)
    search.focus()
    setTimeout(() => document.addEventListener('click', onDoc), 0)
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (dd) close()
    else open()
  })
}

/** Wire the prototype's ‹ › week arrows to refetch the backend plan for the adjacent week
 * (the prototype's own setWeek only re-projects the in-memory baseline locally). */
export function installWeekNav(): void {
  const province = () => (window as unknown as { __evoProvince?: string }).__evoProvince ?? 'Ankara'
  const go = (delta: number) => {
    weekOffset += delta
    void loadBackendIntoPrototype(province()).catch((e) => console.error('[evo] week nav', e))
  }
  const prev = document.getElementById('wkPrev')
  const next = document.getElementById('wkNext')
  if (prev) prev.onclick = () => go(-1) // replaces the engine's local setWeek handler
  if (next) next.onclick = () => go(1)
}
