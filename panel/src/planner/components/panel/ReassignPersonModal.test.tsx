import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { ReassignPersonModal } from './ReassignPersonModal'
import * as queries from '../../api/queries'
import * as mutations from '../../api/mutations'

vi.mock('../../api/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/queries')>()
  return { ...actual, useMerchandisers: vi.fn() }
})
vi.mock('../../api/mutations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/mutations')>()
  return { ...actual, useReassignRoute: vi.fn() }
})

afterEach(cleanup)

const MERCHANDISERS = [
  { id: 'm1', name: 'Ayşe K.', active: true, activeRouteCode: null },
  { id: 'm2', name: 'Mehmet D.', active: true, activeRouteCode: 'ANK-02' },
]

describe('ReassignPersonModal', () => {
  it('disables Kaydet until both a person and a reason are chosen', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useMerchandisers).mockReturnValue({ data: MERCHANDISERS, isLoading: false } as any)
    const mutate = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mutations.useReassignRoute).mockReturnValue({ mutate, isPending: false } as any)

    render(<ReassignPersonModal routeId="r1" routeCode="ANK-01" currentMerchandiserName={null} onClose={() => {}} />)

    const saveButton = screen.getByText('Kaydet') as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)

    fireEvent.click(screen.getByText('Ayşe K.'))
    expect(saveButton.disabled).toBe(true)

    fireEvent.change(screen.getByDisplayValue('seç…'), { target: { value: '4' } })
    expect(saveButton.disabled).toBe(false)
  })

  it('shows a busy merchandiser as disabled and does not select it', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useMerchandisers).mockReturnValue({ data: MERCHANDISERS, isLoading: false } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mutations.useReassignRoute).mockReturnValue({ mutate: vi.fn(), isPending: false } as any)

    render(<ReassignPersonModal routeId="r1" routeCode="ANK-01" currentMerchandiserName={null} onClose={() => {}} />)

    expect(screen.getByText(/meşgul: ANK-02/)).toBeTruthy()

    fireEvent.click(screen.getByText('Mehmet D.'))
    fireEvent.change(screen.getByDisplayValue('seç…'), { target: { value: '4' } })
    expect((screen.getByText('Kaydet') as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls the mutation with merchandiserId and reason on commit', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useMerchandisers).mockReturnValue({ data: MERCHANDISERS, isLoading: false } as any)
    const mutate = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mutations.useReassignRoute).mockReturnValue({ mutate, isPending: false } as any)

    render(<ReassignPersonModal routeId="r1" routeCode="ANK-01" currentMerchandiserName={null} onClose={() => {}} />)

    fireEvent.click(screen.getByText('Ayşe K.'))
    fireEvent.change(screen.getByDisplayValue('seç…'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('Kaydet'))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ merchandiserId: 'm1', reason: 2 }),
      expect.anything(),
    )
  })
})
