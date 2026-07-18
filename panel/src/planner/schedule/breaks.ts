/** Statutory break blocks, matching the seeded break_blocks setting (EvoDbContext.cs) — /plan
 * returns visits only, so these are rendered from a shared client constant rather than an API
 * call (clarification #12). All breaks (tea and lunch) were removed (2026-07-18) to match the
 * prototype, which never models a break block. */
export interface BreakBlock {
  label: string
  startMinutes: number
  endMinutes: number
}

export const BREAK_BLOCKS: BreakBlock[] = []
