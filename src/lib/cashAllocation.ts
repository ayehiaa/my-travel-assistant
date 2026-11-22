import { z } from 'zod'

/**
 * Explicit cash in the target allocation (specs/031).
 *
 * The synthesizer returns stock weights plus a separate `cash_target_pct`. Cash is NEVER a ticker: any allocation
 * entry whose "ticker" is a reserved cash word is converted into cash and is never validated, screened or bought.
 * Note: "CASH" is a real NASDAQ symbol (Pathward Financial, a bank) — buying it because the model meant "cash" must be
 * impossible, so the execution buy guard also refuses every reserved word (see getBuyBlockReason).
 */

/**
 * Reserved words (compared after normalisation: upper-case, `_`/`-`/`.` and repeated spaces → one space, trimmed).
 * Plus: any value containing the word CASH or the phrase MONEY MARKET (e.g. "CASH RESERVE", "Cash (USD)").
 */
export const RESERVED_CASH_WORDS: readonly string[] = [
  'CASH', 'USD', '$', 'US$', 'US DOLLAR', 'US DOLLARS', 'DOLLAR', 'DOLLARS',
  'MONEY MARKET', 'MONEY MARKET FUND', 'MMF', 'MMKT', 'SWEEP', 'CASH SWEEP',
  'CASH EQUIVALENT', 'CASH EQUIVALENTS', 'CASH RESERVE', 'RESERVE', 'UNINVESTED',
  // Common broker sweep / money-market fund symbols
  'SPAXX', 'VMFXX', 'SWVXX', 'FDRXX', 'SPRXX', 'FZFXX', 'VMRXX', 'SNVXX', 'TTTXX', 'SNSXX', 'FCASH',
]

const RESERVED_SET = new Set(RESERVED_CASH_WORDS)

/** Internal key of the cash row in allocation views — cannot collide with a real ticker (tickers have no `_`). */
export const CASH_ROW_KEY = '__cash__'

function normalise(value: string): string {
  return value.toUpperCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** True when `ticker` is a reserved cash word (or the internal cash row key). Pure. */
export function isReservedCashWord(ticker: string | null | undefined): boolean {
  if (typeof ticker !== 'string') return false
  if (ticker === CASH_ROW_KEY) return true
  const n = normalise(ticker)
  if (n === '') return false
  if (RESERVED_SET.has(n)) return true
  // Words split on anything that is not a letter, so "CASH(USD)" and "CASH/RESERVE" are caught too
  const words = n.split(/[^A-Z]+/).filter(Boolean)
  if (words.includes('CASH')) return true
  return n.includes('MONEY MARKET')
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, v))
}

export interface AllocationWithCash<T extends { ticker: string; target_pct: number }> {
  stocks: T[]
  cash_target_pct: number
}

/**
 * Move every reserved-word entry out of the allocation into cash. Pure.
 * cash = explicit cash + weights of the reserved entries (clamped to 0–100).
 */
export function extractCashEntries<T extends { ticker: string; target_pct: number }>(
  items: T[],
  explicitCashPct = 0,
): AllocationWithCash<T> {
  let cash = clampPct(explicitCashPct)
  const stocks: T[] = []
  for (const item of items) {
    if (isReservedCashWord(item.ticker)) cash += Math.max(0, Number.isFinite(item.target_pct) ? item.target_pct : 0)
    else stocks.push(item)
  }
  return { stocks, cash_target_pct: clampPct(cash) }
}

/** Scale `items` so they sum to exactly `total` (rounding absorbed by the largest position). Pure. */
export function scaleAllocationTo<T extends { target_pct: number }>(items: T[], total: number): T[] {
  const sum = items.reduce((s, a) => s + a.target_pct, 0)
  if (items.length === 0 || sum <= 0 || Math.abs(sum - total) < 1e-9) return items
  const scaled = items.map(a => ({ ...a, target_pct: (a.target_pct * total) / sum }))
  const diff = total - scaled.reduce((s, a) => s + a.target_pct, 0)
  const maxIdx = scaled.reduce((mi, a, i) => (a.target_pct > scaled[mi].target_pct ? i : mi), 0)
  scaled[maxIdx] = { ...scaled[maxIdx], target_pct: scaled[maxIdx].target_pct + diff }
  return scaled
}

/**
 * Normalise stocks + cash to exactly 100 together (the synthesizer may be off by a few points). Pure.
 * With no positive stock weights the stocks are returned as-is and cash is clamped (the run fails later on
 * "no valid tickers" — an all-cash recommendation is never produced automatically).
 */
export function normaliseWithCash<T extends { target_pct: number }>(
  stocks: T[],
  cashPct: number,
): { stocks: T[]; cash_target_pct: number } {
  const positive = stocks.filter(s => s.target_pct > 0)
  const cash = clampPct(cashPct)
  const stockSum = positive.reduce((s, a) => s + a.target_pct, 0)
  const total = stockSum + cash
  if (positive.length === 0 || total <= 0) return { stocks: positive, cash_target_pct: cash }
  const factor = 100 / total
  const scaledCash = cash * factor
  return { stocks: scaleAllocationTo(positive, 100 - scaledCash), cash_target_pct: scaledCash }
}

/**
 * Stock weights after removals: the remaining stocks are rescaled to fill (100 − cash) so the removed weight is
 * redistributed proportionally among the remaining stocks (cash unchanged). Pure.
 */
export function rescaleStocksToCash<T extends { target_pct: number }>(stocks: T[], cashPct: number): T[] {
  return scaleAllocationTo(stocks.filter(s => s.target_pct > 0), Math.max(0, 100 - clampPct(cashPct)))
}

/** Cash implied by stock weights: whatever they leave over (used after the per-stock cap). Pure. */
export function residualCashPct(stocks: Array<{ target_pct: number }>): number {
  const sum = stocks.reduce((s, a) => s + (Number.isFinite(a.target_pct) ? a.target_pct : 0), 0)
  return Math.max(0, Math.min(100, 100 - sum))
}

// ── Stored on the recommendation (agent_outputs.cash_allocation — no migration) ─────────────────────────────

export const CashAllocationSchema = z.object({
  version:         z.literal(1),
  cash_target_pct: z.number().min(0).max(100),
  /** Reserved-word entries the synthesizer put into target_allocation (converted into cash). */
  converted:       z.array(z.string()).default([]),
})
export type StoredCashAllocation = z.infer<typeof CashAllocationSchema>

/**
 * The explicit cash target stored on a recommendation, or null for a recommendation created before specs/031
 * (then cash's target is whatever the stock targets leave over). Pure.
 */
export function readCashTargetPct(rec: { agent_outputs?: unknown } | null | undefined): number | null {
  const outputs = rec?.agent_outputs
  if (!outputs || typeof outputs !== 'object') return null
  const parsed = CashAllocationSchema.safeParse((outputs as Record<string, unknown>).cash_allocation)
  return parsed.success ? parsed.data.cash_target_pct : null
}
