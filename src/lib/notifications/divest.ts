import type { ShariahScreeningResult, TickerScreening } from '@/types/shariah'
import type { ActionItem } from '@/types/database'
import type { DivestItem } from './types'

/**
 * Holdings whose Shariah status changed from compliant (previous complete recommendation's stored screening) to
 * non-compliant (this run's screening). Only CURRENT holdings (is_holding in this run) count, and only tickers present
 * in BOTH screenings — a holding screened for the first time, or a previous recommendation without stored screening,
 * never produces a "status change".
 */
/**
 * Why a holding failed an APPLIED Islamic part (business / financial) of its screening, or null when it did not
 * (a stocks-only failure or a disabled part is not a Shariah divest — specs/030). Legacy screenings without per-part
 * checks keep the spec-023 rule: any non-compliant verdict.
 */
export function islamicFailureReasons(t: TickerScreening): string[] | null {
  if (t.verdict !== 'non_compliant') return null
  if (!t.checks) return t.reasons.length > 0 ? t.reasons : ['Failed Shariah screening']
  const reasons: string[] = []
  for (const c of [t.checks.business, t.checks.financial]) {
    if (c.applied && c.outcome === 'fail') reasons.push(...c.reasons)
  }
  if (reasons.length > 0) return reasons
  const failedIslamic = (t.checks.business.applied && t.checks.business.outcome === 'fail') ||
    (t.checks.financial.applied && t.checks.financial.outcome === 'fail')
  return failedIslamic ? ['Failed Shariah screening'] : null
}

/** False when the screening ran with Islamic screening off (specs/030). Legacy screenings were always on. */
export function islamicScreeningWasOn(screening: ShariahScreeningResult): boolean {
  return screening.config ? screening.config.islamic : true
}

export function detectDivestments(
  previous: ShariahScreeningResult | null,
  current: ShariahScreeningResult | null,
  actionList: ActionItem[] | null | undefined,
): DivestItem[] {
  if (!previous || !current) return []
  // Shariah divest alerts only when this run screened with Islamic screening on (specs/030).
  if (!islamicScreeningWasOn(current)) return []
  const prevVerdict = new Map(previous.tickers.map(t => [t.ticker.toUpperCase(), t.verdict]))
  const sells = new Set(
    (actionList ?? []).filter(a => a.action === 'sell').map(a => a.ticker.toUpperCase()),
  )
  const seen = new Set<string>()
  const items: DivestItem[] = []
  for (const t of current.tickers) {
    const ticker = t.ticker.toUpperCase()
    if (seen.has(ticker)) continue
    if (!t.is_holding) continue
    const reasons = islamicFailureReasons(t)
    if (!reasons) continue
    if (prevVerdict.get(ticker) !== 'compliant') continue
    seen.add(ticker)
    items.push({
      ticker,
      name:     t.name,
      reasons,
      has_sell: sells.has(ticker),
    })
  }
  return items.sort((a, b) => a.ticker.localeCompare(b.ticker))
}
