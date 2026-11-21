import { z } from 'zod'
import { renormaliseAllocation, capAllocation } from '@/lib/allocationUtils'
import type { ActionItem, TargetAllocationItem } from '@/types/database'
import type {
  CompanyFinancials,
  RatioKey,
  ReviewerConfidence,
  ReviewerVerdict,
  ScreeningRatio,
  ShariahScreeningResult,
  TickerScreening,
} from '@/types/shariah'

/**
 * Code-level Shariah screens. Pure functions only — every rule here is unit tested.
 * The AI reviewer (src/inngest/shariahReviewer.ts) is an additional gate, never a replacement.
 */

/** AAOIFI limit: each ratio must be strictly below 30% of market capitalisation. */
export const SHARIAH_RATIO_LIMIT_PCT = 30
/** Maximum weight of a single stock in a target allocation. */
export const MAX_STOCK_WEIGHT_PCT = 20

export const NOT_COMPLIANT_SKIP_REASON = 'Not Shariah-compliant'
export const NO_SCREENING_SKIP_REASON =
  'Not Shariah-compliant — re-run the analysis (this recommendation predates Shariah screening)'

export const RATIO_LABELS: Record<RatioKey, string> = {
  debt:                'Interest-bearing debt / market cap',
  cash_and_securities: 'Cash + interest-bearing securities / market cap',
  receivables:         'Accounts receivable / market cap',
}

// ── Stocks-only ──────────────────────────────────────────────────────────────

/** Only Polygon type "CS" (common stock) is allowed. Unknown type is not compliant. */
export function isCommonStock(type: string | null | undefined): boolean {
  return typeof type === 'string' && type.trim().toUpperCase() === 'CS'
}

// ── Business activity (SIC) ─────────────────────────────────────────────────

export interface SicBlockRange {
  from:  number
  to:    number
  label: string
}

/**
 * SIC codes whose primary business is impermissible. Ranges are inclusive.
 * Broad codes that mix permissible and impermissible companies (hotels/casino resorts 7011,
 * misc. amusement 7990, REITs 6798, meat packing 2011, aerospace 372x) are left to the AI reviewer.
 * See specs/019-shariah-screening/spec.md for the rationale.
 */
export const SIC_BLOCKLIST: SicBlockRange[] = [
  { from: 6000, to: 6199, label: 'Conventional banking / credit / finance' },
  { from: 6200, to: 6299, label: 'Securities & commodity brokerage' },
  { from: 6300, to: 6499, label: 'Conventional insurance' },
  { from: 6700, to: 6726, label: 'Holding / investment offices and funds' },
  { from: 6770, to: 6770, label: 'Blank-check company (interest-bearing trust)' },
  { from: 6799, to: 6799, label: 'Investors (finance)' },
  { from: 2082, to: 2085, label: 'Alcoholic beverages' },
  { from: 2100, to: 2199, label: 'Tobacco' },
  { from: 5180, to: 5182, label: 'Alcoholic beverage wholesale' },
  { from: 5813, to: 5813, label: 'Drinking places (alcohol)' },
  { from: 5921, to: 5921, label: 'Liquor stores' },
  { from: 7948, to: 7948, label: 'Racing / betting' },
  { from: 7993, to: 7993, label: 'Gambling / gaming machines' },
  { from: 7999, to: 7999, label: 'Gambling / amusement NEC' },
  { from: 3480, to: 3489, label: 'Weapons / ordnance / ammunition' },
  { from: 3760, to: 3769, label: 'Guided missiles' },
  { from: 3795, to: 3795, label: 'Tanks (weapons)' },
]

/** Returns the blocklist label when the SIC code is impermissible, otherwise null (also for unknown codes). */
export function findBlockedSic(sicCode: string | null | undefined): string | null {
  if (!sicCode) return null
  const code = parseInt(sicCode, 10)
  if (!Number.isFinite(code)) return null
  const hit = SIC_BLOCKLIST.find(r => code >= r.from && code <= r.to)
  return hit ? hit.label : null
}

