import { authorizedFetch } from './client'
import type { components } from './generated/schema'

type RouteSummaryDtoPagedResult = components['schemas']['RouteSummaryDtoPagedResult']
type RouteSummaryDto = components['schemas']['RouteSummaryDto']
type RouteDetailDto = components['schemas']['RouteDetailDto']
type RouteStatus = components['schemas']['RouteStatus']
type StoreGeoDto = components['schemas']['StoreGeoDto']
type PlanDayDto = components['schemas']['PlanDayDto']
type HealthDto = components['schemas']['HealthDto']
type FindingDto = components['schemas']['FindingDto']
type BulkAddStopsRequest = components['schemas']['BulkAddStopsRequest']
type BulkAddResultDto = components['schemas']['BulkAddResultDto']
type UpdateStopRequest = components['schemas']['UpdateStopRequest']
type RouteStopDto = components['schemas']['RouteStopDto']
type CreatePatchRequest = components['schemas']['CreatePatchRequest']
type PatchDto = components['schemas']['PatchDto']
type PublishRequest = components['schemas']['PublishRequest']
type PublishResultDto = components['schemas']['PublishResultDto']
type AuditLogEntryDtoPagedResult = components['schemas']['AuditLogEntryDtoPagedResult']
type DecisionJournalEntryDtoPagedResult = components['schemas']['DecisionJournalEntryDtoPagedResult']
type MerchandiserSummaryDto = components['schemas']['MerchandiserSummaryDto']
type CreateRouteRequest = components['schemas']['CreateRouteRequest']
type ReassignRequest = components['schemas']['ReassignRequest']
type AssignmentDto = components['schemas']['AssignmentDto']
type TaskPlanDto = components['schemas']['TaskPlanDto']
type RuleImpactDto = components['schemas']['RuleImpactDto']
type RuleScopeLevel = components['schemas']['RuleScopeLevel']
type TaskEffectOp = components['schemas']['TaskEffectOp']
type PatchTaskInstanceRequest = components['schemas']['PatchTaskInstanceRequest']
type StoreDetailDto = components['schemas']['StoreDetailDto']
type NoteDto = components['schemas']['NoteDto']
type NoteStatus = components['schemas']['NoteStatus']
type NoteKind = components['schemas']['NoteKind']
type NoteAnchorType = components['schemas']['NoteAnchorType']
type UpdateNoteStatusRequest = components['schemas']['UpdateNoteStatusRequest']

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return (await response.json()) as T
}

export async function listRoutes(province?: string, status?: RouteStatus): Promise<RouteSummaryDtoPagedResult> {
  const params = new URLSearchParams()
  if (province) params.set('province', province)
  if (status) params.set('status', String(status))
  params.set('pageSize', '200')
  const response = await authorizedFetch(`/api/v1/routes?${params.toString()}`)
  return json<RouteSummaryDtoPagedResult>(response)
}

export async function getRoute(id: string): Promise<RouteDetailDto> {
  const response = await authorizedFetch(`/api/v1/routes/${id}`)
  return json<RouteDetailDto>(response)
}

export async function getStoresGeo(province: string, onRoute?: boolean): Promise<StoreGeoDto[]> {
  const params = new URLSearchParams({ province })
  if (onRoute !== undefined) params.set('onRoute', String(onRoute))
  const response = await authorizedFetch(`/api/v1/stores/geo?${params.toString()}`)
  return json<StoreGeoDto[]>(response)
}

export async function getPlan(id: string, from: string, to: string): Promise<PlanDayDto[]> {
  const params = new URLSearchParams({ from, to })
  const response = await authorizedFetch(`/api/v1/routes/${id}/plan?${params.toString()}`)
  return json<PlanDayDto[]>(response)
}

export async function getHealth(id: string): Promise<HealthDto> {
  const response = await authorizedFetch(`/api/v1/routes/${id}/health`)
  return json<HealthDto>(response)
}

export async function validateRoute(id: string): Promise<FindingDto[]> {
  const response = await authorizedFetch(`/api/v1/routes/${id}/validate`, { method: 'POST' })
  return json<FindingDto[]>(response)
}

export async function bulkAddStops(id: string, body: BulkAddStopsRequest): Promise<BulkAddResultDto> {
  const response = await authorizedFetch(`/api/v1/routes/${id}/stops:bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return json<BulkAddResultDto>(response)
}

export async function updateStop(id: string, stopId: string, body: UpdateStopRequest): Promise<RouteStopDto> {
  const response = await authorizedFetch(`/api/v1/routes/${id}/stops/${stopId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return json<RouteStopDto>(response)
}

export async function reorderStops(id: string, stopIds: string[]): Promise<RouteDetailDto> {
  const response = await authorizedFetch(`/api/v1/routes/${id}/stops:reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stopIds }),
  })
  return json<RouteDetailDto>(response)
}

export async function moveStop(id: string, stopId: string, targetRouteId: string): Promise<RouteStopDto> {
  const response = await authorizedFetch(`/api/v1/routes/${id}/stops/${stopId}:move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetRouteId }),
  })
  return json<RouteStopDto>(response)
}

