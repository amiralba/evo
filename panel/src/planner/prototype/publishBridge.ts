import * as planner from '../../api/planner'
import { buildTimeShiftPatch, buildMoveVisitPatch, buildResizeUpdate } from '../schedule/patchPayload'
import { loadBackendIntoPrototype } from './backendBridge'
import type { components } from '../../api/generated/schema'

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

interface SchedFields {
  stopId?: string | null
  freqNum?: number | null
  weekdayMask?: number | null
}

interface EvoState {
  visits: ProtoVisit[]
  stores: Array<{ id: string; route: string | null; active?: boolean } & SchedFields>
  routes: Array<{
    id: string
    person: string | null
    code?: string | null
    name?: string | null
    target?: number | null
    active?: boolean
    draft?: boolean
  }>
}

interface RouteMeta {
  name?: string | null
  target?: number | null
  active?: boolean
}

interface EvoSnapshot {
  visits: ProtoVisit[]
  storeRoute: Record<string, string | null>
  routePerson: Record<string, string | null>
  routeMeta: Record<string, RouteMeta>
  storeSchedule: Record<string, { stopId: string } & SchedFields>
  storeActive: Record<string, boolean>
  weekFrom: string | null
  weekTo: string | null
}

interface PublishOpts {
  reason?: string | null
  objective?: string | null
}

export type { ProtoVisit, EvoState, EvoSnapshot, SchedFields, RouteMeta }

