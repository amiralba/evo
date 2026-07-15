import { clearSession, getAccessToken, refreshSession } from '../auth/session'
import type { paths } from './generated/schema'

type HealthResponse = paths['/api/v1/health']['get']['responses']['200']['content']['application/json']

async function authorizedFetch(input: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
  const token = getAccessToken()
  const headers = new Headers(init.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(input, { ...init, headers, credentials: 'include' })

  if (response.status === 401 && !isRetry) {
    const refreshed = await refreshSession()
    if (refreshed) {
      return authorizedFetch(input, init, true)
    }
    clearSession()
    if (typeof window !== 'undefined') {
      window.location.assign('/login')
    }
  }

  return response
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await authorizedFetch('/api/v1/health')
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`)
  }
  return (await response.json()) as HealthResponse
}
