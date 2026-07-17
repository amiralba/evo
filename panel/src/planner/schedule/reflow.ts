import { BREAK_BLOCKS } from './breaks'

export interface ReflowInputVisit {
  startMin: number
  durationMin: number
}

export interface ReflowResult {
  startMin: number
  endMin: number
}

/** Client mirror of the backend's DayScheduler.ScheduleDay: places the changed visit at
 * max(newStartMin, previous visit's end), then packs every later visit sequentially, pushing
 * each past any statutory break it would otherwise overlap. Used for the live rubber-band
 * reflow preview while dragging/resizing — the server-side regeneration on drop is the actual
 * source of truth (this only has to be visually close during the drag). */
export function reflowDay(
  visits: ReflowInputVisit[],
  changedIndex: number,
  newStartMin: number,
  newDurationMin: number,
  breaks = BREAK_BLOCKS,
): ReflowResult[] {
  const results: ReflowResult[] = []
  let cursor = 0

  for (let i = 0; i < visits.length; i++) {
    if (i < changedIndex) {
      // Untouched visits before the change keep their original position.
      const { startMin, durationMin } = visits[i]
      results.push({ startMin, endMin: startMin + durationMin })
      cursor = startMin + durationMin
      continue
    }

    const isChanged = i === changedIndex
    const duration = isChanged ? newDurationMin : visits[i].durationMin
    let start = isChanged ? Math.max(newStartMin, cursor) : cursor
    let end = start + duration

    for (const brk of breaks) {
      if (start < brk.endMinutes && end > brk.startMinutes) {
        start = brk.endMinutes
        end = start + duration
      }
    }

    results.push({ startMin: start, endMin: end })
    cursor = end
  }

  return results
}
