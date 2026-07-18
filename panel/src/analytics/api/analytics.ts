import { authorizedFetch } from '../../api/client'
import type { components } from '../../api/generated/schema'

type PlanHealthReportDto = components['schemas']['PlanHealthReportDto']
type RouteStabilityDto = components['schemas']['RouteStabilityDto']
type MerchandiserMobilityDto = components['schemas']['MerchandiserMobilityDto']
type RouteEvidenceDto = components['schemas']['RouteEvidenceDto']

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return (await response.json()) as T
}

export async function getPlanHealth(region?: string, from?: string, to?: string): Promise<PlanHealthReportDto> {
  const params = new URLSearchParams()
  if (region) params.set('region', region)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const response = await authorizedFetch(`/api/v1/analytics/plan-health?${params.toString()}`)
  return json<PlanHealthReportDto>(response)
}

export async function getStability(region?: string): Promise<RouteStabilityDto[]> {
  const params = new URLSearchParams()
  if (region) params.set('region', region)
  const response = await authorizedFetch(`/api/v1/analytics/stability?${params.toString()}`)
  return json<RouteStabilityDto[]>(response)
}

export async function getMobility(region?: string, months?: number): Promise<MerchandiserMobilityDto[]> {
  const params = new URLSearchParams()
  if (region) params.set('region', region)
  if (months) params.set('months', String(months))
  const response = await authorizedFetch(`/api/v1/analytics/mobility?${params.toString()}`)
  return json<MerchandiserMobilityDto[]>(response)
}

export async function getRouteEvidence(routeId: string, weeks?: number): Promise<RouteEvidenceDto> {
  const params = new URLSearchParams()
  if (weeks) params.set('weeks', String(weeks))
  const response = await authorizedFetch(`/api/v1/routes/${routeId}/evidence?${params.toString()}`)
  return json<RouteEvidenceDto>(response)
}
