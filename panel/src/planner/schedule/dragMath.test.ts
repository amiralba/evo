import { describe, expect, it } from 'vitest'
import { snapMinutes, clampDuration, clampStart, pxToMinutes, minutesToPx } from './dragMath'

describe('dragMath', () => {
  it('snapMinutes rounds to the nearest step', () => {
    expect(snapMinutes(237)).toBe(235)
    expect(snapMinutes(238)).toBe(240)
  })

  it('clampDuration snaps then clamps to [10,240]', () => {
    expect(clampDuration(500)).toBe(240)
    expect(clampDuration(3)).toBe(10)
    expect(clampDuration(237)).toBe(235)
  })

  it('clampStart keeps a block inside the day bounds', () => {
    const dayStart = 9 * 60
    const dayEnd = 18 * 60
    // a late start would push the 30-min block past dayEnd -> clamps so end === dayEnd
    expect(clampStart(dayEnd + 10, 30, dayStart, dayEnd)).toBe(dayEnd - 30)
    // an early start clamps to dayStart
    expect(clampStart(dayStart - 30, 30, dayStart, dayEnd)).toBe(dayStart)
  })

  it('pxToMinutes and minutesToPx round-trip', () => {
    expect(pxToMinutes(minutesToPx(60))).toBeCloseTo(60)
  })
})
