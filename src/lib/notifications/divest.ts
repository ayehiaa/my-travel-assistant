import type { ShariahScreeningResult } from '@/types/shariah'
import type { ActionItem } from '@/types/database'
import type { DivestItem } from './types'

/**
 * Holdings whose Shariah status changed from compliant (previous complete recommendation's stored screening) to
 * non-compliant (this run's screening). Only CURRENT holdings (is_holding in this run) count, and only tickers present
 * in BOTH screenings — a holding screened for the first time, or a previous recommendation without stored screening,
 * never produces a "status change".
 */
export function detectDivestments(
  previous: ShariahScreeningResult | null,
  current: ShariahScreeningResult | null,
  actionList: ActionItem[] | null | undefined,
): DivestItem[] {
  if (!previous || !current) return []
  const prevVerdict = new Map(previous.tickers.map(t => [t.ticker.toUpperCase(), t.verdict]))
  const sells = new Set(
    (actionList ?? []).filter(a => a.action === 'sell').map(a => a.ticker.toUpperCase()),
  )
  const seen = new Set<string>()
  const items: DivestItem[] = []
  for (const t of current.tickers) {
    const ticker = t.ticker.toUpperCase()
    if (seen.has(ticker)) continue
    if (!t.is_holding || t.verdict !== 'non_compliant') continue
    if (prevVerdict.get(ticker) !== 'compliant') continue
    seen.add(ticker)
    items.push({
      ticker,
      name:     t.name,
      reasons:  t.reasons.length > 0 ? t.reasons : ['Failed Shariah screening'],
      has_sell: sells.has(ticker),
    })
  }
  return items.sort((a, b) => a.ticker.localeCompare(b.ticker))
}
