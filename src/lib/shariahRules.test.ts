import { describe, it, expect } from 'vitest'
import {
  isCommonStock,
  findBlockedSic,
  computePolygonRatios,
  resolveRatio,
  decideTickerVerdict,
  applyShariahScreening,
  getBuyBlockReason,
  readShariahScreening,
  buildShariahScreeningResult,
  annotateActionList,
  NOT_COMPLIANT_SKIP_REASON,
  NO_SCREENING_SKIP_REASON,
  type ReviewerTickerVerdict,
  type TickerScreeningInput,
} from './shariahRules'
import type { CompanyFinancials, ShariahScreeningResult, TickerScreening } from '@/types/shariah'

const emptyFin: CompanyFinancials = {
  period_end: null, total_liabilities: null, long_term_debt: null, current_debt: null, current_assets: null,
  cash: null, short_term_investments: null, accounts_receivable: null, revenues: null,
}

const goodReviewer: ReviewerTickerVerdict = {
  verdict: 'compliant',
  reason: 'Software and hardware maker',
  non_permissible_income_pct: 1,
  ratio_estimates: { debt_pct: 5, cash_and_securities_pct: 5, receivables_pct: 5 },
  confidence: 'high',
}

const goodFin: CompanyFinancials = {
  ...emptyFin, long_term_debt: 50, current_debt: 10, cash: 40, short_term_investments: 10, accounts_receivable: 30,
  current_assets: 200, total_liabilities: 300,
}

function input(overrides: Partial<TickerScreeningInput> = {}): TickerScreeningInput {
  return {
    ticker: 'MSFT', name: 'Microsoft', security_type: 'CS', sic_code: '7372', sic_description: 'Prepackaged software',
    polygonRatios: computePolygonRatios(goodFin, 1000),
    reviewer: goodReviewer, is_holding: false, screened_at: '2026-11-20T00:00:00Z',
    ...overrides,
  }
}

describe('isCommonStock', () => {
  it('accepts only CS', () => {
    expect(isCommonStock('CS')).toBe(true)
    expect(isCommonStock('cs')).toBe(true)
    for (const t of ['ETF', 'ETV', 'PFD', 'ADRC', 'FUND', 'WARRANT', '', null, undefined]) {
      expect(isCommonStock(t)).toBe(false)
    }
  })
})

describe('findBlockedSic', () => {
  it.each([
    ['6021', 'banking'], ['6199', 'banking'], ['6211', 'brokerage'], ['6311', 'insurance'], ['6411', 'insurance'],
    ['6770', 'Blank'], ['2082', 'Alcohol'], ['2085', 'Alcohol'], ['2111', 'Tobacco'], ['7993', 'Gambling'],
    ['3484', 'Weapons'], ['3760', 'missiles'], ['5813', 'Drinking'],
  ])('blocks SIC %s', (sic, fragment) => {
    expect(findBlockedSic(sic)?.toLowerCase()).toContain(fragment.toLowerCase())
  })

  it.each(['7372', '3571', '2834', '6798', '7011', '2086', '3674'])('allows SIC %s', sic => {
    expect(findBlockedSic(sic)).toBeNull()
  })

  it('treats unknown codes as not blocked', () => {
    expect(findBlockedSic(null)).toBeNull()
    expect(findBlockedSic('abc')).toBeNull()
  })
})

describe('computePolygonRatios', () => {
  it('computes exact ratios against market cap', () => {
    const r = computePolygonRatios(goodFin, 1000)
    expect(r.debt).toMatchObject({ value_pct: 6, status: 'pass', source: 'polygon', basis: 'exact' })
    expect(r.cash_and_securities).toMatchObject({ value_pct: 5, status: 'pass', basis: 'exact' })
    expect(r.receivables).toMatchObject({ value_pct: 3, status: 'pass' })
  })

  it('fails a ratio at or above 30%', () => {
    const r = computePolygonRatios({ ...goodFin, long_term_debt: 300, current_debt: 0 }, 1000)
    expect(r.debt.status).toBe('fail')
  })

  it('uses upper bounds when specific items are missing', () => {
    const passBound = computePolygonRatios({ ...emptyFin, total_liabilities: 100, current_assets: 100 }, 1000)
    expect(passBound.debt).toMatchObject({ status: 'pass', basis: 'upper_bound', value_pct: 10 })
    expect(passBound.cash_and_securities).toMatchObject({ status: 'pass', basis: 'upper_bound' })
    expect(passBound.receivables).toMatchObject({ status: 'pass', basis: 'upper_bound' })

    const highBound = computePolygonRatios({ ...emptyFin, total_liabilities: 500 }, 1000)
    expect(highBound.debt).toMatchObject({ status: 'unknown', basis: 'upper_bound' })
    expect(highBound.receivables.status).toBe('unknown')
  })

  it('returns unknown when financials or market cap are unavailable', () => {
    expect(computePolygonRatios(null, 1000).debt.status).toBe('unknown')
    expect(computePolygonRatios(goodFin, null).debt.status).toBe('unknown')
    expect(computePolygonRatios(goodFin, 0).cash_and_securities.status).toBe('unknown')
  })
})

