import { describe, expect, it } from 'vitest'
import { reflowDay } from './reflow'

const NINE_TO_TEN_THIRTY_BREAK = [{ label: 'Test', startMinutes: 10 * 60, endMinutes: 10 * 60 + 15 }]

describe('reflowDay', () => {
  it('moving the changed visit later slides subsequent visits after it', () => {
    const visits = [
      { startMin: 9 * 60, durationMin: 30 },
      { startMin: 9 * 60 + 30, durationMin: 30 },
      { startMin: 10 * 60, durationMin: 30 },
    ]

    const result = reflowDay(visits, 0, 9 * 60 + 45, 30, [])

    expect(result[0]).toEqual({ startMin: 9 * 60 + 45, endMin: 10 * 60 + 15 })
    expect(result[1]).toEqual({ startMin: 10 * 60 + 15, endMin: 10 * 60 + 45 })
    expect(result[2]).toEqual({ startMin: 10 * 60 + 45, endMin: 11 * 60 + 15 })
  })

  it('a change colliding with a break pushes the block past it', () => {
    const visits = [{ startMin: 9 * 60, durationMin: 30 }]

    const result = reflowDay(visits, 0, 9 * 60 + 55, 30, NINE_TO_TEN_THIRTY_BREAK)

    expect(result[0]).toEqual({ startMin: 10 * 60 + 15, endMin: 10 * 60 + 45 })
  })

  it('a newStartMin earlier than the predecessor end clamps to that end', () => {
    const visits = [
      { startMin: 9 * 60, durationMin: 60 }, // ends 10:00
      { startMin: 10 * 60, durationMin: 30 },
    ]

    const result = reflowDay(visits, 1, 9 * 60 + 30, 30, [])

    expect(result[1]).toEqual({ startMin: 10 * 60, endMin: 10 * 60 + 30 })
  })

  it('visits with real gaps between them keep their own position when a different visit changes', () => {
    // Regression test: an earlier version always packed every visit at/after the changed one
    // back-to-back with zero gap, so moving/resizing ONE visit made every later visit jump to a
    // new position even when nothing about them had changed and there was no actual overlap.
    const visits = [
      { startMin: 9 * 60, durationMin: 30 }, // 09:00-09:30
      { startMin: 11 * 60, durationMin: 30 }, // 11:00-11:30 — big gap after visit 0
      { startMin: 14 * 60, durationMin: 30 }, // 14:00-14:30 — big gap after visit 1
    ]

    const result = reflowDay(visits, 0, 9 * 60 + 15, 30, [])

    expect(result[0]).toEqual({ startMin: 9 * 60 + 15, endMin: 9 * 60 + 45 })
    expect(result[1]).toEqual({ startMin: 11 * 60, endMin: 11 * 60 + 30 })
    expect(result[2]).toEqual({ startMin: 14 * 60, endMin: 14 * 60 + 30 })
  })

  it('a resize that grows into a later gapped visit pushes only that visit', () => {
    const visits = [
      { startMin: 9 * 60, durationMin: 30 }, // 09:00-09:30, resized to 09:00-10:15
      { startMin: 11 * 60, durationMin: 30 }, // 11:00-11:30 — untouched, no overlap
    ]

    const result = reflowDay(visits, 0, 9 * 60, 75, [])

    expect(result[0]).toEqual({ startMin: 9 * 60, endMin: 10 * 60 + 15 })
    expect(result[1]).toEqual({ startMin: 11 * 60, endMin: 11 * 60 + 30 })
  })
})
