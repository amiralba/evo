import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '../../i18n'
import { MobilityTable } from './MobilityTable'
import type { components } from '../../api/generated/schema'

type MerchandiserMobilityDto = components['schemas']['MerchandiserMobilityDto']

function makeMerch(overrides: Partial<MerchandiserMobilityDto>): MerchandiserMobilityDto {
  return {
    merchandiserId: crypto.randomUUID(),
    name: 'Ayşe Yılmaz',
    distinctRoutesHeld: 2,
    intraRouteReshuffles: 1,
    regionalMedianRoutesHeld: 1.5,
    outlier: false,
    ...overrides,
  }
}

describe('MobilityTable', () => {
  it('renders a row per merchandiser', () => {
    render(<MobilityTable merchandisers={[makeMerch({ name: 'Ayşe Yılmaz' }), makeMerch({ name: 'Mehmet Can' })]} />)
    expect(screen.getByText('Ayşe Yılmaz')).toBeTruthy()
    expect(screen.getByText('Mehmet Can')).toBeTruthy()
  })

  it('flags outlier rows distinctly with the review badge', () => {
    render(<MobilityTable merchandisers={[makeMerch({ name: 'Outlier Person', outlier: true })]} />)
    const row = screen.getByText('Outlier Person').closest('tr')
    expect(row?.className).toContain('outlier-row')
    expect(screen.getByText('gözden geçir')).toBeTruthy()
  })

  it('renders an empty state when there are no merchandisers', () => {
    render(<MobilityTable merchandisers={[]} />)
    expect(screen.getByText('Bu bölgede saha ekibi bulunamadı.')).toBeTruthy()
  })
})
