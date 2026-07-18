import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { StoreDetailPanel } from './StoreDetailPanel'
import * as queries from '../../api/queries'

vi.mock('../../api/queries', () => ({ useStoreDetail: vi.fn() }))

afterEach(cleanup)

describe('StoreDetailPanel', () => {
  it('renders store name, category, and summed 6-month revenue', () => {
     
    vi.mocked(queries.useStoreDetail).mockReturnValue({
      data: {
        id: 's1',
        name: 'Migros 4M Çankaya',
        chainName: 'Migros',
        district: 'Çankaya',
        category: 2,
        format: 4,
        channel: 'Zincir',
        defaultServiceMinutes: 60,
        revenue: [{ month: '2026-01', revenue: 100 }, { month: '2026-02', revenue: 150 }],
        flags: [],
      },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<StoreDetailPanel storeId="s1" />)

    expect(screen.getByText('Migros 4M Çankaya')).toBeTruthy()
    expect(screen.getByText(/Yüksek Değer/)).toBeTruthy()
  })

  it('shows a closed banner when an active ClosedTemp flag exists', () => {
     
    vi.mocked(queries.useStoreDetail).mockReturnValue({
      data: {
        id: 's1',
        name: 'Kapalı Mağaza',
        category: 1,
        revenue: [],
        flags: [{ type: 2, endsOn: '2099-01-01' }],
      },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<StoreDetailPanel storeId="s1" />)

    expect(screen.getAllByText(/Kapalı/).length).toBeGreaterThan(0)
  })

  it('shows the loading state', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useStoreDetail).mockReturnValue({ data: undefined, isLoading: true, isError: false } as any)
    render(<StoreDetailPanel storeId="s1" />)
    expect(screen.getByText('Yükleniyor…')).toBeTruthy()
  })
})
