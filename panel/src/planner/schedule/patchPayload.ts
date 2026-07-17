import type { components } from '../../api/generated/schema'

type CreatePatchRequest = components['schemas']['CreatePatchRequest']
type UpdateStopRequest = components['schemas']['UpdateStopRequest']

const PATCH_TYPE_TIME_SHIFT = 5
const PATCH_TYPE_MOVE_VISIT = 6

function toIsoDate(d: string): string {
  // dates already arrive as "YYYY-MM-DD" from the plan/day-cell data; pass through unchanged.
  return d
}

export function buildTimeShiftPatch(params: {
  storeId: string
  startsOn: string
  endsOn: string
  startMinutes: number
  reason?: string | null
}): CreatePatchRequest {
  return {
    type: PATCH_TYPE_TIME_SHIFT,
    storeId: params.storeId,
    startsOn: toIsoDate(params.startsOn),
    endsOn: toIsoDate(params.endsOn),
    paramsJson: JSON.stringify({ startMinutes: params.startMinutes }),
    reason: params.reason ?? null,
  }
}

export function buildMoveVisitPatch(params: {
  storeId: string
  fromDate: string
  toDate: string
  endsOn: string
  startMinutes?: number
  reason?: string | null
}): CreatePatchRequest {
  const startsOn = params.fromDate < params.toDate ? params.fromDate : params.toDate

  return {
    type: PATCH_TYPE_MOVE_VISIT,
    storeId: params.storeId,
    startsOn: toIsoDate(startsOn),
    endsOn: toIsoDate(params.endsOn),
    paramsJson: JSON.stringify({
      fromDate: params.fromDate,
      toDate: params.toDate,
      ...(params.startMinutes !== undefined ? { startMinutes: params.startMinutes } : {}),
    }),
    reason: params.reason ?? null,
  }
}

export function buildResizeUpdate(serviceMinutes: number): UpdateStopRequest {
  return { serviceMinutes }
}