describe('resolveRatio', () => {
  const unknown = { value_pct: null, status: 'unknown' as const, source: 'unavailable' as const, basis: null }

  it('keeps a decisive Polygon ratio', () => {
    const fail = { value_pct: 40, status: 'fail' as const, source: 'polygon' as const, basis: 'exact' as const }
    expect(resolveRatio(fail, 1, 'high')).toBe(fail)
  })

  it('falls back to the AI estimate only when under the limit with confidence not low', () => {
    expect(resolveRatio(unknown, 10, 'medium')).toMatchObject({ status: 'pass', source: 'ai_estimate', value_pct: 10 })
    expect(resolveRatio(unknown, 10, 'low')).toMatchObject({ status: 'fail', source: 'ai_estimate' })
    expect(resolveRatio(unknown, 35, 'high')).toMatchObject({ status: 'fail', source: 'ai_estimate' })
    expect(resolveRatio(unknown, null, 'high')).toMatchObject({ status: 'fail', source: 'unavailable' })
    expect(resolveRatio(unknown, 10, null).status).toBe('fail')
  })
})

describe('decideTickerVerdict', () => {
  it('passes a common stock with a clean review and ratios', () => {
    const v = decideTickerVerdict(input())
    expect(v.verdict).toBe('compliant')
    expect(v.excluded).toBe(false)
    expect(v.ratio_source).toBe('polygon')
  })

  it('fails non-common-stock types and unknown type', () => {
    expect(decideTickerVerdict(input({ security_type: 'ETF' })).verdict).toBe('non_compliant')
    const unknown = decideTickerVerdict(input({ security_type: null }))
    expect(unknown.verdict).toBe('non_compliant')
    expect(unknown.reasons[0]).toContain('unknown')
  })

  it('fails a blocked SIC even when the reviewer says compliant', () => {
    const v = decideTickerVerdict(input({ sic_code: '6021' }))
    expect(v.verdict).toBe('non_compliant')
    expect(v.reasons.join(' ')).toContain('banking')
  })

  it('fails uncertain, non-compliant and missing reviewer verdicts', () => {
    expect(decideTickerVerdict(input({ reviewer: { ...goodReviewer, verdict: 'uncertain' } })).verdict).toBe('non_compliant')
    expect(decideTickerVerdict(input({ reviewer: { ...goodReviewer, verdict: 'non_compliant' } })).verdict).toBe('non_compliant')
    expect(decideTickerVerdict(input({ reviewer: null })).verdict).toBe('non_compliant')
  })

  it('fails when non-permissible income is 5% or more, or unknown', () => {
    expect(decideTickerVerdict(input({ reviewer: { ...goodReviewer, non_permissible_income_pct: 5 } })).verdict).toBe('non_compliant')
    expect(decideTickerVerdict(input({ reviewer: { ...goodReviewer, non_permissible_income_pct: null } })).verdict).toBe('non_compliant')
  })

  it('fails when a Polygon ratio fails', () => {
    const v = decideTickerVerdict(input({ polygonRatios: computePolygonRatios({ ...goodFin, long_term_debt: 400 }, 1000) }))
    expect(v.verdict).toBe('non_compliant')
    expect(v.reasons.join(' ')).toContain('debt')
  })

  it('uses AI estimates when financials are unavailable and records the source', () => {
    const ok = decideTickerVerdict(input({ polygonRatios: computePolygonRatios(null, null) }))
    expect(ok.verdict).toBe('compliant')
    expect(ok.ratio_source).toBe('ai_estimate')

    const low = decideTickerVerdict(input({
      polygonRatios: computePolygonRatios(null, null),
      reviewer: { ...goodReviewer, confidence: 'low' },
    }))
    expect(low.verdict).toBe('non_compliant')
  })
})

function screening(ticker: string, compliant: boolean, is_holding = false): TickerScreening {
  return {
    ...decideTickerVerdict(input({ ticker, reviewer: compliant ? goodReviewer : { ...goodReviewer, verdict: 'non_compliant', reason: 'Bank' } })),
    is_holding,
  }
}

