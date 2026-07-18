import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { OnarimWorkbench } from './OnarimWorkbench'
import * as queries from './api/queries'
import * as mutations from './api/mutations'

vi.mock('./api/queries', () => ({ useDisruptions: vi.fn(), useAffectedVisits: vi.fn() }))
vi.mock('./api/mutations', () => ({ useApplyOnarim: vi.fn() }))

afterEach(cleanup)

const CANDIDATES = [
  { merchandiserId: 'm1', name: 'Ayşe', routeId: 'r1', available: true, capacityMinutesAfterMove: 60, withinCapacity: true, regionProximity: 'same_province', reasoning: 'Ayşe has 60 min spare capacity.', rank: 1 },
  { merchandiserId: 'm2', name: 'Mehmet', routeId: null, available: false, capacityMinutesAfterMove: -10, withinCapacity: false, regionProximity: 'other_province', reasoning: 'Mehmet is over capacity.', rank: 2 },
]

const ROWS = [
  { plannedVisitId: 'v1', routeId: 'ra', routeCode: 'R-1', storeId: 's1', storeName: 'Migros Kadıköy', date: '2026-07-20', startMinutes: 540, plannedMinutes: 30, candidates: CANDIDATES },
]

function mockAffected(rows = ROWS) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(queries.useAffectedVisits).mockReturnValue({ data: rows, isLoading: false } as any)
}

describe('OnarimWorkbench', () => {
  it('lists candidates ranked with their reasoning', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useDisruptions).mockReturnValue({ data: [], isLoading: false } as any)
    mockAffected()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mutations.useApplyOnarim).mockReturnValue({ mutate: vi.fn(), isPending: false, isSuccess: false } as any)

    render(<OnarimWorkbench onClose={() => {}} initialDisruptionId="d1" />)

    fireEvent.change(screen.getByDisplayValue('Eylem seçin'), { target: { value: '4' } })
    expect(screen.getByText(/Ayşe has 60 min spare capacity\./)).toBeTruthy()
  })

  it('enables the row once an action is chosen for Skip', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useDisruptions).mockReturnValue({ data: [], isLoading: false } as any)
    mockAffected()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mutations.useApplyOnarim).mockReturnValue({ mutate: vi.fn(), isPending: false, isSuccess: false } as any)

    render(<OnarimWorkbench onClose={() => {}} initialDisruptionId="d1" />)

    const row = screen.getByTestId('affected-visit-row')
    expect(row.textContent).toContain('🔴')

    fireEvent.change(screen.getByDisplayValue('Eylem seçin'), { target: { value: '1' } })
    expect(screen.queryByTestId('affected-visit-row')?.textContent).not.toContain('🔴')
  })

  it('disables Apply until reason and objective are filled', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useDisruptions).mockReturnValue({ data: [], isLoading: false } as any)
    mockAffected()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mutations.useApplyOnarim).mockReturnValue({ mutate: vi.fn(), isPending: false, isSuccess: false } as any)

    render(<OnarimWorkbench onClose={() => {}} initialDisruptionId="d1" />)

    const applyButton = screen.getByTestId('onarim-apply') as HTMLButtonElement
    expect(applyButton.disabled).toBe(true)

    fireEvent.change(screen.getByDisplayValue('Eylem seçin'), { target: { value: '1' } })
    expect(applyButton.disabled).toBe(true)

    const textareas = screen.getAllByRole('textbox')
    fireEvent.change(textareas[0], { target: { value: 'Merchandiser sick' } })
    fireEvent.change(textareas[1], { target: { value: 'Keep coverage' } })

    expect(applyButton.disabled).toBe(false)
  })
})
