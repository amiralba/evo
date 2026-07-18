import { describe, expect, it } from 'vitest'
import { decideDrop } from './dropDecision'

describe('decideDrop', () => {
  it('a same-day move decides a ready-to-submit TimeShift patch scoped to the current week', () => {
    const decision = decideDrop({
      kind: 'move',
      storeId: 's1',
      storeName: 'Test Mağaza',
      originalStartMin: 9 * 60,
      durationMin: 30,
      deltaPx: 30, // 60 minutes at 0.5px/min (prototype-parity geometry)
      sourceDate: '2026-07-20',
      targetDate: '2026-07-20',
      weekEndsOn: '2026-07-24',
    })

    expect(decision.action).toBe('patch')
    if (decision.action === 'patch') {
      expect(decision.request.type).toBe(5)
      expect(decision.request.storeId).toBe('s1')
      expect(decision.request.startsOn).toBe('2026-07-20')
      expect(decision.request.endsOn).toBe('2026-07-24')
      expect(JSON.parse(decision.request.paramsJson!)).toEqual({ startMinutes: 10 * 60 })
      expect(decision.summary).toBe('Test Mağaza: 09:00 → 10:00')
    }
  })

  it('a cross-day move decides a ready-to-submit MoveVisit patch with correct from/to', () => {
    const decision = decideDrop({
      kind: 'move',
      storeId: 's1',
      storeName: 'Test Mağaza',
      originalStartMin: 9 * 60,
      durationMin: 30,
      deltaPx: 0,
      sourceDate: '2026-07-21',
      targetDate: '2026-07-20',
      weekEndsOn: '2026-07-24',
    })

    expect(decision.action).toBe('patch')
    if (decision.action === 'patch') {
      expect(decision.request.type).toBe(6)
      expect(decision.request.startsOn).toBe('2026-07-20') // min(fromDate, toDate)
      expect(decision.request.endsOn).toBe('2026-07-24')
      expect(JSON.parse(decision.request.paramsJson!)).toMatchObject({ fromDate: '2026-07-21', toDate: '2026-07-20' })
      expect(decision.summary).toBe('Test Mağaza: 2026-07-21 → 2026-07-20')
    }
  })

  it('a resize decides a clamped UpdateStopRequest', () => {
    const decision = decideDrop({
      kind: 'resize',
      storeId: 's1',
      storeName: 'Test Mağaza',
      originalStartMin: 9 * 60,
      durationMin: 30,
      deltaPx: 600, // way more than the 240 clamp
      sourceDate: '2026-07-20',
      targetDate: '2026-07-20',
      weekEndsOn: '2026-07-24',
    })

    expect(decision.action).toBe('resize')
    if (decision.action === 'resize') {
      expect(decision.update.serviceMinutes).toBe(240)
    }
  })

  it('a no-op drag (same day, snaps back to the original start) decides nothing', () => {
    const decision = decideDrop({
      kind: 'move',
      storeId: 's1',
      storeName: 'Test Mağaza',
      originalStartMin: 9 * 60,
      durationMin: 30,
      deltaPx: 1, // less than a 5-min snap step
      sourceDate: '2026-07-20',
      targetDate: '2026-07-20',
      weekEndsOn: '2026-07-24',
    })

    expect(decision.action).toBe('none')
  })
})
