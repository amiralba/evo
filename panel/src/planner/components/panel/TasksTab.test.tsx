import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { TasksTab } from './TasksTab'
import * as queries from '../../api/queries'

vi.mock('../../api/queries', () => ({ useStoreTaskPlan: vi.fn(), useStoreDetail: vi.fn(), useRuleImpact: vi.fn() }))
vi.mock('../../api/mutations', () => ({ useUpdateTaskInstanceScope: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false })) }))

afterEach(cleanup)

describe('TasksTab', () => {
  it('renders task rows with duration + source pill and a visit total equal to the sum', () => {
    vi.mocked(queries.useStoreTaskPlan).mockReturnValue({
      data: {
        storeId: 'store-1',
        date: '2026-07-17',
        visitTotalMinutes: 30,
        tasks: [
          {
            templateId: 't1',
            code: 'SHELF_WORK',
            name: 'Raf Düzeni',
            minutes: 20,
            trace: [
              { layer: 'template default', op: 'SetMinutes', before: 20, after: 20 },
              { layer: 'Format', op: 'ScaleMinutes', before: 20, after: 20 },
            ],
          },
          {
            templateId: 't2',
            code: 'SURVEY',
            name: 'Anket',
            minutes: 10,
            trace: [{ layer: 'template default', op: 'SetMinutes', before: 10, after: 10 }],
          },
        ],
      },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<TasksTab routeId="route-1" storeId="store-1" date="2026-07-17" />)

    expect(screen.getByText('Raf Düzeni')).toBeTruthy()
    expect(screen.getByText('Anket')).toBeTruthy()
    expect(screen.getAllByText('20 dk').length).toBeGreaterThan(0)
    expect(screen.getAllByText('10 dk').length).toBeGreaterThan(0)
    expect(screen.getByText('30 dk')).toBeTruthy()
  })

  it('shows the empty state when there are no resolved tasks', () => {
    vi.mocked(queries.useStoreTaskPlan).mockReturnValue({
      data: { storeId: 'store-1', date: '2026-07-17', visitTotalMinutes: 0, tasks: [] },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<TasksTab routeId="route-1" storeId="store-1" date="2026-07-17" />)

    expect(screen.getByText(/görev bulunamadı/)).toBeTruthy()
  })
})