export interface PublishOps {
  resizeOps: Array<{ routeId: string; stopId: string; minutes: number }>
  patchOps: Array<{ routeId: string; req: ReturnType<typeof buildTimeShiftPatch> }>
  newRoutes: EvoState['routes']
  addOps: Array<{ routeId: string; storeId: string }>
  removeOps: Array<{ routeId: string; stopId: string }>
  statusOps: Array<{ storeId: string; active: boolean }>
  reassignOps: Array<{ routeId: string; merchandiserId: string }>
  scheduleOps: Array<{ routeId: string; stopId: string; frequency: 1 | 2 | 3; weekdayMask: number }>
  metaOps: Array<{ routeId: string; body: components['schemas']['UpdateRouteRequest'] }>
  /** routes needing a republish (excludes new routes — they publish in the create flow) */
  affected: Set<string>
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

/**
 * The pure diff: current in-memory prototype state vs the snapshot taken at load, translated
 * into backend mutation ops. No I/O, no window — unit-tested in publishBridge.test.ts.
 * `snap.weekFrom`/`weekTo` must be non-null (flush guards before calling).
 */
export function computePublishOps(
  state: EvoState,
  snap: EvoSnapshot & { weekFrom: string; weekTo: string },
  reason?: string | null,
): PublishOps {
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
          ? buildTimeShiftPatch({ storeId: cur.storeId, startsOn: fromDate, endsOn: snap.weekTo, startMinutes: cur.start, reason })
          : buildMoveVisitPatch({ storeId: cur.storeId, fromDate, toDate, endsOn: snap.weekTo, startMinutes: cur.start, reason })
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

  // Remove store (route -> pool, L3): a store that had a route now has none ("Havuza çıkar").
  // Soft-closes its stop (DELETE = EffectiveTo today, no hard delete). The stop id comes from the
  // load snapshot, since the store's live route/stopId are cleared once it drops to the pool.
  const removeOps: Array<{ routeId: string; stopId: string }> = []
  for (const s of state.stores) {
    const prevRoute = snap.storeRoute[s.id] ?? null
    const nowRoute = s.route ?? null
    if (prevRoute && !nowRoute) {
      const sched = snap.storeSchedule[s.id]
      if (sched?.stopId) removeOps.push({ routeId: prevRoute, stopId: sched.stopId })
    }
  }

  // Store activate/deactivate (L1): Store.Active flipped. Membership is kept (its stop stays open);
  // the backend regenerates the plan for the store's routes so its visits drop/return. Republish the
  // store's current route (if any) so the change promotes like every other edit.
  const statusOps: Array<{ storeId: string; active: boolean }> = []
  for (const s of state.stores) {
    const prevActive = snap.storeActive[s.id]
    if (prevActive === undefined) continue
    const nowActive = s.active !== false
    if (nowActive !== prevActive) statusOps.push({ storeId: s.id, active: nowActive })
  }

  // Reassign merchandiser (Kişi değiştir): a route's person changed.
  const reassignOps: Array<{ routeId: string; merchandiserId: string }> = []
  for (const r of state.routes) {
    const prevP = snap.routePerson[r.id] ?? null
    if (r.person && prevP && r.person !== prevP) reassignOps.push({ routeId: r.id, merchandiserId: r.person })
  }

  // Schedule presence (L4): a routed store's visit days changed (Weekly + weekdayMask) or its
  // frequency switched — buffered by scheduleBridge. Only routed stores (stopId) carry a schedule.
  const scheduleOps: Array<{ routeId: string; stopId: string; frequency: 1 | 2 | 3; weekdayMask: number }> = []
  for (const s of state.stores) {
    if (!s.stopId) continue
    const prev = snap.storeSchedule[s.id]
    if (!prev) continue // freshly-added stores aren't in the load snapshot; handled by addOps
    const curFreq = s.freqNum ?? prev.freqNum ?? 2
    const curMask = s.weekdayMask ?? 0
    const prevMask = prev.weekdayMask ?? 0
    const prevFreq = prev.freqNum ?? 2
    const routeId = s.route ?? null
    if (routeId && (curFreq !== prevFreq || curMask !== prevMask)) {
      scheduleOps.push({ routeId, stopId: s.stopId, frequency: curFreq as 1 | 2 | 3, weekdayMask: curMask })
    }
  }

  // Ad / Hedef (rename or revenue target) and Pasifleştir/Aktifleştir (status) — both via updateRoute.
  const metaOps: Array<{ routeId: string; body: components['schemas']['UpdateRouteRequest'] }> = []
  for (const r of state.routes) {
    const prev = snap.routeMeta[r.id]
    if (!prev) continue // new routes are handled by the create flow
    const body: components['schemas']['UpdateRouteRequest'] = {}
    if (r.name != null && r.name !== prev.name) body.name = r.name
    if (r.target != null && r.target !== prev.target) body.revenueTarget = r.target * 1000
    const nowActive = r.active !== false
    if (nowActive !== prev.active) body.status = nowActive ? 2 : 3
    if (Object.keys(body).length) metaOps.push({ routeId: r.id, body })
  }

  const affected = new Set<string>([
    ...resizeOps.map((o) => o.routeId),
    ...patchOps.map((o) => o.routeId),
    ...addOps.map((o) => o.routeId),
    ...reassignOps.map((o) => o.routeId),
    ...scheduleOps.map((o) => o.routeId),
    ...removeOps.map((o) => o.routeId),
    ...statusOps.map((o) => snap.storeRoute[o.storeId]).filter((r): r is string => !!r),
  ])

  return { resizeOps, patchOps, newRoutes, addOps, removeOps, statusOps, reassignOps, scheduleOps, metaOps, affected }
}

async function flush(opts: PublishOpts): Promise<void> {
  const win = window as ProtoWindow
  const state = win.__evoState?.()
  const snap = win.__evoSnapshot
  const province = win.__evoProvince ?? 'Ankara'
  if (!state || !snap || !snap.weekFrom || !snap.weekTo) return

  const { resizeOps, patchOps, newRoutes, addOps, removeOps, statusOps, reassignOps, scheduleOps, metaOps, affected } =
    computePublishOps(state, snap as EvoSnapshot & { weekFrom: string; weekTo: string }, opts.reason)

  if (affected.size === 0 && newRoutes.length === 0 && metaOps.length === 0 && statusOps.length === 0) {
    engineToast('Bu değişiklikler henüz backend’e yazılmıyor (destekli: yeni rut · süre · taşıma · havuzdan ekleme · kişi · ziyaret günleri · ad/hedef · pasifleştir)')
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
  for (const op of statusOps) await planner.updateStoreStatus(op.storeId, op.active)
  for (const op of removeOps) await planner.removeStop(op.routeId, op.stopId)
  for (const op of scheduleOps)
    await planner.updateStop(op.routeId, op.stopId, { frequency: op.frequency, weekdayMask: op.weekdayMask })
  for (const op of metaOps) await planner.updateRoute(op.routeId, op.body)
  for (const routeId of new Set([...affected, ...createdRouteIds])) {
    await planner.publishRoute(routeId, { reason: opts.reason ?? null, objective: opts.objective ?? null })
  }

  engineToast(
    `Backend’e yazıldı ✓ ${createdRouteIds.length} yeni rut · ${resizeOps.length} süre · ${patchOps.length} yama · ${addOps.length} ekleme · ${removeOps.length} çıkarma · ${reassignOps.length} kişi · ${scheduleOps.length} gün · ${statusOps.length} mağaza durumu · ${metaOps.length} ad/hedef·durum`,
  )
  await loadBackendIntoPrototype(province)
}
