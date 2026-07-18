export interface WeekRange {
  from: string
  to: string
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** All arithmetic happens in UTC so a "YYYY-MM-DD" round-trip never shifts by a day
 * depending on the caller's local timezone offset. */
function mondayOfUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d
}

function weekFromMonday(monday: Date): WeekRange {
  const friday = new Date(monday)
  friday.setUTCDate(friday.getUTCDate() + 4)
  return { from: toIso(monday), to: toIso(friday) }
}

export function currentWeek(reference: Date = new Date()): WeekRange {
  return weekFromMonday(mondayOfUtc(reference))
}

export function nextWeek(from: string): WeekRange {
  const monday = mondayOfUtc(new Date(`${from}T00:00:00Z`))
  monday.setUTCDate(monday.getUTCDate() + 7)
  return weekFromMonday(monday)
}

export function prevWeek(from: string): WeekRange {
  const monday = mondayOfUtc(new Date(`${from}T00:00:00Z`))
  monday.setUTCDate(monday.getUTCDate() - 7)
  return weekFromMonday(monday)
}

export function formatWeekRange(week: WeekRange): string {
  const fmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })
  return `${fmt.format(new Date(`${week.from}T00:00:00Z`))} – ${fmt.format(new Date(`${week.to}T00:00:00Z`))}`
}

/** The 5 weekday ISO dates (Mon-Fri) in a WeekRange, in order — used to always render 5 grid
 * columns regardless of which days have materialized visits (a day with none simply isn't in
 * the /plan response, but the grid should still show it as an empty column, matching the
 * prototype). */
export function weekdayDates(week: WeekRange): string[] {
  const monday = new Date(`${week.from}T00:00:00Z`)
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(d.getUTCDate() + i)
    return toIso(d)
  })
}