describe('applyShariahScreening', () => {
  const alloc = [
    { ticker: 'A', target_pct: 20, rationale: '' },
    { ticker: 'B', target_pct: 20, rationale: '' },
    { ticker: 'C', target_pct: 20, rationale: '' },
    { ticker: 'D', target_pct: 20, rationale: '' },
    { ticker: 'E', target_pct: 10, rationale: '' },
    { ticker: 'BANK', target_pct: 10, rationale: '' },
  ]

  it('drops non-compliant and unscreened tickers, renormalises and caps', () => {
    const res = applyShariahScreening(alloc, ['A', 'B', 'C', 'D', 'E'].map(t => screening(t, true)).concat(screening('BANK', false)))
    expect(res.kept.map(k => k.ticker)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(res.kept.reduce((s, k) => s + k.target_pct, 0)).toBeCloseTo(100)
    expect(Math.max(...res.kept.map(k => k.target_pct))).toBeLessThanOrEqual(20 + 1e-9)
    expect(res.excluded).toEqual([{ ticker: 'BANK', reasons: expect.any(Array) }])

    const missing = applyShariahScreening(alloc, ['A', 'B', 'C', 'D', 'E'].map(t => screening(t, true)))
    expect(missing.excluded).toEqual([{ ticker: 'BANK', reasons: ['Not screened'] }])
  })

  it('lists non-compliant holdings that are not in the allocation as excluded', () => {
    const res = applyShariahScreening(alloc.slice(0, 5), ['A', 'B', 'C', 'D', 'E'].map(t => screening(t, true)).concat(screening('VOO', false, true)))
    expect(res.excluded.map(e => e.ticker)).toEqual(['VOO'])
  })

  it('leaves cash when fewer than five stocks remain (20% cap)', () => {
    const res = applyShariahScreening(alloc, [screening('A', true), screening('B', true)])
    expect(res.kept.map(k => k.target_pct)).toEqual([20, 20])
  })

  it('throws when nothing compliant remains', () => {
    expect(() => applyShariahScreening(alloc, [screening('A', false)])).toThrow(/no compliant stocks/)
  })
})

describe('getBuyBlockReason', () => {
  const result: ShariahScreeningResult = {
    version: 1, screened_at: 'x', tickers: [screening('A', true), screening('B', false)], excluded: [],
  }

  it('allows only stored compliant tickers', () => {
    expect(getBuyBlockReason('A', result)).toBeNull()
    expect(getBuyBlockReason('B', result)).toBe(NOT_COMPLIANT_SKIP_REASON)
    expect(getBuyBlockReason('Z', result)).toBe(NOT_COMPLIANT_SKIP_REASON)
  })

  it('refuses every buy when no screening data exists', () => {
    expect(getBuyBlockReason('A', null)).toBe(NO_SCREENING_SKIP_REASON)
  })
})

describe('readShariahScreening', () => {
  const result: ShariahScreeningResult = { version: 1, screened_at: 'x', tickers: [screening('A', true)], excluded: [] }

  it('prefers the column, then agent_outputs.shariah_review', () => {
    expect(readShariahScreening({ shariah_screening: result })).toEqual(result)
    expect(readShariahScreening({ agent_outputs: { macroeconomics: {}, shariah_review: result } })).toEqual(result)
  })

  it('returns null for missing or invalid data', () => {
    expect(readShariahScreening(null)).toBeNull()
    expect(readShariahScreening({ agent_outputs: { macroeconomics: {} } })).toBeNull()
    expect(readShariahScreening({ shariah_screening: { version: 2 } })).toBeNull()
  })
})

describe('buildShariahScreeningResult', () => {
  it('marks excluded tickers and keeps versioned shape', () => {
    const a = screening('A', true)
    const res = buildShariahScreeningResult([a, screening('B', false)], [{ ticker: 'A', reasons: ['Not screened'] }], 'now')
    expect(res.version).toBe(1)
    expect(res.tickers.find(t => t.ticker === 'A')?.excluded).toBe(true)
    expect(res.tickers.find(t => t.ticker === 'B')?.excluded).toBe(true)
    expect(readShariahScreening({ shariah_screening: res })).toEqual(res)
  })
})

describe('annotateActionList', () => {
  it('adds the reason to sells of excluded tickers only', () => {
    const base = { current_pct: 10, target_pct: 0, current_usd: 100, target_usd: 0, delta_usd: -100 }
    const out = annotateActionList(
      [{ ticker: 'VOO', action: 'sell', ...base }, { ticker: 'MSFT', action: 'sell', ...base }],
      [{ ticker: 'VOO', reasons: ['Not an individual common stock (type ETF)'] }],
    )
    expect(out[0].note).toBe('Not Shariah-compliant: Not an individual common stock (type ETF)')
    expect(out[1].note).toBeUndefined()
  })
})
