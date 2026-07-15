import type { paths } from './generated/schema'

type HealthResponse = paths['/api/v1/health']['get']['responses']['200']['content']['application/json']

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health')
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`)
  }
  return (await response.json()) as HealthResponse
}
