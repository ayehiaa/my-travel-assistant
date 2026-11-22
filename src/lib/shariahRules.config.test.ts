import { describe, it, expect } from 'vitest'
import {
  computePolygonRatios,
  decideTickerVerdict,
  getBuyBlockReason,
  buildShariahScreeningResult,
  readShariahScreening,
  screeningCoversConfig,
  applyShariahScreening,
  annotateActionList,
  NOT_COMPLIANT_SKIP_REASON,
  NO_SCREENING_SKIP_REASON,
  NOT_COMMON_STOCK_SKIP_REASON,
  UNKNOWN_TYPE_SKIP_REASON,
  SCREENING_EXCLUDED_NOTE_PREFIX,
  type ReviewerTickerVerdict,
  type TickerScreeningInput,
} from './shariahRules'
import { FULL_SCREENING_CONFIG, type EffectiveScreeningConfig } from './screeningConfig'
import type { CompanyFinancials, ShariahScreeningResult } from '@/types/shariah'
import type { ActionItem } from '@/types/database'

const emptyFin: CompanyFinancials = {
  period_end: null, total_liabilities: null, long_term_debt: null, current_debt: null, current_assets: null,
  cash: null, short_term_investments: null, accounts_receivable: null, revenues: null,
}
const goodFin: CompanyFinancials = {
  ...emptyFin, long_term_debt: 50, current_debt: 10, cash: 40, short_term_investments: 10, accounts_receivable: 30,
  current_assets: 200, total_liabilities: 300,
}
const highDebtFin: CompanyFinancials = { ...goodFin, long_term_debt: 500 }

const goodReviewer: ReviewerTickerVerdict = {
  verdict: 'compliant', reason: 'Software maker', non_permissible_income_pct: 1,
  ratio_estimates: { debt_pct: 5, cash_and_securities_pct: 5, receivables_pct: 5 }, confidence: 'high',
}

function input(o: Partial<TickerScreeningInput> = {}): TickerScreeningInput {
  return {
    ticker: 'MSFT', name: 'Microsoft', security_type: 'CS', sic_code: '7372', sic_description: 'Software',
    polygonRatios: computePolygonRatios(goodFin, 1000), reviewer: goodReviewer, is_holding: false,
    screened_at: '2026-11-22T00:00:00Z', ...o,
  }
}

const cfg = (c: Partial<EffectiveScreeningConfig>): EffectiveScreeningConfig => ({ ...FULL_SCREENING_CONFIG, ...c })
const OFF: EffectiveScreeningConfig = { islamic: false, business: false, financial: false, stocks_only: false }
const STOCKS_ONLY: EffectiveScreeningConfig = { ...OFF, stocks_only: true }
const BUSINESS_ONLY = cfg({ financial: false })
const FINANCIAL_ONLY = cfg({ business: false })

// A bank (blocked SIC, reviewer non-compliant) with clean ratios
const bank = input({ ticker: 'JPM', sic_code: '6021', reviewer: { ...goodReviewer, verdict: 'non_compliant', reason: 'Bank' } })
// A permissible business with a failing debt ratio
const leveraged = input({ ticker: 'LEV', polygonRatios: computePolygonRatios(highDebtFin, 1000) })
// An ETF with otherwise clean data
const etf = input({ ticker: 'VOO', security_type: 'ETF' })

