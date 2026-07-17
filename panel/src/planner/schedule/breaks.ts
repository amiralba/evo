/** Statutory break blocks, matching the seeded break_blocks setting (EvoDbContext.cs) — /plan
 * returns visits only, so these are rendered from a shared client constant rather than an API
 * call (clarification #12). Tea breaks were removed (2026-07-17); only the mandatory lunch
 * break remains. */
export interface BreakBlock {
  label: string
  startMinutes: number
  endMinutes: number
}

export const BREAK_BLOCKS: BreakBlock[] = [
  { label: 'Öğle', startMinutes: 12 * 60 + 30, endMinutes: 13 * 60 + 15 },
]
