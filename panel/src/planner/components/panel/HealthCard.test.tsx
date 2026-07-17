import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HealthCard } from './HealthCard'
import * as queries from '../../api/queries'

vi.mock('../../api/queries', () => ({ useHealth: vi.fn() }))

describe('HealthCard', () => {
  it('renders revenue, an over-450 weekday, and finding counts', () => {
    vi.mocked(queries.useHealth).mockReturnValue({
      data: {
        sixMonthRevenue: 1250000,
        revenueTarget: 1000000,
        revenueMet: true,
        minutesByWeekday: { Monday: 500, Tuesday: 400, Wednesday: 420, Thursday: 410, Friday: 430 },
        categoryMix: { Planned: 60, Variable: 40 },
        errorCount: 1,
        warningCount: 2,
      },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<HealthCard routeId="route-1" />)

    expect(screen.getByText(/1.250.000|1,250,000|₺/)).toBeTruthy()
    expect(screen.getByText('🔴 1')).toBeTruthy()
    expect(screen.getByText('🟡 2')).toBeTruthy()
  })
})