// ── Financial ratios ─────────────────────────────────────────────────────────

const UNKNOWN_RATIO: ScreeningRatio = { value_pct: null, status: 'unknown', source: 'unavailable', basis: null }

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return known.length === 0 ? null : known.reduce((s, v) => s + v, 0)
}

function ratioFrom(exact: number | null, upperBound: number | null, marketCap: number): ScreeningRatio {
  if (exact !== null) {
    const pct = (Math.max(0, exact) / marketCap) * 100
    return { value_pct: pct, status: pct < SHARIAH_RATIO_LIMIT_PCT ? 'pass' : 'fail', source: 'polygon', basis: 'exact' }
  }
  if (upperBound !== null) {
    const pct = (Math.max(0, upperBound) / marketCap) * 100
    // An upper bound under the limit proves a pass; at or above the limit it proves nothing.
    return pct < SHARIAH_RATIO_LIMIT_PCT
      ? { value_pct: pct, status: 'pass', source: 'polygon', basis: 'upper_bound' }
      : { value_pct: pct, status: 'unknown', source: 'polygon', basis: 'upper_bound' }
  }
  return { ...UNKNOWN_RATIO }
}

/**
 * Compute the three AAOIFI ratios from Polygon financials and market cap.
 * - debt: long-term + current debt; else total liabilities as an upper bound
 * - cash_and_securities: cash + short-term investments; else current assets as an upper bound
 * - receivables: accounts receivable; else current assets as an upper bound
 * Missing market cap or financials → every ratio unknown.
 */
export function computePolygonRatios(
  fin: CompanyFinancials | null,
  marketCap: number | null,
): Record<RatioKey, ScreeningRatio> {
  if (!fin || marketCap === null || !Number.isFinite(marketCap) || marketCap <= 0) {
    return { debt: { ...UNKNOWN_RATIO }, cash_and_securities: { ...UNKNOWN_RATIO }, receivables: { ...UNKNOWN_RATIO } }
  }
  return {
    debt:                ratioFrom(sumKnown([fin.long_term_debt, fin.current_debt]), fin.total_liabilities, marketCap),
    cash_and_securities: ratioFrom(fin.cash !== null ? sumKnown([fin.cash, fin.short_term_investments]) : null, fin.current_assets, marketCap),
    receivables:         ratioFrom(fin.accounts_receivable, fin.current_assets, marketCap),
  }
}

export interface ReviewerRatioEstimates {
  debt_pct:                number | null
  cash_and_securities_pct: number | null
  receivables_pct:         number | null
}

/**
 * Final ratio: the Polygon value when it is decisive (pass/fail); otherwise the reviewer's estimate,
 * which passes only when it is under the limit AND the reviewer's confidence is not "low".
 */
/** Below this, an AI ratio estimate passes even at low confidence (Polygon data unavailable). */
export const AI_ESTIMATE_LOW_CONFIDENCE_MAX_PCT = 20

/**
 * Security type for the stocks-only check: Polygon's type when known; otherwise the reviewer's view
 * ("common_stock" → "CS"). Unknown from both → null (fails the check).
 */
export function resolveSecurityType(polygonType: string | null, reviewer: ReviewerTickerVerdict | null): { type: string | null; source: 'polygon' | 'reviewer' | null } {
  if (polygonType) return { type: polygonType, source: 'polygon' }
  const t = reviewer?.instrument_type ?? null
  if (!t) return { type: null, source: null }
  const map: Record<ReviewerInstrumentType, string> = {
    common_stock: 'CS', etf_or_fund: 'ETF', adr: 'ADRC', preferred: 'PFD', other: 'OTHER',
  }
  return { type: map[t], source: 'reviewer' }
}

