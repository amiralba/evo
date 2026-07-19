import { describe, expect, it } from 'vitest'
import { computePublishOps, type EvoSnapshot, type EvoState } from './publishBridge'

/**
 * The diff logic translating the prototype's in-memory drags into real backend mutations —
 * the highest data-corruption-risk code in the panel (audit §E.4): a wrong diff silently
 * writes wrong patches/stops to real routes on Yayınla.
 */

type Snap = EvoSnapshot & { weekFrom: string; weekTo: string }

const WEEK_FROM = '2026-07-13' // a Monday
const WEEK_TO = '2026-07-17'

function baseState(): EvoState {
  return {
    visits: [{ id: 'stop1@2026-07-13', storeId: 's1', personId: 'p1', day: 0, start: 540, dur: 30 }],
    stores: [
      { id: 's1', route: 'r1', active: true, stopId: 'stop1', freqNum: 2, weekdayMask: 0 },
      { id: 's2', route: null, active: true },
    ],
    routes: [{ id: 'r1', person: 'p1', code: 'ANK-01', name: 'Rut 1', target: 500, active: true }],
  }
}

function baseSnap(): Snap {
  return {
    visits: [{ id: 'stop1@2026-07-13', storeId: 's1', personId: 'p1', day: 0, start: 540, dur: 30 }],
    storeRoute: { s1: 'r1', s2: null },
    routePerson: { r1: 'p1' },
    routeMeta: { r1: { name: 'Rut 1', target: 500, active: true } },
    storeSchedule: { s1: { stopId: 'stop1', freqNum: 2, weekdayMask: 0 } },
    storeActive: { s1: true, s2: true },
    weekFrom: WEEK_FROM,
    weekTo: WEEK_TO,
  }
}

function ops(state: EvoState, snap: Snap, reason?: string | null) {
  return computePublishOps(state, snap, reason)
}

