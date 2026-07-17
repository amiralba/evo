import { DAY_START_MINUTES, DAY_END_MINUTES } from './position'
import { clampDuration, clampStart, pxToMinutes, snapMinutes } from './dragMath'
import { buildTimeShiftPatch, buildMoveVisitPatch, buildResizeUpdate } from './patchPayload'
import type { PatchFormPrefill } from '../components/editing/PatchForm'
import type { components } from '../../api/generated/schema'

type UpdateStopRequest = components['schemas']['UpdateStopRequest']

export interface DropInput {
  kind: 'move' | 'resize'
  storeId: string
  originalStartMin: number
  durationMin: number
  deltaPx: number
  sourceDate: string
  targetDate: string
}

export type DropDecision =
  | { action: 'none' }
  | { action: 'resize'; update: UpdateStopRequest }
  | { action: 'patch'; prefill: PatchFormPrefill }

/** Pure decision logic for what a completed drag/resize should do — same-day move -> TimeShift
 * prefill, cross-day move -> MoveVisit prefill, resize -> a direct UpdateStop payload. Split out
 * from SchedulePane's pointer-event plumbing so the actual "what does this drop mean" logic is
 * unit-testable without simulating pointer events. */
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

  if (sameDay) {
    const req = buildTimeShiftPatch({ storeId: input.storeId, startsOn: input.sourceDate, endsOn: '', startMinutes: newStart })
    return {
      action: 'patch',
      prefill: { type: req.type as number, storeId: input.storeId, startsOn: input.sourceDate, startMinutes: newStart },
    }
  }

  const req = buildMoveVisitPatch({
    storeId: input.storeId,
    fromDate: input.sourceDate,
    toDate: input.targetDate,
    endsOn: '',
    startMinutes: newStart,
  })
  return {
    action: 'patch',
    prefill: {
      type: req.type as number,
      storeId: input.storeId,
      startsOn: req.startsOn!,
      fromDate: input.sourceDate,
      toDate: input.targetDate,
      startMinutes: newStart,
    },
  }
}