export function resolveRatio(
  polygon: ScreeningRatio,
  estimatePct: number | null,
  confidence: ReviewerConfidence | null,
): ScreeningRatio {
  if (polygon.status !== 'unknown') return polygon
  if (estimatePct === null || !Number.isFinite(estimatePct)) {
    return { value_pct: polygon.value_pct, status: 'fail', source: 'unavailable', basis: polygon.basis }
  }
  // A low-confidence estimate passes only with a wide margin (< 20%); near the 30% limit it needs medium/high confidence.
  const ok = estimatePct < SHARIAH_RATIO_LIMIT_PCT &&
    confidence !== null &&
    (confidence !== 'low' || estimatePct < AI_ESTIMATE_LOW_CONFIDENCE_MAX_PCT)
  return { value_pct: estimatePct, status: ok ? 'pass' : 'fail', source: 'ai_estimate', basis: null }
}

// ── Per-ticker verdict ───────────────────────────────────────────────────────

export type ReviewerInstrumentType = 'common_stock' | 'etf_or_fund' | 'adr' | 'preferred' | 'other'

export interface ReviewerTickerVerdict {
  verdict:                    ReviewerVerdict
  /** The reviewer's view of the security type — used only when Polygon could not supply it. */
  instrument_type?:           ReviewerInstrumentType | null
  reason:                     string
  non_permissible_income_pct: number | null
  ratio_estimates:            ReviewerRatioEstimates
  confidence:                 ReviewerConfidence
}

export interface TickerScreeningInput {
  ticker:          string
  name:            string | null
  security_type:   string | null
  sic_code:        string | null
  sic_description: string | null
  polygonRatios:   Record<RatioKey, ScreeningRatio>
  /** null when the reviewer omitted this ticker or returned a malformed entry. */
  reviewer:        ReviewerTickerVerdict | null
  is_holding:      boolean
  screened_at:     string
}

/**
 * A ticker is compliant only if it is a common stock, its SIC code is not blocked,
 * the reviewer says "compliant", non-permissible income is under 5%, and every ratio passes.
 */
export function decideTickerVerdict(input: TickerScreeningInput): TickerScreening {
  const reasons: string[] = []
  const r = input.reviewer

  const secType = resolveSecurityType(input.security_type, r)
  if (!isCommonStock(secType.type)) {
    reasons.push(secType.type
      ? `Not an individual common stock (type ${secType.type}${secType.source === 'reviewer' ? ', per reviewer' : ''})`
      : 'Security type unknown — cannot confirm it is a common stock')
  }

  const blocked = findBlockedSic(input.sic_code)
  if (blocked) reasons.push(`Impermissible business activity: ${blocked} (SIC ${input.sic_code})`)

  if (!r) {
    reasons.push('Shariah reviewer gave no valid verdict')
  } else if (r.verdict !== 'compliant') {
    reasons.push(`Shariah reviewer: ${r.verdict === 'uncertain' ? 'uncertain' : 'non-compliant'} — ${r.reason}`)
  } else if (r.non_permissible_income_pct === null || r.non_permissible_income_pct >= 5) {
    reasons.push(r.non_permissible_income_pct === null
      ? 'Non-permissible income share unknown'
      : `Non-permissible income ${r.non_permissible_income_pct.toFixed(1)}% (limit 5%)`)
  }

  const est = r?.ratio_estimates
  const ratios: Record<RatioKey, ScreeningRatio> = {
    debt:                resolveRatio(input.polygonRatios.debt, est?.debt_pct ?? null, r?.confidence ?? null),
    cash_and_securities: resolveRatio(input.polygonRatios.cash_and_securities, est?.cash_and_securities_pct ?? null, r?.confidence ?? null),
    receivables:         resolveRatio(input.polygonRatios.receivables, est?.receivables_pct ?? null, r?.confidence ?? null),
  }
  for (const key of Object.keys(ratios) as RatioKey[]) {
    const ratio = ratios[key]
    if (ratio.status === 'pass') continue
    reasons.push(ratio.value_pct === null
      ? `${RATIO_LABELS[key]} could not be determined`
      : `${RATIO_LABELS[key]} ${ratio.value_pct.toFixed(1)}% (limit ${SHARIAH_RATIO_LIMIT_PCT}%${ratio.source === 'ai_estimate' ? ', AI estimate' : ''})`)
  }

  const compliant = reasons.length === 0
  const usedEstimate = Object.values(ratios).some(x => x.source === 'ai_estimate')

  return {
    ticker:                     input.ticker,
    name:                       input.name,
    verdict:                    compliant ? 'compliant' : 'non_compliant',
    reasons:                    compliant ? [r?.reason ?? 'Passed all screens'] : reasons,
    security_type:              secType.type,
    sic_code:                   input.sic_code,
    sic_description:            input.sic_description,
    reviewer_verdict:           r?.verdict ?? null,
    reviewer_reason:            r?.reason ?? null,
    non_permissible_income_pct: r?.non_permissible_income_pct ?? null,
    ratios,
    ratio_source:               usedEstimate ? 'ai_estimate' : 'polygon',
    is_holding:                 input.is_holding,
    excluded:                   !compliant,
    screened_at:                input.screened_at,
  }
}

