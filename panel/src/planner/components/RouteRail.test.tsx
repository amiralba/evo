import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { RouteRail } from './RouteRail'
import * as queries from '../api/queries'

vi.mock('../api/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/queries')>()
  return { ...actual, useRoutes: vi.fn(), useStoresGeo: vi.fn() }
})

afterEach(cleanup)

describe('RouteRail', () => {
  it('shows assignee, revenue in K, target-met icon, and point count — not route name/status', () => {
     
    vi.mocked(queries.useRoutes).mockReturnValue({
      data: {
        items: [
          { id: 'r1', routeCode: 'ANK-01', name: 'Ankara Route 1', status: 2, stopCount: 4, merchandiserName: 'Ayşe K.', sixMonthRevenue: 957000, revenueTarget: 1000000 },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useStoresGeo).mockReturnValue({ data: [] } as any)

    render(<RouteRail />)

    const subtitle = screen.getByText(/Ayşe K\./)
    expect(subtitle.textContent).toContain('957K')
    expect(subtitle.textContent).toContain('⚠️')
    expect(subtitle.textContent).toContain('4')
    expect(subtitle.textContent).not.toContain('Ankara Route 1')
  })

  it('shows "kişi yok" when no merchandiser is assigned, and ✅ when target is met', () => {
     
    vi.mocked(queries.useRoutes).mockReturnValue({
      data: {
        items: [
          { id: 'r2', routeCode: 'ANK-02', name: 'Ankara Route 2', status: 2, stopCount: 2, merchandiserName: null, sixMonthRevenue: 1200000, revenueTarget: 1000000 },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useStoresGeo).mockReturnValue({ data: [] } as any)

    render(<RouteRail />)

    const subtitle = screen.getByText(/kişi yok/)
    expect(subtitle.textContent).toContain('✅')
  })

  it('renders a "+ Yeni rut" trigger', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useRoutes).mockReturnValue({ data: { items: [] } } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useStoresGeo).mockReturnValue({ data: [] } as any)

    render(<RouteRail />)

    expect(screen.getByTestId('new-route-trigger')).toBeTruthy()
  })

  it('shows "Havuz boş 🎉" when the pool is empty', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useRoutes).mockReturnValue({ data: { items: [] } } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useStoresGeo).mockReturnValue({ data: [] } as any)

    render(<RouteRail />)
    fireEvent.click(screen.getByText(/Havuz/))

    expect(screen.getByText('Havuz boş 🎉')).toBeTruthy()
  })

  it('clicking a pool store focuses it (workspaceStore.focusStore)', async () => {
    const { useWorkspaceStore } = await import('../state/workspaceStore')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useRoutes).mockReturnValue({ data: { items: [] } } as any)
    vi.mocked(queries.useStoresGeo).mockReturnValue({
      data: [{ id: 's1', name: 'Migros Kadıköy', category: 1, chainName: 'Migros', activeRouteId: null }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<RouteRail />)
    fireEvent.click(screen.getByText(/Havuz/))
    fireEvent.click(screen.getByTestId('pool-store-item'))

    expect(useWorkspaceStore.getState().focusedStoreId).toBe('s1')
  })
})
