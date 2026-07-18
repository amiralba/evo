import { describe, expect, it } from 'vitest'
import { formatPct, formatVariance, utilizationBandInfo } from './format'

describe('formatPct', () => {
  it('formats with a percent sign and default 0 digits', () => {
    expect(formatPct(87.4)).toBe('%87')
  })

  it('supports custom digit precision', () => {
    expect(formatPct(87.45, 1)).toBe('%87.5')
  })
})

describe('formatVariance', () => {
  it('prefixes positive variance with a plus sign', () => {
    expect(formatVariance(12.3, 1)).toBe('+12.3%')
  })

  it('leaves negative variance with its own minus sign', () => {
    expect(formatVariance(-8, 0)).toBe('-8%')
  })

  it('does not add a sign for zero', () => {
    expect(formatVariance(0)).toBe('0%')
  })
})

describe('utilizationBandInfo', () => {
  it('maps ok to a green label', () => {
    expect(utilizationBandInfo('ok')).toEqual({ label: 'Uygun', color: '#2e7d32' })
  })

  it('maps under to an amber warning', () => {
    expect(utilizationBandInfo('under').label).toBe('Düşük Yük')
  })

  it('maps over to a red warning', () => {
    expect(utilizationBandInfo('over').label).toBe('Aşırı Yük')
  })

  it('falls back to the raw band value for unknown bands', () => {
    expect(utilizationBandInfo('weird')).toEqual({ label: 'weird', color: '#666666' })
  })
})
