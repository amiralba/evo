import { act, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { clearSession } from './session'

function Probe() {
  const { isAuthenticated, user, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="email">{user?.email ?? ''}</span>
      <button onClick={() => login('a@evo.local', 'pw')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  )
}

describe('AuthProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearSession()
  })

  it('login stores the token/user in memory; logout clears it', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/auth/refresh') {
        return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) })
      }
      if (url === '/api/v1/auth/login') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              accessToken: 'token-123',
              expiresAt: new Date().toISOString(),
              user: { id: '1', email: 'a@evo.local', displayName: 'A', roles: ['Supervisor'] },
            }),
        })
      }
      if (url === '/api/v1/auth/logout') {
        return Promise.resolve({ ok: true, status: 204 })
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId, getByText } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(getByTestId('authed').textContent).toBe('false'))

    await act(async () => {
      getByText('login').click()
    })
    await waitFor(() => expect(getByTestId('authed').textContent).toBe('true'))
    expect(getByTestId('email').textContent).toBe('a@evo.local')

    await act(async () => {
      getByText('logout').click()
    })
    await waitFor(() => expect(getByTestId('authed').textContent).toBe('false'))
  })
})
