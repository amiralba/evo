import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '../../i18n'
import { PlanHealthTable } from './PlanHealthTable'
import type { components } from '../../api/generated/schema'

type RoutePlanHealthDto = components['schemas']['RoutePlanHealthDto']

function makeRoute(overrides: Partial<RoutePlanHealthDto>): RoutePlanHealthDto {
  return {
    routeId: crypto.randomUUID(),
    routeCode: 'R-1',
    routeName: 'Route 1',
    province: 'Istanbul',
    completionPct: 90,
    plannedMinutes: 400,
    realizedMinutes: 380,
    durationVariancePct: -5,
    utilizationPct: 95,
    utilizationBand: 'ok',
    taskCompliancePct: 88,
    patchLoad: { SkipStore: 1 },
    stabilityScore: 92,
    assignmentTurnover: 0,
    overrideRatePct: 2,
    planHealthScore: 80,
    ...overrides,
  }
}

describe('PlanHealthTable', () => {
  it('renders rows sorted by planHealthScore descending', () => {
    const low = makeRoute({ routeCode: 'LOW', planHealthScore: 40 })
    const high = makeRoute({ routeCode: 'HIGH', planHealthScore: 95 })
    render(<PlanHealthTable routes={[low, high]} />)

    const cells = screen.getAllByRole('row').slice(1).map((row) => row.textContent ?? '')
    expect(cells[0]).toContain('HIGH')
    expect(cells[1]).toContain('LOW')
  })

  it('maps the utilization band to its pill label', () => {
    render(<PlanHealthTable routes={[makeRoute({ utilizationBand: 'over' })]} />)
    expect(screen.getByText('Aşırı Yük')).toBeTruthy()
  })

  it('renders an empty state when there are no routes', () => {
    render(<PlanHealthTable routes={[]} />)
    expect(screen.getByText('Bu bölgede rota bulunamadı.')).toBeTruthy()
  })
})
