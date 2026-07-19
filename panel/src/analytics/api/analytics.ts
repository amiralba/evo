import { authorizedFetch } from '../../api/client'
import type { components } from '../../api/generated/schema'

type PlanHealthReportDto = components['schemas']['PlanHealthReportDto']
type MerchandiserMobilityDto = components['schemas']['MerchandiserMobilityDto']

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

export async function getMobility(region?: string, months?: number): Promise<MerchandiserMobilityDto[]> {
  const params = new URLSearchParams()
  if (region) params.set('region', region)
  if (months) params.set('months', String(months))
  const response = await authorizedFetch(`/api/v1/analytics/mobility?${params.toString()}`)
  return json<MerchandiserMobilityDto[]>(response)
}
