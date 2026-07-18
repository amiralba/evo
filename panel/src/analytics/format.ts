export function formatPct(value: number, digits = 0): string {
  return `%${value.toFixed(digits)}`
}

export function formatVariance(pct: number, digits = 0): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(digits)}%`
}

export type UtilizationBandInfo = { label: string; color: string }

export function utilizationBandInfo(band: string): UtilizationBandInfo {
  switch (band) {
    case 'ok':
      return { label: 'Uygun', color: '#2e7d32' }
    case 'under':
      return { label: 'Düşük Yük', color: '#c77700' }
    case 'over':
      return { label: 'Aşırı Yük', color: '#c62828' }
    default:
      return { label: band, color: '#666666' }
  }
}
