/** Statutory break blocks, matching 005's seeded break_blocks (clarification #12 — /plan returns
 * visits only, so these are rendered from a shared client constant rather than an API call). */
export interface BreakBlock {
  label: string
  startMinutes: number
  endMinutes: number
}

export const BREAK_BLOCKS: BreakBlock[] = [
  { label: 'Çay', startMinutes: 10 * 60 + 30, endMinutes: 10 * 60 + 45 },
  { label: 'Öğle', startMinutes: 12 * 60 + 30, endMinutes: 13 * 60 + 30 },
  { label: 'Çay', startMinutes: 15 * 60, endMinutes: 15 * 60 + 15 },
]
