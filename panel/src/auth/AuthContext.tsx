import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { parseApiError, type ApiError } from '../api/errors'
import {
  clearSession,
  getAccessToken,
  getUser,
  refreshSession,
  setSession,
  subscribe,
  type MeResponse,
} from './session'

export class LoginError extends Error {
  apiError: ApiError

  constructor(apiError: ApiError) {
    super(apiError.userMessage)
    this.apiError = apiError
  }
}

interface AuthContextValue {
  user: MeResponse | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(getUser())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = subscribe(() => setUser(getUser()))

    // Restore the session from the httpOnly refresh cookie on first load.
    refreshSession().finally(() => setIsLoading(false))

    return unsubscribe
  }, [])

  async function login(email: string, password: string) {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
    if (!response.ok) {
      throw new LoginError(await parseApiError(response))
    }
    const body = (await response.json()) as { accessToken: string; user: MeResponse }
    setSession(body.accessToken, body.user)
  }

  async function logout() {
    if (getAccessToken()) {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      }).catch(() => undefined)
    }
    clearSession()
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: user !== null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
