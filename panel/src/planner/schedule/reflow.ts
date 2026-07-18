import { BREAK_BLOCKS } from './breaks'

export interface ReflowInputVisit {
  startMin: number
  durationMin: number
}

export interface ReflowResult {
  startMin: number
  endMin: number
}

/** Client mirror of the prototype's reflow(pid,day) (evo-planner-prototype-v0.5.html:569-576):
 * each visit keeps ITS OWN start time unless it would overlap the one before it, in which case
 * it's pushed just past that visit's end — never force-packed back-to-back. Used for the live
 * rubber-band reflow preview while dragging/resizing — the server-side regeneration on drop is
 * the actual source of truth (this only has to be visually close during the drag).
 *
 * A previous version always set `start = cursor` for every visit at/after changedIndex, which
 * collapsed every later visit's gap to zero — moving or resizing ONE visit made every visit
 * after it visually jump to a new, tightly-packed position even though nothing about them had
 * actually changed. */
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
    const isChanged = i === changedIndex
    const duration = isChanged ? newDurationMin : visits[i].durationMin
    const naturalStart = isChanged ? newStartMin : visits[i].startMin

    // Visits before the changed one are never pushed by it. Visits at/after it keep their own
    // start unless the changed visit's new end (or a prior push) now overlaps them.
    let start = i < changedIndex ? naturalStart : Math.max(naturalStart, cursor)
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
