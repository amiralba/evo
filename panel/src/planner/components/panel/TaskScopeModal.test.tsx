import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { TaskScopeModal } from './TaskScopeModal'
import * as queries from '../../api/queries'
import * as mutations from '../../api/mutations'

vi.mock('../../api/queries', () => ({ useStoreDetail: vi.fn(), useRuleImpact: vi.fn() }))
vi.mock('../../api/mutations', () => ({ useUpdateTaskInstanceScope: vi.fn() }))

afterEach(cleanup)

function mockMutation() {
  return {
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const task = { templateId: 't1', code: 'SHELF_WORK', name: 'Raf Düzeni', minutes: 20, trace: [], taskInstanceId: 'ti-1' }

describe('TaskScopeModal', () => {
  it('renders scope radios and shows the impact preview once a store-scope rule is selected', async () => {
    vi.mocked(queries.useStoreDetail).mockReturnValue({ data: { format: 3 } } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useRuleImpact).mockReturnValue({
      data: { stores: 5, visitsPerWeek: 20, deltaMinutesPerWeek: 100, daysOver450: 1 },
      isLoading: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(mutations.useUpdateTaskInstanceScope).mockReturnValue(mockMutation())

    render(<TaskScopeModal routeId="route-1" storeId="store-1" date="2026-07-17" task={task} onClose={() => {}} />)

    expect(screen.getByText(/Sadece bu ziyaret/)).toBeTruthy()
    expect(screen.getByText(/Bu mağaza için/)).toBeTruthy()

    const storeRuleRadio = screen.getByLabelText(/Bu mağaza için/)
    fireEvent.click(storeRuleRadio)

    await waitFor(() => expect(screen.getByText(/Etki önizlemesi/)).toBeTruthy())
    expect(screen.getByText(/5 mağaza/)).toBeTruthy()
  })

  it('calls the update mutation with the chosen scope on Save', () => {
    vi.mocked(queries.useStoreDetail).mockReturnValue({ data: { format: 3 } } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useRuleImpact).mockReturnValue({ data: undefined, isLoading: false } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    const mutation = mockMutation()
    vi.mocked(mutations.useUpdateTaskInstanceScope).mockReturnValue(mutation)

    render(<TaskScopeModal routeId="route-1" storeId="store-1" date="2026-07-17" task={task} onClose={() => {}} />)

    fireEvent.click(screen.getByText('Kaydet'))

    expect(mutation.mutate).toHaveBeenCalledWith({
      taskInstanceId: 'ti-1',
      body: { minutes: 20, scope: 'INSTANCE' },
    })
  })
})
