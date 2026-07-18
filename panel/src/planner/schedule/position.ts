/** Prototype-parity geometry (evo-planner-prototype-v0.5.html DAY_START/DAY_END/CELL_H) —
 * 06:00–23:00 at 0.5px/min. Matched exactly so schedules render at the same visual scale. */
export const PX_PER_MINUTE = 0.5
export const DAY_START_MINUTES = 6 * 60
export const DAY_END_MINUTES = 23 * 60

export interface BlockGeometry {
  topPx: number
  heightPx: number
}

/** Extracts the wall-clock HH:mm from an ISO date-time string, ignoring any timezone offset —
 * the grid always shows the time-of-day as written by the backend, not converted to the
 * viewer's local timezone. */
export function minutesOfDay(iso: string): number {
  const match = /T(\d{2}):(\d{2})/.exec(iso)
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2])
}

/** start/end are ISO date-time strings; dayStartMinutes is the grid's top-of-day reference
 * (minutes since midnight, e.g. 6*60 for a 06:00 grid start). */
export function blockGeometry(start: string, end: string, dayStartMinutes = DAY_START_MINUTES): BlockGeometry {
  const startMinutes = minutesOfDay(start) - dayStartMinutes
  const endMinutes = minutesOfDay(end) - dayStartMinutes

  return {
    topPx: startMinutes * PX_PER_MINUTE,
    heightPx: Math.max(4, (endMinutes - startMinutes) * PX_PER_MINUTE),
  }
}
