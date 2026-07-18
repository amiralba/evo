import { describe, expect, it } from 'vitest'
import { blockGeometry, PX_PER_MINUTE } from './position'

describe('blockGeometry', () => {
  it('positions a 10:00-10:30 visit relative to a 09:00 day start', () => {
    const start = '2026-07-20T10:00:00+03:00'
    const end = '2026-07-20T10:30:00+03:00'

    const { topPx, heightPx } = blockGeometry(start, end, 9 * 60)

    expect(topPx).toBeCloseTo(60 * PX_PER_MINUTE)
    expect(heightPx).toBeCloseTo(30 * PX_PER_MINUTE)
  })

  it('positions relative to the default (prototype-parity 06:00) day start', () => {
    const start = '2026-07-20T10:00:00+03:00'
    const end = '2026-07-20T10:30:00+03:00'

    const { topPx, heightPx } = blockGeometry(start, end)

    expect(topPx).toBeCloseTo((10 * 60 - 6 * 60) * PX_PER_MINUTE)
    expect(heightPx).toBeCloseTo(30 * PX_PER_MINUTE)
  })
})
