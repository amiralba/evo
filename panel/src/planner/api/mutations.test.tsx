import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { useBulkAddStops, useReorderStops } from './mutations'
import * as planner from '../../api/planner'

vi.mock('../../api/planner')

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('mutations invalidation', () => {
  it('useBulkAddStops invalidates route/plan/health/stores-geo on success', async () => {
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    vi.mocked(planner.bulkAddStops).mockResolvedValue({ added: ['s1'], rejected: [] })

    const { result } = renderHook(() => useBulkAddStops('route-1', 'Ankara'), {
      wrapper: wrapper(queryClient),
    })

    result.current.mutate({ storeIds: ['s1'], frequency: 2, weekdayMask: 0, serviceMinutes: null })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['route', 'route-1'])
    expect(keys).toContainEqual(['plan', 'route-1'])
    expect(keys).toContainEqual(['health', 'route-1'])
    expect(keys).toContainEqual(['stores-geo', 'Ankara'])
  })

  it('useReorderStops invalidates route/plan/health/stores-geo on success', async () => {
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    vi.mocked(planner.reorderStops).mockResolvedValue({ id: 'route-1', stops: [] })

    const { result } = renderHook(() => useReorderStops('route-1', 'Ankara'), {
      wrapper: wrapper(queryClient),
    })

    result.current.mutate(['stop-1', 'stop-2'])

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['route', 'route-1'])
    expect(keys).toContainEqual(['plan', 'route-1'])
    expect(keys).toContainEqual(['health', 'route-1'])
    expect(keys).toContainEqual(['stores-geo', 'Ankara'])
  })
})
