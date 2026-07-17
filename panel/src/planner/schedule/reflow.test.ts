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
})
