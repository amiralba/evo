import { afterEach, describe, expect, it, vi } from 'vitest'
import { getHealth } from './client'
import { clearSession, getAccessToken, setSession } from '../auth/session'

describe('getHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the parsed health body on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok', version: '1.0.0.0' }),
      }),
    )

    const result = await getHealth()

    expect(result).toEqual({ status: 'ok', version: '1.0.0.0' })
  })

  it('throws when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      }),
    )

    await expect(getHealth()).rejects.toThrow('Health check failed: 500')
  })

  it('on 401, refreshes once then retries the original request', async () => {
    setSession('stale-token', { id: '1', email: 'a@evo.local', displayName: 'A', roles: [] })

    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        calls.push(url)
        if (url === '/api/v1/health' && calls.filter((c) => c === '/api/v1/health').length === 1) {
          return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) })
        }
        if (url === '/api/v1/auth/refresh') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                accessToken: 'fresh-token',
                expiresAt: new Date().toISOString(),
                user: { id: '1', email: 'a@evo.local', displayName: 'A', roles: [] },
              }),
          })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'ok', version: '1.0.0.0' }) })
      }),
    )

    const result = await getHealth()

    expect(result).toEqual({ status: 'ok', version: '1.0.0.0' })
    expect(calls).toEqual(['/api/v1/health', '/api/v1/auth/refresh', '/api/v1/health'])
    expect(getAccessToken()).toBe('fresh-token')
  })

  it('on 401 with a failed refresh, clears the session and redirects to /login', async () => {
    setSession('stale-token', { id: '1', email: 'a@evo.local', displayName: 'A', roles: [] })
    const assignSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign: assignSpy })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === '/api/v1/auth/refresh') {
          return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) })
        }
        return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) })
      }),
    )

    await expect(getHealth()).rejects.toThrow()

    expect(getAccessToken()).toBeNull()
    expect(assignSpy).toHaveBeenCalledWith('/login')

    clearSession()
  })
})
