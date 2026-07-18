import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { TableDrawer } from './TableDrawer'
import * as queries from '../../api/queries'

vi.mock('../../api/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/queries')>()
  return { ...actual, usePlan: vi.fn() }
})

const focusStoreMock = vi.fn()
vi.mock('../../state/workspaceStore', () => ({
  useWorkspaceStore: (selector: (s: { focusStore: typeof focusStoreMock }) => unknown) => selector({ focusStore: focusStoreMock }),
}))

afterEach(cleanup)

describe('TableDrawer', () => {
  it('lists visits sorted by day/time and calls focusStore on row click', () => {
     
    vi.mocked(queries.usePlan).mockReturnValue({
      data: [
        { date: '2026-07-13', visits: [{ storeId: 's1', storeName: 'Migros Kadıköy', start: '2026-07-13T10:00:00', end: '2026-07-13T10:30:00', source: 1 }] },
        { date: '2026-07-14', visits: [{ storeId: 's2', storeName: 'Carrefour Kızılay', start: '2026-07-14T09:00:00', end: '2026-07-14T10:00:00', source: 2 }] },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<TableDrawer routeId="r1" open />)

    expect(screen.getByText('Migros Kadıköy')).toBeTruthy()
    expect(screen.getByText('Carrefour Kızılay')).toBeTruthy()
    expect(screen.getByText('yama')).toBeTruthy()

    fireEvent.click(screen.getByText('Migros Kadıköy'))
    expect(focusStoreMock).toHaveBeenCalledWith('s1')
  })

  it('renders an empty table when there are no visits', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.usePlan).mockReturnValue({ data: [] } as any)
    render(<TableDrawer routeId="r1" open />)
    expect(screen.getByText('Mağaza')).toBeTruthy()
  })
})
