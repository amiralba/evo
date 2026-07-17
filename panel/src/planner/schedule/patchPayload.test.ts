import { describe, expect, it } from 'vitest'
import { buildTimeShiftPatch, buildMoveVisitPatch, buildResizeUpdate } from './patchPayload'

describe('patchPayload', () => {
  it('buildTimeShiftPatch emits type 5 with parseable params', () => {
    const req = buildTimeShiftPatch({ storeId: 's1', startsOn: '2026-07-20', endsOn: '2026-07-20', startMinutes: 600 })

    expect(req.type).toBe(5)
    expect(req.storeId).toBe('s1')
    expect(JSON.parse(req.paramsJson!)).toEqual({ startMinutes: 600 })
  })

  it('buildMoveVisitPatch emits type 6 with the exact params and startsOn = min(fromDate,toDate)', () => {
    const req = buildMoveVisitPatch({ storeId: 's1', fromDate: '2026-07-21', toDate: '2026-07-20', endsOn: '2026-07-25', startMinutes: 540 })

    expect(req.type).toBe(6)
    expect(req.startsOn).toBe('2026-07-20')
    expect(JSON.parse(req.paramsJson!)).toEqual({ fromDate: '2026-07-21', toDate: '2026-07-20', startMinutes: 540 })
  })

  it('buildMoveVisitPatch omits startMinutes when not given', () => {
    const req = buildMoveVisitPatch({ storeId: 's1', fromDate: '2026-07-20', toDate: '2026-07-21', endsOn: '2026-07-25' })

    expect(JSON.parse(req.paramsJson!)).toEqual({ fromDate: '2026-07-20', toDate: '2026-07-21' })
  })

  it('buildResizeUpdate returns the serviceMinutes update payload', () => {
    expect(buildResizeUpdate(45)).toEqual({ serviceMinutes: 45 })
  })
})
