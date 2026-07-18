import * as planner from '../../api/planner'
import { buildTimeShiftPatch, buildMoveVisitPatch, buildResizeUpdate } from '../schedule/patchPayload'
import { loadBackendIntoPrototype } from './backendBridge'

/**
 * The backend write-path for the hosted prototype (M3). Draft-until-publish: the prototype
 * buffers every edit locally into changes[] and touches NOTHING on the server. When the planner
 * confirms Yayınla, engine.js calls window.__evoPublish(...) (spliced into confirmPub by the
 * extractor) — and only THEN do we diff the current in-memory plan against the snapshot taken at
 * load and translate the differences into backend mutations, then publish the affected routes.
 *
 * Covered edits: block resize (duration) -> UpdateStop; block move (day/time) -> TimeShift /
 * MoveVisit patch. Other edit kinds (reassign person, add/remove store, task-duration rules)
 * still buffer locally and are reported as not-yet-persisted — wired in follow-up steps.
 */

interface ProtoVisit {
  id: string
  storeId: string
  personId: string | null
  day: number
  start: number
  dur: number
  patched?: boolean
}

interface EvoState {
  visits: ProtoVisit[]
  stores: Array<{ id: string; route: string | null }>
  routes: Array<{
    id: string
    person: string | null
    code?: string | null
    name?: string | null
    target?: number | null
    draft?: boolean
  }>
}

interface EvoSnapshot {
  visits: ProtoVisit[]
  storeRoute: Record<string, string | null>
  routePerson: Record<string, string | null>
  weekFrom: string | null
  weekTo: string | null
}

interface PublishOpts {
  reason?: string | null
  objective?: string | null
}

type ProtoWindow = Window & {
  __evoState?: () => EvoState
  __evoSnapshot?: EvoSnapshot
  __evoProvince?: string
  __evoPublish?: (opts: PublishOpts) => void
  toast?: (message: string, buttons?: unknown[]) => void
}