// ── Merge with the synthesizer allocation ────────────────────────────────────

export interface ScreenedAllocation {
  kept:     TargetAllocationItem[]
  excluded: Array<{ ticker: string; reasons: string[] }>
}

/**
 * Drop every ticker that is not fully compliant (a ticker with no screening result is dropped),
 * renormalise to 100 and cap each stock at MAX_STOCK_WEIGHT_PCT. Non-compliant holdings that are
 * not in the allocation are listed as excluded too (their target is 0% → SELL).
 * Throws when nothing compliant remains.
 */
export function applyShariahScreening(
  allocation: TargetAllocationItem[],
  screenings: TickerScreening[],
  capPct: number = MAX_STOCK_WEIGHT_PCT,
): ScreenedAllocation {
  const byTicker = new Map(screenings.map(s => [s.ticker, s]))
  const excludedMap = new Map<string, string[]>()

  const compliantItems = allocation.filter(a => {
    const s = byTicker.get(a.ticker)
    if (s && s.verdict === 'compliant') return true
    excludedMap.set(a.ticker, s ? s.reasons : ['Not screened'])
    return false
  })
  for (const s of screenings) {
    if (s.verdict !== 'compliant' && !excludedMap.has(s.ticker)) excludedMap.set(s.ticker, s.reasons)
  }

  const positive = compliantItems.filter(a => a.target_pct > 0)
  if (positive.length === 0) {
    throw new Error(
      'Shariah screening: no compliant stocks remain in the recommendation — nothing to invest in. ' +
      `Main reasons: ${summariseExclusionReasons(Array.from(excludedMap.values()))}`,
    )
  }

  const kept = capAllocation(renormaliseAllocation(positive), capPct)
  return {
    kept,
    excluded: Array.from(excludedMap, ([ticker, reasons]) => ({ ticker, reasons })),
  }
}

/** Assemble the stored screening result, marking excluded tickers. Pure. */
export function buildShariahScreeningResult(
  screenings: TickerScreening[],
  excluded: Array<{ ticker: string; reasons: string[] }>,
  screenedAt: string,
): ShariahScreeningResult {
  const excludedSet = new Set(excluded.map(e => e.ticker))
  return {
    version:     1,
    screened_at: screenedAt,
    tickers:     screenings.map(s => ({ ...s, excluded: s.excluded || excludedSet.has(s.ticker) })),
    excluded,
  }
}

