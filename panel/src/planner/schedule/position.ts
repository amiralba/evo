export const PX_PER_MINUTE = 1.2
export const DAY_START_MINUTES = 9 * 60
export const DAY_END_MINUTES = 18 * 60

export interface BlockGeometry {
  topPx: number
  heightPx: number
}

/** Extracts the wall-clock HH:mm from an ISO date-time string, ignoring any timezone offset —
 * the grid always shows the time-of-day as written by the backend, not converted to the
 * viewer's local timezone. */
function minutesOfDay(iso: string): number {
  const match = /T(\d{2}):(\d{2})/.exec(iso)
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2])
}

/** start/end are ISO date-time strings; dayStartMinutes is the grid's top-of-day reference
 * (minutes since midnight, e.g. 9*60 for a 09:00 grid start). */
export function blockGeometry(start: string, end: string, dayStartMinutes = 9 * 60): BlockGeometry {
  const startMinutes = minutesOfDay(start) - dayStartMinutes
  const endMinutes = minutesOfDay(end) - dayStartMinutes

  return {
    topPx: startMinutes * PX_PER_MINUTE,
    heightPx: Math.max(4, (endMinutes - startMinutes) * PX_PER_MINUTE),
  }
}
