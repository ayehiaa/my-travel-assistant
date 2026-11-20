import type { TargetAllocationItem } from '@/types/database'

/**
 * Scale an allocation so its percentages sum to exactly 100.
 * Floating-point rounding is absorbed into the largest position.
 * Returns the input unchanged when it is empty, sums to <= 0, or already sums to ~100 (>= 99.5).
 * Pure function.
 */
export function renormaliseAllocation<T extends { target_pct: number }>(items: T[]): T[] {
  const total = items.reduce((s, a) => s + a.target_pct, 0)
  if (items.length === 0 || total <= 0 || total >= 99.5) return items

  const scale  = 100 / total
  const scaled = items.map(a => ({ ...a, target_pct: a.target_pct * scale }))
  const scaledTotal = scaled.reduce((s, a) => s + a.target_pct, 0)
  const diff   = 100 - scaledTotal
  const maxIdx = scaled.reduce((mi, a, i) => (a.target_pct > scaled[mi].target_pct ? i : mi), 0)
  scaled[maxIdx] = { ...scaled[maxIdx], target_pct: scaled[maxIdx].target_pct + diff }
  return scaled
}

/**
 * Cap every position at `capPct`, redistributing the excess proportionally to positions
 * still under the cap (water-filling). When every position hits the cap the total stays
 * below 100 and the remainder is left as cash.
 * Pure function.
 */
export function capAllocation<T extends { target_pct: number }>(items: T[], capPct: number): T[] {
  const result = items.map(a => ({ ...a, target_pct: Math.max(0, a.target_pct) }))
  for (let iter = 0; iter < items.length + 1; iter++) {
    const excess = result.reduce((s, a) => s + Math.max(0, a.target_pct - capPct), 0)
    if (excess <= 1e-9) break
    for (const a of result) if (a.target_pct > capPct) a.target_pct = capPct
    const under = result.filter(a => a.target_pct < capPct - 1e-9)
    const underTotal = under.reduce((s, a) => s + a.target_pct, 0)
    if (under.length === 0) break
    for (const a of under) {
      const share = underTotal > 0 ? a.target_pct / underTotal : 1 / under.length
      a.target_pct += excess * share
    }
  }
  return result
}

/** Remove the given tickers from an allocation and renormalise the rest to 100. */
export function removeTickers(items: TargetAllocationItem[], remove: Set<string>): TargetAllocationItem[] {
  return renormaliseAllocation(items.filter(a => !remove.has(a.ticker)))
}
