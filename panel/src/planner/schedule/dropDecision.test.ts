import { describe, expect, it } from 'vitest'
import { decideDrop } from './dropDecision'

describe('decideDrop', () => {
  it('a same-day move decides a TimeShift patch prefill', () => {
    const decision = decideDrop({
      kind: 'move',
      storeId: 's1',
      originalStartMin: 9 * 60,
      durationMin: 30,
      deltaPx: 30, // 60 minutes at 0.5px/min (prototype-parity geometry)
      sourceDate: '2026-07-20',
      targetDate: '2026-07-20',
    })

    expect(decision.action).toBe('patch')
    if (decision.action === 'patch') {
      expect(decision.prefill.type).toBe(5)
      expect(decision.prefill.startMinutes).toBe(10 * 60)
      expect(decision.prefill.startsOn).toBe('2026-07-20')
    }
  })

  it('a cross-day move decides a MoveVisit patch prefill with correct from/to', () => {
    const decision = decideDrop({
      kind: 'move',
      storeId: 's1',
      originalStartMin: 9 * 60,
      durationMin: 30,
      deltaPx: 0,
      sourceDate: '2026-07-21',
      targetDate: '2026-07-20',
    })

    expect(decision.action).toBe('patch')
    if (decision.action === 'patch') {
      expect(decision.prefill.type).toBe(6)
      expect(decision.prefill.fromDate).toBe('2026-07-21')
      expect(decision.prefill.toDate).toBe('2026-07-20')
      expect(decision.prefill.startsOn).toBe('2026-07-20') // min(fromDate, toDate)
    }
  })

  it('a resize decides a clamped UpdateStopRequest', () => {
    const decision = decideDrop({
      kind: 'resize',
      storeId: 's1',
      originalStartMin: 9 * 60,
      durationMin: 30,
      deltaPx: 600, // way more than the 240 clamp
      sourceDate: '2026-07-20',
      targetDate: '2026-07-20',
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
      originalStartMin: 9 * 60,
      durationMin: 30,
      deltaPx: 1, // less than a 5-min snap step
      sourceDate: '2026-07-20',
      targetDate: '2026-07-20',
    })

    expect(decision.action).toBe('none')
  })
})
