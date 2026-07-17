const tryFormatter = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })

export function formatTRY(n: number): string {
  return tryFormatter.format(n)
}

export function formatMinutes(n: number): string {
  return `${n} dk`
}
