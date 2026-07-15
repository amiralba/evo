import { afterEach, describe, expect, it, vi } from 'vitest'
import { getHealth } from './client'

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
})
