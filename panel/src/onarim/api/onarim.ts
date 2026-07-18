import { authorizedFetch } from '../../api/client'
import type { components } from '../../api/generated/schema'

type DisruptionDto = components['schemas']['DisruptionDto']
type AffectedVisitDto = components['schemas']['AffectedVisitDto']
type ApplyOnarimRequest = components['schemas']['ApplyOnarimRequest']

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return (await response.json()) as T
}

export async function getDisruptions(region?: string): Promise<DisruptionDto[]> {
  const params = new URLSearchParams()
  if (region) params.set('region', region)
  const response = await authorizedFetch(`/api/v1/onarim/disruptions?${params.toString()}`)
  return json<DisruptionDto[]>(response)
}

export async function getAffectedVisits(disruptionId: string): Promise<AffectedVisitDto[]> {
  const response = await authorizedFetch(`/api/v1/onarim/disruptions/${disruptionId}/affected-visits`)
  return json<AffectedVisitDto[]>(response)
}

export async function applyOnarim(disruptionId: string, body: ApplyOnarimRequest): Promise<unknown> {
  const response = await authorizedFetch(`/api/v1/onarim/disruptions/${disruptionId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return json<unknown>(response)
}
