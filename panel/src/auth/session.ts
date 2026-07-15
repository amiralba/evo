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

/**
 * Calls POST /auth/refresh directly (not through client.ts's wrapper, to avoid a circular
 * 401-interceptor dependency) using the httpOnly refresh cookie. Shared by AuthContext's
 * mount-time session restore and client.ts's 401 interceptor — both need the exact same
 * "try to get a fresh access token" behavior.
 */
export async function refreshSession(): Promise<boolean> {
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
}
