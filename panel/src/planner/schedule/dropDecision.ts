import { DAY_START_MINUTES, DAY_END_MINUTES } from './position'
import { clampDuration, clampStart, pxToMinutes, snapMinutes } from './dragMath'
import { buildTimeShiftPatch, buildMoveVisitPatch, buildResizeUpdate } from './patchPayload'
import type { components } from '../../api/generated/schema'

type UpdateStopRequest = components['schemas']['UpdateStopRequest']
type CreatePatchRequest = components['schemas']['CreatePatchRequest']

export interface DropInput {
  kind: 'move' | 'resize'
  storeId: string
  storeName: string
  originalStartMin: number
  durationMin: number
  deltaPx: number
  sourceDate: string
  targetDate: string
  /** End of the currently displayed week — a drag's default scope is "this week only"
   * (design §10: "Drag = patch-for-this-week by default"), matching the prototype's
   * startMove()/startResizeTop(), which apply the change immediately and offer a toast to
   * widen or make it permanent rather than blocking on a modal asking for an expiry date. */
  weekEndsOn: string
}

export type DropDecision =
  | { action: 'none' }
  | { action: 'resize'; update: UpdateStopRequest }
  | { action: 'patch'; request: CreatePatchRequest; summary: string }

/** Pure decision logic for what a completed drag/resize should do — same-day move -> TimeShift
 * patch, cross-day move -> MoveVisit patch, resize -> a direct UpdateStop payload. Both patch
 * kinds are built ready-to-submit (scoped to the current week) rather than as a form prefill —
 * split out from SchedulePane's pointer-event plumbing so the actual "what does this drop mean"
 * logic is unit-testable without simulating pointer events. */
export function decideDrop(input: DropInput): DropDecision {
  const deltaMin = pxToMinutes(input.deltaPx)

  if (input.kind === 'resize') {
    const newDuration = clampDuration(input.durationMin + deltaMin)
    if (newDuration === input.durationMin) return { action: 'none' }
    return { action: 'resize', update: buildResizeUpdate(newDuration) }
  }

  const rawStart = snapMinutes(input.originalStartMin + deltaMin)
  const newStart = clampStart(rawStart, input.durationMin, DAY_START_MINUTES, DAY_END_MINUTES)
  const sameDay = input.sourceDate === input.targetDate
  if (sameDay && newStart === input.originalStartMin) return { action: 'none' }

  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

  if (sameDay) {
    const request = buildTimeShiftPatch({
      storeId: input.storeId,
      startsOn: input.sourceDate,
      endsOn: input.weekEndsOn,
      startMinutes: newStart,
    })
    return { action: 'patch', request, summary: `${input.storeName}: ${fmt(input.originalStartMin)} → ${fmt(newStart)}` }
  }

  const request = buildMoveVisitPatch({
    storeId: input.storeId,
    fromDate: input.sourceDate,
    toDate: input.targetDate,
    endsOn: input.weekEndsOn,
    startMinutes: newStart,
  })
  return { action: 'patch', request, summary: `${input.storeName}: ${input.sourceDate} → ${input.targetDate}` }
}
