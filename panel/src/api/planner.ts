import { authorizedFetch } from './client'
import type { components } from './generated/schema'

type RouteSummaryDtoPagedResult = components['schemas']['RouteSummaryDtoPagedResult']
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