export async function createPatch(id: string, body: CreatePatchRequest): Promise<PatchDto> {
  const response = await authorizedFetch(`/api/v1/routes/${id}/patches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return json<PatchDto>(response)
}

export async function cancelPatch(id: string, patchId: string): Promise<PatchDto> {
  const response = await authorizedFetch(`/api/v1/routes/${id}/patches/${patchId}/cancel`, { method: 'POST' })
  return json<PatchDto>(response)
}

export async function publishRoute(id: string, body: PublishRequest): Promise<PublishResultDto> {
  const response = await authorizedFetch(`/api/v1/routes/${id}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return json<PublishResultDto>(response)
}

/** No server-side filter by entityKey exists (only entityType) — fetches a page of Route audit
 * entries and the caller filters by routeId client-side. Fine for the panel's Geçmiş tab; would
 * need a real entityKey filter param if the audit log grows large enough for this to matter. */
export async function getRouteAuditLog(): Promise<AuditLogEntryDtoPagedResult> {
  const response = await authorizedFetch(`/api/v1/audit-log?entityType=Route&pageSize=200`)
  return json<AuditLogEntryDtoPagedResult>(response)
}

export async function getDecisionJournal(): Promise<DecisionJournalEntryDtoPagedResult> {
  const response = await authorizedFetch(`/api/v1/decision-journal?pageSize=200`)
  return json<DecisionJournalEntryDtoPagedResult>(response)
}

export async function createRoute(body: CreateRouteRequest): Promise<RouteSummaryDto> {
  const response = await authorizedFetch(`/api/v1/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return json<RouteSummaryDto>(response)
}

export async function getMerchandisers(): Promise<MerchandiserSummaryDto[]> {
  const response = await authorizedFetch(`/api/v1/merchandisers`)
  return json<MerchandiserSummaryDto[]>(response)
}

export async function updateRoute(
  id: string,
  body: components['schemas']['UpdateRouteRequest'],
): Promise<RouteSummaryDto> {
  const response = await authorizedFetch(`/api/v1/routes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return json<RouteSummaryDto>(response)
}

export async function reassignRoute(routeId: string, body: ReassignRequest): Promise<AssignmentDto> {
  const response = await authorizedFetch(`/api/v1/routes/${routeId}/assignment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return json<AssignmentDto>(response)
}

export async function getStoreDetail(storeId: string): Promise<StoreDetailDto> {
  const response = await authorizedFetch(`/api/v1/stores/${storeId}`)
  return json<StoreDetailDto>(response)
}

export async function getStoreTaskPlan(storeId: string, date: string): Promise<TaskPlanDto> {
  const response = await authorizedFetch(`/api/v1/stores/${storeId}/task-plan?date=${date}`)
  return json<TaskPlanDto>(response)
}

export interface RuleImpactParams {
  scope: RuleScopeLevel
  taskTemplateId: string
  chainId?: string
  format?: number
  routeId?: string
  storeId?: string
  op: TaskEffectOp
  setValue?: number
  scaleValue?: number
}

export async function getRuleImpact(params: RuleImpactParams): Promise<RuleImpactDto> {
  const search = new URLSearchParams()
  search.set('scope', String(params.scope))
  search.set('taskTemplateId', params.taskTemplateId)
  search.set('op', String(params.op))
  if (params.chainId) search.set('chainId', params.chainId)
  if (params.format !== undefined) search.set('format', String(params.format))
  if (params.routeId) search.set('routeId', params.routeId)
  if (params.storeId) search.set('storeId', params.storeId)
  if (params.setValue !== undefined) search.set('setValue', String(params.setValue))
  if (params.scaleValue !== undefined) search.set('scaleValue', String(params.scaleValue))
  const response = await authorizedFetch(`/api/v1/rules/impact?${search.toString()}`)
  return json<RuleImpactDto>(response)
}

export async function updateTaskInstanceScope(taskInstanceId: string, body: PatchTaskInstanceRequest): Promise<void> {
  const response = await authorizedFetch(`/api/v1/task-instances/${taskInstanceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
}

export interface NoteFilters {
  status?: NoteStatus
  kind?: NoteKind
  anchorType?: NoteAnchorType
}

export async function getNotes(filters: NoteFilters = {}): Promise<NoteDto[]> {
  const search = new URLSearchParams()
  if (filters.status !== undefined) search.set('status', String(filters.status))
  if (filters.kind !== undefined) search.set('kind', String(filters.kind))
  if (filters.anchorType !== undefined) search.set('anchorType', String(filters.anchorType))
  const response = await authorizedFetch(`/api/v1/notes?${search.toString()}`)
  return json<NoteDto[]>(response)
}

export async function updateNoteStatus(id: string, body: UpdateNoteStatusRequest): Promise<NoteDto> {
  const response = await authorizedFetch(`/api/v1/notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return json<NoteDto>(response)
}