describe('decideTickerVerdict with a screening config', () => {
  it('full config: same verdicts as spec 019, every check applied', () => {
    for (const x of [bank, leveraged, etf]) expect(decideTickerVerdict(x).verdict).toBe('non_compliant')
    const ok = decideTickerVerdict(input())
    expect(ok.verdict).toBe('compliant')
    expect(ok.checks).toMatchObject({
      stocks_only: { applied: true, outcome: 'pass' },
      business:    { applied: true, outcome: 'pass' },
      financial:   { applied: true, outcome: 'pass' },
    })
  })

  it('full config: a non-compliant verdict does not add a separate income reason (spec-019 reason list)', () => {
    const v = decideTickerVerdict(input({ reviewer: { ...goodReviewer, verdict: 'non_compliant', reason: 'Casino', non_permissible_income_pct: 40 } }))
    expect(v.reasons).toEqual(['Shariah reviewer: non-compliant — Casino'])
    expect(v.checks?.financial.outcome).toBe('fail')
  })

  it('business only: a bank fails, a leveraged company passes (financial recorded, not applied)', () => {
    expect(decideTickerVerdict(bank, BUSINESS_ONLY).verdict).toBe('non_compliant')
    const lev = decideTickerVerdict(leveraged, BUSINESS_ONLY)
    expect(lev.verdict).toBe('compliant')
    expect(lev.checks?.financial).toMatchObject({ applied: false, outcome: 'fail' })
    expect(lev.reasons.join(' ')).not.toContain('debt')
  })

  it('financial only: a leveraged company fails, a bank with clean ratios passes', () => {
    const lev = decideTickerVerdict(leveraged, FINANCIAL_ONLY)
    expect(lev.verdict).toBe('non_compliant')
    expect(lev.reasons.join(' ')).toContain('debt')
    const b = decideTickerVerdict(bank, FINANCIAL_ONLY)
    expect(b.verdict).toBe('compliant')
    expect(b.checks?.business).toMatchObject({ applied: false, outcome: 'fail' })
  })

  it('financial only: missing income share fails; a null business verdict is fine', () => {
    const noVerdict = decideTickerVerdict(input({ reviewer: { ...goodReviewer, verdict: null } }), FINANCIAL_ONLY)
    expect(noVerdict.verdict).toBe('compliant')
    expect(noVerdict.checks?.business).toMatchObject({ applied: false, outcome: 'unknown' })
    const noIncome = decideTickerVerdict(input({ reviewer: { ...goodReviewer, non_permissible_income_pct: null } }), FINANCIAL_ONLY)
    expect(noIncome.reasons).toContain('Non-permissible income share unknown')
  })

  it('stocks only (Islamic off): only the security type can fail, the reviewer is not needed', () => {
    expect(decideTickerVerdict({ ...bank, reviewer: null }, STOCKS_ONLY).verdict).toBe('compliant')
    expect(decideTickerVerdict({ ...leveraged, reviewer: null }, STOCKS_ONLY).verdict).toBe('compliant')
    const e = decideTickerVerdict({ ...etf, reviewer: null }, STOCKS_ONLY)
    expect(e.verdict).toBe('non_compliant')
    expect(e.reasons[0]).toContain('type ETF')
  })

  it('stocks only with the reviewer skipped: unknown Polygon type fails', () => {
    const v = decideTickerVerdict(input({ security_type: null, reviewer: null }), STOCKS_ONLY)
    expect(v.verdict).toBe('non_compliant')
    expect(v.reasons).toEqual(['Security type unknown — cannot confirm it is a common stock'])
  })

  it('Islamic on, stocks-only off: an ETF can pass when the Islamic parts pass', () => {
    expect(decideTickerVerdict(etf, cfg({ stocks_only: false })).verdict).toBe('compliant')
    expect(decideTickerVerdict(bank, cfg({ stocks_only: false })).verdict).toBe('non_compliant')
  })

  it('everything off: every ticker passes; disabled checks never fail it', () => {
    for (const x of [bank, leveraged, etf, input({ reviewer: null, security_type: null })]) {
      const v = decideTickerVerdict({ ...x, reviewer: null }, OFF)
      expect(v.verdict).toBe('compliant')
      expect(v.reasons).toEqual(['Not screened (screening off)'])
    }
  })

  it('without reviewer data, disabled financial ratios stay as Polygon reported them (unknown, not fail)', () => {
    const v = decideTickerVerdict(input({ reviewer: null, polygonRatios: computePolygonRatios(null, null) }), STOCKS_ONLY)
    expect(v.ratios.debt.status).toBe('unknown')
    expect(v.checks?.financial).toMatchObject({ applied: false, outcome: 'unknown' })
  })
})

function resultFor(config: EffectiveScreeningConfig | undefined, inputs: TickerScreeningInput[]): ShariahScreeningResult {
  const s = inputs.map(i => decideTickerVerdict(i, config ?? FULL_SCREENING_CONFIG))
  const res = buildShariahScreeningResult(s, s.filter(x => x.verdict !== 'compliant').map(x => ({ ticker: x.ticker, reasons: x.reasons })), 'now', config)
  return res
}

describe('stored config', () => {
  it('round-trips through readShariahScreening', () => {
    const res = resultFor(BUSINESS_ONLY, [input(), bank])
    expect(res.config).toEqual(BUSINESS_ONLY)
    expect(readShariahScreening({ shariah_screening: res })).toEqual(res)
  })

  it('covers the current config only when every enabled Islamic part was applied', () => {
    const full = resultFor(FULL_SCREENING_CONFIG, [input()])
    const biz = resultFor(BUSINESS_ONLY, [input()])
    const off = resultFor(STOCKS_ONLY, [input()])
    expect(screeningCoversConfig(full, FINANCIAL_ONLY)).toBe(true)
    expect(screeningCoversConfig(biz, FULL_SCREENING_CONFIG)).toBe(false)
    expect(screeningCoversConfig(biz, BUSINESS_ONLY)).toBe(true)
    expect(screeningCoversConfig(off, BUSINESS_ONLY)).toBe(false)
    expect(screeningCoversConfig(null, STOCKS_ONLY)).toBe(true)
    expect(screeningCoversConfig(null, BUSINESS_ONLY)).toBe(false)
  })
})