/** Attach the screening reason to every SELL of an excluded ticker. Pure. */
export function annotateActionList(
  actions: ActionItem[],
  excluded: Array<{ ticker: string; reasons: string[] }>,
): ActionItem[] {
  const reasons = new Map(excluded.map(e => [e.ticker, e.reasons]))
  return actions.map(a => {
    const r = reasons.get(a.ticker)
    return r && a.action === 'sell'
      ? { ...a, note: `Not Shariah-compliant: ${r.join('; ')}` }
      : a
  })
}

// ── Execution guard ──────────────────────────────────────────────────────────

/**
 * Returns a skip reason when a BUY of `ticker` must be refused, or null when allowed.
 * Without screening data on the recommendation every buy is refused.
 */
export function getBuyBlockReason(ticker: string, screening: ShariahScreeningResult | null): string | null {
  if (!screening) return NO_SCREENING_SKIP_REASON
  const s = screening.tickers.find(t => t.ticker === ticker)
  return s && s.verdict === 'compliant' && !s.excluded ? null : NOT_COMPLIANT_SKIP_REASON
}

// ── Reading stored screening data ────────────────────────────────────────────

const RatioSchema = z.object({
  value_pct: z.number().nullable(),
  status:    z.enum(['pass', 'fail', 'unknown']),
  source:    z.enum(['polygon', 'ai_estimate', 'unavailable']),
  basis:     z.enum(['exact', 'upper_bound']).nullable(),
})

const TickerScreeningSchema = z.object({
  ticker:                     z.string(),
  name:                       z.string().nullable(),
  verdict:                    z.enum(['compliant', 'non_compliant']),
  reasons:                    z.array(z.string()),
  security_type:              z.string().nullable(),
  sic_code:                   z.string().nullable(),
  sic_description:            z.string().nullable(),
  reviewer_verdict:           z.enum(['compliant', 'non_compliant', 'uncertain']).nullable(),
  reviewer_reason:            z.string().nullable(),
  non_permissible_income_pct: z.number().nullable(),
  ratios:                     z.object({ debt: RatioSchema, cash_and_securities: RatioSchema, receivables: RatioSchema }),
  ratio_source:               z.enum(['polygon', 'ai_estimate']),
  is_holding:                 z.boolean(),
  excluded:                   z.boolean(),
  screened_at:                z.string(),
})

export const ShariahScreeningResultSchema = z.object({
  version:     z.literal(1),
  screened_at: z.string(),
  tickers:     z.array(TickerScreeningSchema),
  excluded:    z.array(z.object({ ticker: z.string(), reasons: z.array(z.string()) })),
})

/**
 * Read the screening result stored on a recommendation: the `shariah_screening` column first
 * (may not exist if the migration is not applied), then `agent_outputs.shariah_review`.
 * Invalid data is treated as absent.
 */
export function readShariahScreening(rec: {
  shariah_screening?: unknown
  agent_outputs?: unknown
} | null | undefined): ShariahScreeningResult | null {
  if (!rec) return null
  const fromColumn = ShariahScreeningResultSchema.safeParse(rec.shariah_screening)
  if (fromColumn.success) return fromColumn.data
  const outputs = rec.agent_outputs
  if (outputs && typeof outputs === 'object' && 'shariah_review' in outputs) {
    const fromOutputs = ShariahScreeningResultSchema.safeParse((outputs as Record<string, unknown>).shariah_review)
    if (fromOutputs.success) return fromOutputs.data
  }
  return null
}

/**
 * The most common exclusion reasons (up to 3, with counts), for error messages. Ticker-specific numbers are
 * stripped so the same kind of reason groups together. Pure; exported for tests.
 */
export function summariseExclusionReasons(reasonLists: string[][]): string {
  const counts = new Map<string, number>()
  for (const reasons of reasonLists) {
    for (const reason of new Set(reasons.map(r => r.split(' — ')[0].replace(/\s*\d+(\.\d+)?%.*$/, '').trim()))) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
    }
  }
  if (counts.size === 0) return 'none recorded'
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([r, n]) => `${r} (${n})`)
    .join('; ')
}