describe('computePublishOps', () => {
  it('unchanged state produces zero ops', () => {
    const r = ops(baseState(), baseSnap())
    expect(r.resizeOps).toEqual([])
    expect(r.patchOps).toEqual([])
    expect(r.addOps).toEqual([])
    expect(r.removeOps).toEqual([])
    expect(r.statusOps).toEqual([])
    expect(r.reassignOps).toEqual([])
    expect(r.scheduleOps).toEqual([])
    expect(r.metaOps).toEqual([])
    expect(r.newRoutes).toEqual([])
    expect(r.affected.size).toBe(0)
  })

  it('duration change → resizeOps with the stop id split from the visit id', () => {
    const state = baseState()
    state.visits[0].dur = 45
    const r = ops(state, baseSnap())
    expect(r.resizeOps).toEqual([{ routeId: 'r1', stopId: 'stop1', minutes: 45 }])
    expect(r.patchOps).toEqual([])
    expect(r.affected).toEqual(new Set(['r1']))
  })

  it('same-day start change → a TimeShift patch anchored to the visit date', () => {
    const state = baseState()
    state.visits[0].start = 600
    const r = ops(state, baseSnap(), 'trafik')
    expect(r.patchOps).toHaveLength(1)
    const req = r.patchOps[0].req
    expect(r.patchOps[0].routeId).toBe('r1')
    expect(req.type).toBe(5) // PATCH_TYPE_TIME_SHIFT
    expect(req.startsOn).toBe('2026-07-13')
    expect(req.endsOn).toBe(WEEK_TO)
    expect(req.reason).toContain('trafik')
  })

  it('cross-day move → a MoveVisit patch from the old date to the new one', () => {
    const state = baseState()
    state.visits[0].day = 2
    const r = ops(state, baseSnap())
    expect(r.patchOps).toHaveLength(1)
    const req = r.patchOps[0].req
    expect(req.type).toBe(6) // PATCH_TYPE_MOVE_VISIT
    expect(req.startsOn).toBe('2026-07-13')
    expect(req.paramsJson).toContain('2026-07-15')
  })

  it('a visit added in-memory (not in the snapshot) is ignored, not diffed', () => {
    const state = baseState()
    state.visits.push({ id: 'ghost@2026-07-14', storeId: 's1', personId: 'p1', day: 1, start: 540, dur: 30 })
    const r = ops(state, baseSnap())
    expect(r.patchOps).toEqual([])
    expect(r.resizeOps).toEqual([])
  })

  it('pool → route assignment → addOps; the store of a NEW route is excluded (create flow owns it)', () => {
    const state = baseState()
    state.stores[1].route = 'r1'
    const r = ops(state, baseSnap())
    expect(r.addOps).toEqual([{ routeId: 'r1', storeId: 's2' }])

    // same move, but onto a freshly-created (activated draft) route:
    const state2 = baseState()
    state2.routes.push({ id: 'rNew', person: null, code: 'ANK-02', name: 'Yeni', target: 400, active: true })
    state2.stores[1].route = 'rNew'
    const r2 = ops(state2, baseSnap())
    expect(r2.addOps).toEqual([])
    expect(r2.newRoutes.map((x) => x.id)).toEqual(['rNew'])
  })

  it('a draft route is NOT a new route until activated', () => {
    const state = baseState()
    state.routes.push({ id: 'rDraft', person: null, code: 'ANK-03', name: 'Taslak', target: 0, active: true, draft: true })
    const r = ops(state, baseSnap())
    expect(r.newRoutes).toEqual([])
  })

  it('route → pool removal → removeOps using the stop id from the LOAD snapshot', () => {
    const state = baseState()
    state.stores[0].route = null
    state.stores[0].stopId = null // live schedule fields are cleared when a store drops to the pool
    const r = ops(state, baseSnap())
    expect(r.removeOps).toEqual([{ routeId: 'r1', stopId: 'stop1' }])
  })

  it('store deactivate → statusOps and the store’s snapshot route is republished', () => {
    const state = baseState()
    state.stores[0].active = false
    const r = ops(state, baseSnap())
    expect(r.statusOps).toEqual([{ storeId: 's1', active: false }])
    expect(r.affected).toEqual(new Set(['r1']))
  })

  it('a store the snapshot never saw cannot produce a statusOp', () => {
    const state = baseState()
    state.stores.push({ id: 's3', route: null, active: false })
    const r = ops(state, baseSnap())
    expect(r.statusOps).toEqual([])
  })

  it('person change → reassignOps; assigning where there was no one is not a reassign', () => {
    const state = baseState()
    state.routes[0].person = 'p2'
    const r = ops(state, baseSnap())
    expect(r.reassignOps).toEqual([{ routeId: 'r1', merchandiserId: 'p2' }])

    const snap2 = baseSnap()
    snap2.routePerson.r1 = null
    const r2 = ops(state, snap2)
    expect(r2.reassignOps).toEqual([])
  })

  it('visit-days / frequency change → scheduleOps; snapshot-less (freshly added) stores are skipped', () => {
    const state = baseState()
    state.stores[0].weekdayMask = 0b10101
    const r = ops(state, baseSnap())
    expect(r.scheduleOps).toEqual([{ routeId: 'r1', stopId: 'stop1', frequency: 2, weekdayMask: 0b10101 }])

    const state2 = baseState()
    state2.stores.push({ id: 's4', route: 'r1', active: true, stopId: 'stop4', freqNum: 1, weekdayMask: 3 })
    const r2 = ops(state2, baseSnap())
    expect(r2.scheduleOps).toEqual([]) // s4 not in snap.storeSchedule → addOps territory, not a schedule diff
  })

  it('rename / target / deactivate → one metaOps body; target is ₺-scaled ×1000', () => {
    const state = baseState()
    state.routes[0].name = 'Yeni Ad'
    state.routes[0].target = 750
    state.routes[0].active = false
    const r = ops(state, baseSnap())
    expect(r.metaOps).toEqual([{ routeId: 'r1', body: { name: 'Yeni Ad', revenueTarget: 750000, status: 3 } }])
    // meta-only changes republish nothing (updateRoute regenerates server-side)
    expect(r.affected.size).toBe(0)
  })

  it('an unchanged route produces no metaOps body', () => {
    const r = ops(baseState(), baseSnap())
    expect(r.metaOps).toEqual([])
  })
})