function dateForDay(weekFrom: string, dayIndex: number): string {
  const d = new Date(weekFrom + 'T00:00:00')
  d.setDate(d.getDate() + dayIndex)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The prototype's global toast (engine.js) — a function declaration, so it lives on window. */
function engineToast(msg: string): void {
  ;(window as ProtoWindow).toast?.(msg, [])
}

export function installPublishBridge(): void {
  const win = window as ProtoWindow

  win.__evoPublish = (opts: PublishOpts) => {
    void flush(opts).catch((e) => {
      console.error('[evo] publish flush', e)
      engineToast('Yayın backend hatası — konsolu kontrol edin')
    })
  }
}

async function flush(opts: PublishOpts): Promise<void> {
  const win = window as ProtoWindow
  const state = win.__evoState?.()
  const snap = win.__evoSnapshot
  const province = win.__evoProvince ?? 'Ankara'
  if (!state || !snap || !snap.weekFrom || !snap.weekTo) return

  const routeByStore = new Map(state.stores.map((s) => [s.id, s.route]))
  const snapById = new Map(snap.visits.map((v) => [v.id, v]))

  const resizeOps: Array<{ routeId: string; stopId: string; minutes: number }> = []
  const patchOps: Array<{ routeId: string; req: ReturnType<typeof buildTimeShiftPatch> }> = []

  for (const cur of state.visits) {
    const prev = snapById.get(cur.id)
    if (!prev) continue // added visit — not persisted in M3
    const routeId = routeByStore.get(cur.storeId)
    if (!routeId) continue
    const stopId = String(cur.id).split('@')[0]

    if (cur.dur !== prev.dur) {
      resizeOps.push({ routeId, stopId, minutes: cur.dur })
    }
    if (cur.day !== prev.day || cur.start !== prev.start) {
      const fromDate = dateForDay(snap.weekFrom, prev.day)
      const toDate = dateForDay(snap.weekFrom, cur.day)
      const req =
        cur.day === prev.day
          ? buildTimeShiftPatch({ storeId: cur.storeId, startsOn: fromDate, endsOn: snap.weekTo, startMinutes: cur.start, reason: opts.reason })
          : buildMoveVisitPatch({ storeId: cur.storeId, fromDate, toDate, endsOn: snap.weekTo, startMinutes: cur.start, reason: opts.reason })
      patchOps.push({ routeId, req })
    }
  }

  // New routes: an activated draft (+ Yeni rut → Aktifleştir) — a route not in the load snapshot
  // and no longer flagged draft. Created below via createRoute, then its stores/person attached.
  const snapRouteIds = new Set(Object.keys(snap.routePerson))
  const newRoutes = state.routes.filter((r) => !snapRouteIds.has(r.id) && !r.draft)
  const newRouteIds = new Set(newRoutes.map((r) => r.id))

  // Add store (pool -> route): a store that had no route now belongs to one. Skip stores that
  // belong to a NEW route (their add happens in the create-route flow). Route->route moves and
  // route->pool removals need a stop id / remove endpoint and are left for a follow-up.
  const addOps: Array<{ routeId: string; storeId: string }> = []
  for (const s of state.stores) {
    const prevRoute = snap.storeRoute[s.id] ?? null
    const nowRoute = s.route ?? null
    if (!prevRoute && nowRoute && !newRouteIds.has(nowRoute)) addOps.push({ routeId: nowRoute, storeId: s.id })
  }

  // Reassign merchandiser (Kişi değiştir): a route's person changed.
  const reassignOps: Array<{ routeId: string; merchandiserId: string }> = []
  for (const r of state.routes) {
    const prevP = snap.routePerson[r.id] ?? null
    if (r.person && prevP && r.person !== prevP) reassignOps.push({ routeId: r.id, merchandiserId: r.person })
  }

  const affected = new Set<string>([
    ...resizeOps.map((o) => o.routeId),
    ...patchOps.map((o) => o.routeId),
    ...addOps.map((o) => o.routeId),
    ...reassignOps.map((o) => o.routeId),
  ])
  if (affected.size === 0 && newRoutes.length === 0) {
    engineToast('Bu değişiklikler henüz backend’e yazılmıyor (destekli: yeni rut · süre · taşıma · havuzdan ekleme · kişi)')
    return
  }

  const today = dateForDay(snap.weekFrom, 0) // Monday of the loaded week — a safe start date

  // Create the new routes first (createRoute -> add its stores -> assign its person), so their
  // real ids exist before anything else that references a route. The prototype's revenue target
  // is in thousands of ₺; the backend wants raw ₺.
  const createdRouteIds: string[] = []
  for (const nr of newRoutes) {
    const storeIds = state.stores.filter((s) => s.route === nr.id).map((s) => s.id)
    if (!storeIds.length) continue
    const created = await planner.createRoute({
      name: nr.name ?? nr.code ?? 'Yeni rut',
      province,
      routeCode: nr.code ?? undefined,
      revenueTarget: (nr.target ?? 0) * 1000,
    })
    if (!created.id) continue
    await planner.bulkAddStops(created.id, { storeIds, frequency: 1, weekdayMask: 0, serviceMinutes: null })
    if (nr.person) await planner.reassignRoute(created.id, { merchandiserId: nr.person, startDate: today, reason: 1 })
    // createRoute makes a Draft route; activate it (Draft -> Active) so its plan is generated and it
    // shows in the rail/map/calendar (the bridge only loads Active routes).
    await planner.updateRoute(created.id, { status: 2 })
    createdRouteIds.push(created.id)
  }

  for (const op of resizeOps) await planner.updateStop(op.routeId, op.stopId, buildResizeUpdate(op.minutes))
  for (const op of patchOps) await planner.createPatch(op.routeId, op.req)
  for (const op of addOps)
    await planner.bulkAddStops(op.routeId, { storeIds: [op.storeId], frequency: 2, weekdayMask: 0, serviceMinutes: null })
  for (const op of reassignOps)
    await planner.reassignRoute(op.routeId, { merchandiserId: op.merchandiserId, startDate: today, reason: 1 })
  for (const routeId of new Set([...affected, ...createdRouteIds])) {
    await planner.publishRoute(routeId, { reason: opts.reason ?? null, objective: opts.objective ?? null })
  }

  engineToast(
    `Backend’e yazıldı ✓ ${createdRouteIds.length} yeni rut · ${resizeOps.length} süre · ${patchOps.length} yama · ${addOps.length} ekleme · ${reassignOps.length} kişi`,
  )
  await loadBackendIntoPrototype(province)
}
