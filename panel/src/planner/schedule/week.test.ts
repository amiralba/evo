import { describe, expect, it } from 'vitest'
import { currentWeek, nextWeek, prevWeek, weekdayDates, todayIso } from './week'

describe('week', () => {
  // 2026-07-16 is a Thursday
  const reference = new Date('2026-07-16T12:00:00Z')

  it('currentWeek returns the Mon-Fri range containing the reference date', () => {
    expect(currentWeek(reference)).toEqual({ from: '2026-07-13', to: '2026-07-17' })
  })

  it('nextWeek shifts the range +7 days', () => {
    const week = currentWeek(reference)
    expect(nextWeek(week.from)).toEqual({ from: '2026-07-20', to: '2026-07-24' })
  })

  it('prevWeek shifts the range -7 days', () => {
    const week = currentWeek(reference)
    expect(prevWeek(week.from)).toEqual({ from: '2026-07-06', to: '2026-07-10' })
  })

  it('weekdayDates returns all 5 Mon-Fri dates in order', () => {
    const week = currentWeek(reference)
    expect(weekdayDates(week)).toEqual(['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17'])
  })

  it('todayIso returns the reference date as YYYY-MM-DD', () => {
    expect(todayIso(reference)).toBe('2026-07-16')
  })

  it('a Saturday reference shares its Monday with the already-elapsed Mon-Fri week', () => {
    // Regression case: comparing Mondays (week.from < currentWeek().from) fails to flag this
    // week as past once "today" is a weekend day, since the weekend shares its Monday with the
    // just-finished Mon-Fri week. Comparing the grid's last day (week.to) against todayIso()
    // correctly identifies it as elapsed.
    const saturday = new Date('2026-07-18T12:00:00Z')
    const week = currentWeek(saturday)
    expect(week).toEqual({ from: '2026-07-13', to: '2026-07-17' })
    expect(week.to < todayIso(saturday)).toBe(true)
    expect(week.from < currentWeek(saturday).from).toBe(false) // the buggy comparison misses it
  })
})
