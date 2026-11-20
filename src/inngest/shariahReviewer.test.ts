import { describe, it, expect } from 'vitest'
import { parseReviewerResponse, buildReviewerUserPrompt } from './shariahReviewer'
import { computePolygonRatios } from '@/lib/shariahRules'

const entry = (ticker: string, extra: Record<string, unknown> = {}) => ({
  ticker,
  verdict: 'compliant',
  reason: 'Designs semiconductors',
  non_permissible_income_pct: 1.2,
  ratio_estimates: { debt_pct: 3, cash_and_securities_pct: 4, receivables_pct: 2 },
  confidence: 'high',
  ...extra,
})

describe('parseReviewerResponse', () => {
  it('maps valid entries to tickers, tolerating surrounding prose', () => {
    const raw = 'Here you go: ' + JSON.stringify({ verdicts: [entry('NVDA'), entry('JPM', { verdict: 'non_compliant', reason: 'Bank' })] })
    const out = parseReviewerResponse(raw, ['NVDA', 'JPM'])
    expect(out.NVDA?.verdict).toBe('compliant')
    expect(out.JPM?.verdict).toBe('non_compliant')
  })

  it('fails (null) a missing ticker', () => {
    const out = parseReviewerResponse(JSON.stringify({ verdicts: [entry('NVDA')] }), ['NVDA', 'AAPL'])
    expect(out.AAPL).toBeNull()
  })

  it('fails (null) a malformed entry without affecting others', () => {
    const out = parseReviewerResponse(
      JSON.stringify({ verdicts: [entry('NVDA', { verdict: 'probably_fine' }), entry('AAPL')] }),
      ['NVDA', 'AAPL'],
    )
    expect(out.NVDA).toBeNull()
    expect(out.AAPL?.verdict).toBe('compliant')
  })

  it('fails (null) a ticker with duplicate entries', () => {
    const out = parseReviewerResponse(
      JSON.stringify({ verdicts: [entry('NVDA'), entry('NVDA', { verdict: 'uncertain' })] }),
      ['NVDA'],
    )
    expect(out.NVDA).toBeNull()
  })

  it('ignores tickers that were not requested', () => {
    const out = parseReviewerResponse(JSON.stringify({ verdicts: [entry('XYZ')] }), ['NVDA'])
    expect(out).toEqual({ NVDA: null })
  })

  it('throws on a response with no parseable JSON (so the step retries)', () => {
    expect(() => parseReviewerResponse('no json here', ['NVDA'])).toThrow()
    expect(() => parseReviewerResponse('{ not json', ['NVDA'])).toThrow()
    expect(() => parseReviewerResponse('{"foo": 1}', ['NVDA'])).toThrow()
  })
})

describe('buildReviewerUserPrompt', () => {
  it('includes the real Polygon data for each ticker', () => {
    const prompt = buildReviewerUserPrompt([{
      ticker: 'AAPL', name: 'Apple Inc.', is_holding: true, security_type: 'CS', sic_code: '3571',
      sic_description: 'Electronic computers', market_cap_usd: 1000, revenues_usd: 500, period_end: '2026-06-30',
      polygon_ratios: computePolygonRatios({
        period_end: null, total_liabilities: null, long_term_debt: 100, current_debt: 0, current_assets: null,
        cash: 50, short_term_investments: null, accounts_receivable: null, revenues: 500,
      }, 1000),
    }])
    expect(prompt).toContain('[TICKER AAPL]')
    expect(prompt).toContain('SIC: 3571 — Electronic computers')
    expect(prompt).toContain('10.0% (computed, pass)')
    expect(prompt).toContain('Accounts receivable / market cap: not available')
  })
})
