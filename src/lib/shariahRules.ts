import { z } from 'zod'
import { renormaliseAllocation, capAllocation } from '@/lib/allocationUtils'
import type { ActionItem, TargetAllocationItem } from '@/types/database'
import { FULL_SCREENING_CONFIG, EffectiveScreeningConfigSchema, type EffectiveScreeningConfig } from '@/lib/screeningConfig'
import type {
  CompanyFinancials,
  RatioKey,
  ReviewerConfidence,
  ReviewerVerdict,
  ScreeningCheck,
  ScreeningCheckOutcome,
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
export const NOT_COMMON_STOCK_SKIP_REASON = 'Not an individual common stock'
export const UNKNOWN_TYPE_SKIP_REASON =
  'Security type unknown — re-run the analysis to confirm it is an individual common stock'
/** Sell-note prefix for exclusions when Islamic screening is off (stocks-only exclusions). */
export const SCREENING_EXCLUDED_NOTE_PREFIX = 'Excluded by screening'

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
  /** null only in financial-only mode, where the business verdict is not requested. */
  verdict:                    ReviewerVerdict | null
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

interface CheckBuild {
  check:   ScreeningCheck
  /** Reasons that go into the combined list when the check is applied. */
  listed:  string[]
}

function outcomeOf(applied: boolean, reasons: string[], decisive: ScreeningCheckOutcome): ScreeningCheckOutcome {
  if (applied) return reasons.length === 0 ? 'pass' : 'fail'
  return decisive
}

/**
 * Decide one ticker under the effective screening config (specs/030). Three checks are built:
 * - stocks_only: a common stock (Polygon type, reviewer instrument type as fallback; unknown fails);
 * - business:    SIC not on the blocklist AND the reviewer says "compliant";
 * - financial:   non-permissible income < 5% AND every AAOIFI ratio passes (Polygon, AI estimate fallback).
 * A ticker is compliant only if every APPLIED check passes. Disabled checks are still recorded (pass / fail / unknown
 * from the data available) but are never a failure reason. With the full config the result equals spec 019.
 */
export function decideTickerVerdict(
  input: TickerScreeningInput,
  config: EffectiveScreeningConfig = FULL_SCREENING_CONFIG,
): TickerScreening {
  const r = input.reviewer

  // ── Stocks only ──
  const secType = resolveSecurityType(input.security_type, r)
  const stockReasons = isCommonStock(secType.type) ? [] : [secType.type
    ? `Not an individual common stock (type ${secType.type}${secType.source === 'reviewer' ? ', per reviewer' : ''})`
    : 'Security type unknown — cannot confirm it is a common stock']
  const stocks: CheckBuild = {
    check:  { applied: config.stocks_only, outcome: stockReasons.length === 0 ? 'pass' : 'fail', reasons: stockReasons },
    listed: stockReasons,
  }

  // ── Business activity ──
  const businessReasons: string[] = []
  const blocked = findBlockedSic(input.sic_code)
  if (blocked) businessReasons.push(`Impermissible business activity: ${blocked} (SIC ${input.sic_code})`)
  const verdict = r?.verdict ?? null
  if (!r || verdict === null) {
    businessReasons.push('Shariah reviewer gave no valid verdict')
  } else if (verdict !== 'compliant') {
    businessReasons.push(`Shariah reviewer: ${verdict === 'uncertain' ? 'uncertain' : 'non-compliant'} — ${r.reason}`)
  }
  const businessDecisive: ScreeningCheckOutcome =
    blocked || verdict === 'non_compliant' ? 'fail' : verdict === 'compliant' ? 'pass' : 'unknown'
  const business: CheckBuild = {
    check:  { applied: config.business, outcome: outcomeOf(config.business, businessReasons, businessDecisive), reasons: businessReasons },
    listed: businessReasons,
  }

  // ── Financial ratios + non-permissible income ──
  const financialReasons: string[] = []
  const npi = r?.non_permissible_income_pct ?? null
  const npiReason = npi === null
    ? 'Non-permissible income share unknown'
    : npi >= 5 ? `Non-permissible income ${npi.toFixed(1)}% (limit 5%)` : null
  if (npiReason) financialReasons.push(npiReason)

  const est = r?.ratio_estimates
  const conf = r?.confidence ?? null
  const ratioFor = (polygon: ScreeningRatio, estimate: number | null | undefined): ScreeningRatio => {
    // Not applied and nothing to estimate with → keep the raw Polygon value (unknown stays unknown, never a fail).
    if (!config.financial && polygon.status === 'unknown' && (estimate === null || estimate === undefined)) return polygon
    return resolveRatio(polygon, estimate ?? null, conf)
  }
  const ratios: Record<RatioKey, ScreeningRatio> = {
    debt:                ratioFor(input.polygonRatios.debt, est?.debt_pct),
    cash_and_securities: ratioFor(input.polygonRatios.cash_and_securities, est?.cash_and_securities_pct),
    receivables:         ratioFor(input.polygonRatios.receivables, est?.receivables_pct),
  }
  for (const key of Object.keys(ratios) as RatioKey[]) {
    const ratio = ratios[key]
    if (ratio.status === 'pass') continue
    financialReasons.push(ratio.value_pct === null
      ? `${RATIO_LABELS[key]} could not be determined`
      : `${RATIO_LABELS[key]} ${ratio.value_pct.toFixed(1)}% (limit ${SHARIAH_RATIO_LIMIT_PCT}%${ratio.source === 'ai_estimate' ? ', AI estimate' : ''})`)
  }
  const ratioStatuses = Object.values(ratios).map(x => x.status)
  const financialDecisive: ScreeningCheckOutcome =
    (npi !== null && npi >= 5) || ratioStatuses.includes('fail')
      ? 'fail'
      : npi !== null && ratioStatuses.every(x => x === 'pass') ? 'pass' : 'unknown'
  // With the business check applied, a failed / missing reviewer verdict already explains the income share
  // (spec 019 listed the income reason only for a "compliant" verdict) — keep the combined list unchanged.
  const npiSubsumed = config.business && verdict !== 'compliant'
  const financial: CheckBuild = {
    check:  { applied: config.financial, outcome: outcomeOf(config.financial, financialReasons, financialDecisive), reasons: financialReasons },
    listed: npiSubsumed && npiReason ? financialReasons.filter(x => x !== npiReason) : financialReasons,
  }

  const reasons: string[] = []
  for (const part of [stocks, business, financial]) {
    if (!part.check.applied) continue
    for (const reason of part.listed) if (!reasons.includes(reason)) reasons.push(reason)
  }
  const compliant = [stocks, business, financial].every(p => !p.check.applied || p.check.outcome === 'pass')
  const usedEstimate = Object.values(ratios).some(x => x.source === 'ai_estimate')
  const passReason = config.islamic
    ? r?.reason ?? 'Passed all screens'
    : config.stocks_only ? 'Individual common stock (Islamic screening off)' : 'Not screened (screening off)'

  return {
    ticker:                     input.ticker,
    name:                       input.name,
    verdict:                    compliant ? 'compliant' : 'non_compliant',
    reasons:                    compliant ? [passReason] : reasons,
    security_type:              secType.type,
    sic_code:                   input.sic_code,
    sic_description:            input.sic_description,
    reviewer_verdict:           verdict,
    reviewer_reason:            r?.reason ?? null,
    non_permissible_income_pct: npi,
    ratios,
    ratio_source:               usedEstimate ? 'ai_estimate' : 'polygon',
    is_holding:                 input.is_holding,
    excluded:                   !compliant,
    screened_at:                input.screened_at,
    checks:                     { stocks_only: stocks.check, business: business.check, financial: financial.check },
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
  islamic: boolean = true,
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
      (islamic
        ? 'Shariah screening: no compliant stocks remain in the recommendation — nothing to invest in. '
        : 'Screening: no eligible stocks remain in the recommendation — nothing to invest in. ') +
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
  config?: EffectiveScreeningConfig,
): ShariahScreeningResult {
  const excludedSet = new Set(excluded.map(e => e.ticker))
  return {
    version:     1,
    screened_at: screenedAt,
    tickers:     screenings.map(s => ({ ...s, excluded: s.excluded || excludedSet.has(s.ticker) })),
    excluded,
    ...(config ? { config } : {}),
  }
}

/** Attach the screening reason to every SELL of an excluded ticker. Pure. */
export function annotateActionList(
  actions: ActionItem[],
  excluded: Array<{ ticker: string; reasons: string[] }>,
  notePrefix: string = NOT_COMPLIANT_SKIP_REASON,
): ActionItem[] {
  const reasons = new Map(excluded.map(e => [e.ticker, e.reasons]))
  return actions.map(a => {
    const r = reasons.get(a.ticker)
    return r && a.action === 'sell'
      ? { ...a, note: `${notePrefix}: ${r.join('; ')}` }
      : a
  })
}

// ── Execution guard ──────────────────────────────────────────────────────────

/**
 * True when a stored screening applied every Islamic part that `current` enables (legacy screenings without a stored
 * config applied all parts). Stocks-only is not required: it can be re-checked from the stored security type.
 */
export function screeningCoversConfig(screening: ShariahScreeningResult | null, current: EffectiveScreeningConfig): boolean {
  if (!current.islamic) return true
  if (!screening) return false
  const stored = screening.config ?? FULL_SCREENING_CONFIG
  return stored.islamic && (!current.business || stored.business) && (!current.financial || stored.financial)
}

function stocksOnlyBlock(s: TickerScreening | null): string | null {
  if (!s || !s.security_type) return UNKNOWN_TYPE_SKIP_REASON
  return isCommonStock(s.security_type) ? null : NOT_COMMON_STOCK_SKIP_REASON
}

function passed(s: TickerScreening, key: 'business' | 'financial'): boolean {
  const c = s.checks?.[key]
  return !!c && c.applied && c.outcome === 'pass'
}

/**
 * Returns a skip reason when a BUY of `ticker` must be refused, or null when allowed. `current` is the user's
 * CURRENT effective screening config (read at preview / execution time — specs/030):
 * - Islamic off and stocks-only off → never blocks.
 * - Stocks-only only → blocks anything that is not a common stock per the stored screening type (no type → block).
 * - Islamic on → the stored screening must have applied every part enabled now (else the re-run message, e.g. a
 *   recommendation created while screening was off), and the ticker must pass every enabled part. Legacy screenings
 *   (no stored config) were fully screened and keep the spec-019 rule: stored compliant verdict and not excluded.
 */
export function getBuyBlockReason(
  ticker: string,
  screening: ShariahScreeningResult | null,
  current: EffectiveScreeningConfig = FULL_SCREENING_CONFIG,
): string | null {
  if (!current.islamic && !current.stocks_only) return null
  const s = screening?.tickers.find(t => t.ticker === ticker) ?? null
  if (!current.islamic) return stocksOnlyBlock(s)

  if (!screening || !screeningCoversConfig(screening, current)) return NO_SCREENING_SKIP_REASON
  if (!s) return NOT_COMPLIANT_SKIP_REASON
  if (!screening.config || !s.checks) {
    return s.verdict === 'compliant' && !s.excluded ? null : NOT_COMPLIANT_SKIP_REASON
  }
  if (current.business && !passed(s, 'business')) return NOT_COMPLIANT_SKIP_REASON
  if (current.financial && !passed(s, 'financial')) return NOT_COMPLIANT_SKIP_REASON
  if (current.stocks_only) {
    const c = s.checks.stocks_only
    if (c.applied) return c.outcome === 'pass' ? null : NOT_COMMON_STOCK_SKIP_REASON
    return stocksOnlyBlock(s)
  }
  return null
}

// ── Reading stored screening data ────────────────────────────────────────────

const RatioSchema = z.object({
  value_pct: z.number().nullable(),
  status:    z.enum(['pass', 'fail', 'unknown']),
  source:    z.enum(['polygon', 'ai_estimate', 'unavailable']),
  basis:     z.enum(['exact', 'upper_bound']).nullable(),
})

const CheckSchema = z.object({
  applied: z.boolean(),
  outcome: z.enum(['pass', 'fail', 'unknown']),
  reasons: z.array(z.string()),
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
  checks:                     z.object({ stocks_only: CheckSchema, business: CheckSchema, financial: CheckSchema }).optional(),
})

export const ShariahScreeningResultSchema = z.object({
  version:     z.literal(1),
  screened_at: z.string(),
  tickers:     z.array(TickerScreeningSchema),
  excluded:    z.array(z.object({ ticker: z.string(), reasons: z.array(z.string()) })),
  config:      EffectiveScreeningConfigSchema.optional(),
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
