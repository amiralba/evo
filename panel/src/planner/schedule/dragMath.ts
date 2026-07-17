import { PX_PER_MINUTE } from './position'

export function pxToMinutes(px: number): number {
  return px / PX_PER_MINUTE
}

export function minutesToPx(minutes: number): number {
  return minutes * PX_PER_MINUTE
}

export function snapMinutes(minutes: number, step = 5): number {
  return Math.round(minutes / step) * step
}

/** Clamps a (possibly snapped) start time so the block of `durationMin` fits within
 * [dayStart, dayEnd]. */
export function clampStart(startMin: number, durationMin: number, dayStart: number, dayEnd: number): number {
  const maxStart = dayEnd - durationMin
  return Math.min(Math.max(startMin, dayStart), Math.max(maxStart, dayStart))
}

/** Snaps to the nearest 5 minutes, then clamps to the backend's UpdateStop range [10,240]. */
export function clampDuration(minutes: number): number {
  return Math.min(Math.max(snapMinutes(minutes), 10), 240)
}
