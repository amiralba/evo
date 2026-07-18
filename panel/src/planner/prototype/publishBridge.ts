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
}

interface EvoSnapshot {
  visits: ProtoVisit[]
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

  const affected = new Set<string>([...resizeOps.map((o) => o.routeId), ...patchOps.map((o) => o.routeId)])
  if (affected.size === 0) {
    engineToast('Bu değişiklikler henüz backend’e yazılmıyor (sadece takvim düzenleri destekli)')
    return
  }

  for (const op of resizeOps) await planner.updateStop(op.routeId, op.stopId, buildResizeUpdate(op.minutes))
  for (const op of patchOps) await planner.createPatch(op.routeId, op.req)
  for (const routeId of affected) {
    await planner.publishRoute(routeId, { reason: opts.reason ?? null, objective: opts.objective ?? null })
  }

  engineToast(`Backend’e yazıldı ✓ ${resizeOps.length} süre · ${patchOps.length} yama · ${affected.size} rut yayınlandı`)
  await loadBackendIntoPrototype(province)
}
