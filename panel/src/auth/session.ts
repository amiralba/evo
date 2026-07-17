import type { components } from '../api/generated/schema'

export type MeResponse = components['schemas']['MeResponse']

type Listener = () => void

let accessToken: string | null = null
let user: MeResponse | null = null
const listeners = new Set<Listener>()

export function getAccessToken(): string | null {
  return accessToken
}

export function getUser(): MeResponse | null {
  return user
}

export function setSession(token: string, nextUser: MeResponse): void {
  accessToken = token
  user = nextUser
  listeners.forEach((listener) => listener())
}

export function clearSession(): void {
  accessToken = null
  user = null
  listeners.forEach((listener) => listener())
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let refreshInFlight: Promise<boolean> | null = null

/**
 * Calls POST /auth/refresh directly (not through client.ts's wrapper, to avoid a circular
 * 401-interceptor dependency) using the httpOnly refresh cookie. Shared by AuthContext's
 * mount-time session restore and client.ts's 401 interceptor — both need the exact same
 * "try to get a fresh access token" behavior.
 *
 * Concurrent calls dedupe into a single in-flight request (React StrictMode double-invokes
 * AuthProvider's mount effect in dev, and two callers can otherwise race here). The backend
 * rotates the refresh token on use and treats a second concurrent use of the same token as
 * reuse/theft, revoking every refresh token for the user — so an un-deduped race would have
 * one caller's success immediately invalidated by the other caller's "reuse" failure.
 */
export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight
  }

  refreshInFlight = (async () => {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      clearSession()
      return false
    }
    const body = (await response.json()) as { accessToken: string; user: MeResponse }
    setSession(body.accessToken, body.user)
    return true
  })()

  return refreshInFlight.finally(() => {
    refreshInFlight = null
  })
}