describe('getBuyBlockReason with the CURRENT config', () => {
  const full = resultFor(FULL_SCREENING_CONFIG, [input(), bank, leveraged, etf])
  const legacy: ShariahScreeningResult = { ...full, config: undefined, tickers: full.tickers.map(t => ({ ...t, checks: undefined })) }
  const stocksOnlyRun = resultFor(STOCKS_ONLY, [{ ...input(), reviewer: null }, { ...etf, reviewer: null }])
  const offRun = resultFor(OFF, [{ ...input(), reviewer: null }, { ...etf, reviewer: null }])

  it('Islamic off + stocks-only off → never blocks, even without screening data', () => {
    expect(getBuyBlockReason('ANY', null, OFF)).toBeNull()
    expect(getBuyBlockReason('JPM', full, OFF)).toBeNull()
  })

  it('stocks-only only → blocks non-common stocks using the stored type; no stored type → blocks', () => {
    expect(getBuyBlockReason('MSFT', full, STOCKS_ONLY)).toBeNull()
    expect(getBuyBlockReason('JPM', full, STOCKS_ONLY)).toBeNull()
    expect(getBuyBlockReason('VOO', full, STOCKS_ONLY)).toBe(NOT_COMMON_STOCK_SKIP_REASON)
    expect(getBuyBlockReason('VOO', offRun, STOCKS_ONLY)).toBe(NOT_COMMON_STOCK_SKIP_REASON)
    expect(getBuyBlockReason('NEW', full, STOCKS_ONLY)).toBe(UNKNOWN_TYPE_SKIP_REASON)
    expect(getBuyBlockReason('MSFT', null, STOCKS_ONLY)).toBe(UNKNOWN_TYPE_SKIP_REASON)
  })

  it('full → spec-019 behaviour', () => {
    expect(getBuyBlockReason('MSFT', full, FULL_SCREENING_CONFIG)).toBeNull()
    expect(getBuyBlockReason('JPM', full, FULL_SCREENING_CONFIG)).toBe(NOT_COMPLIANT_SKIP_REASON)
    expect(getBuyBlockReason('LEV', full, FULL_SCREENING_CONFIG)).toBe(NOT_COMPLIANT_SKIP_REASON)
    expect(getBuyBlockReason('VOO', full, FULL_SCREENING_CONFIG)).toBe(NOT_COMMON_STOCK_SKIP_REASON)
    expect(getBuyBlockReason('MSFT', null, FULL_SCREENING_CONFIG)).toBe(NO_SCREENING_SKIP_REASON)
  })

  it('only the enabled parts block a fully screened recommendation', () => {
    expect(getBuyBlockReason('LEV', full, BUSINESS_ONLY)).toBeNull()
    expect(getBuyBlockReason('JPM', full, BUSINESS_ONLY)).toBe(NOT_COMPLIANT_SKIP_REASON)
    expect(getBuyBlockReason('JPM', full, FINANCIAL_ONLY)).toBeNull()
    expect(getBuyBlockReason('LEV', full, FINANCIAL_ONLY)).toBe(NOT_COMPLIANT_SKIP_REASON)
    expect(getBuyBlockReason('VOO', full, cfg({ stocks_only: false }))).toBeNull()
  })

  it('a recommendation created while screening was off (or with fewer parts) → re-run message', () => {
    expect(getBuyBlockReason('MSFT', stocksOnlyRun, FULL_SCREENING_CONFIG)).toBe(NO_SCREENING_SKIP_REASON)
    expect(getBuyBlockReason('MSFT', offRun, BUSINESS_ONLY)).toBe(NO_SCREENING_SKIP_REASON)
    const biz = resultFor(BUSINESS_ONLY, [input()])
    expect(getBuyBlockReason('MSFT', biz, FULL_SCREENING_CONFIG)).toBe(NO_SCREENING_SKIP_REASON)
    expect(getBuyBlockReason('MSFT', biz, BUSINESS_ONLY)).toBeNull()
  })

  it('a run without stocks-only is re-checked from the stored type when stocks-only is on now', () => {
    const noStocks = resultFor(cfg({ stocks_only: false }), [input(), etf])
    expect(getBuyBlockReason('VOO', noStocks, FULL_SCREENING_CONFIG)).toBe(NOT_COMMON_STOCK_SKIP_REASON)
    expect(getBuyBlockReason('MSFT', noStocks, FULL_SCREENING_CONFIG)).toBeNull()
  })

  it('legacy screenings (no stored config) keep the verdict rule', () => {
    expect(getBuyBlockReason('MSFT', legacy, BUSINESS_ONLY)).toBeNull()
    expect(getBuyBlockReason('LEV', legacy, BUSINESS_ONLY)).toBe(NOT_COMPLIANT_SKIP_REASON)
    expect(getBuyBlockReason('VOO', legacy, STOCKS_ONLY)).toBe(NOT_COMMON_STOCK_SKIP_REASON)
  })
})

describe('allocation + sell notes when Islamic screening is off', () => {
  it('uses a neutral error message and note prefix', () => {
    const s = [decideTickerVerdict({ ...etf, reviewer: null }, STOCKS_ONLY)]
    expect(() => applyShariahScreening([{ ticker: 'VOO', target_pct: 100, rationale: '' }], s, 20, false)).toThrow(/no eligible stocks/)
    const sell: ActionItem = { ticker: 'VOO', action: 'sell', current_pct: 10, target_pct: 0, current_usd: 100, target_usd: 0, delta_usd: -100 } as ActionItem
    const [annotated] = annotateActionList([sell], [{ ticker: 'VOO', reasons: ['Not an individual common stock (type ETF)'] }], SCREENING_EXCLUDED_NOTE_PREFIX)
    expect(annotated.note).toBe('Excluded by screening: Not an individual common stock (type ETF)')
  })
})
