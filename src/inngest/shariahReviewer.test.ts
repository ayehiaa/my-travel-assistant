import { describe, it, expect } from 'vitest'
import { parseReviewerResponse, buildReviewerUserPrompt, buildReviewerSystemPrompt, runShariahReviewer } from './shariahReviewer'
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

describe('parseReviewerResponse — instrument_type', () => {
  const entry = {
    ticker: 'MSFT', verdict: 'compliant', reason: 'Software', non_permissible_income_pct: 2,
    ratio_estimates: { debt_pct: 3, cash_and_securities_pct: 4, receivables_pct: 2 }, confidence: 'high',
  }

  it('keeps a valid instrument type', () => {
    const out = parseReviewerResponse(JSON.stringify({ verdicts: [{ ...entry, instrument_type: 'common_stock' }] }), ['MSFT'])
    expect(out.MSFT?.instrument_type).toBe('common_stock')
  })

  it('treats a missing or invalid instrument type as null without rejecting the entry', () => {
    expect(parseReviewerResponse(JSON.stringify({ verdicts: [entry] }), ['MSFT']).MSFT?.instrument_type).toBeNull()
    const bad = parseReviewerResponse(JSON.stringify({ verdicts: [{ ...entry, instrument_type: 'banana' }] }), ['MSFT'])
    expect(bad.MSFT?.verdict).toBe('compliant')
    expect(bad.MSFT?.instrument_type).toBeNull()
  })
})

describe('configurable reviewer (specs/030)', () => {
  const full = { islamic: true, business: true, financial: true, stocks_only: true }
  const businessOnly = { ...full, financial: false }
  const financialOnly = { ...full, business: false }
  const off = { islamic: false, business: false, financial: false, stocks_only: true }
  const raw = (e: Record<string, unknown>) => JSON.stringify({ verdicts: [e] })

  it('is skipped entirely (no Claude call, no usage) when no Islamic part is enabled', async () => {
    const input = {
      ticker: 'AAPL', name: null, is_holding: false, security_type: 'CS', sic_code: null, sic_description: null,
      market_cap_usd: null, revenues_usd: null, period_end: null, polygon_ratios: computePolygonRatios(null, null),
    }
    await expect(runShariahReviewer([input], 'unused-key', off)).resolves.toEqual({ verdicts: {}, usage: null })
    await expect(runShariahReviewer([input], 'unused-key', { ...off, stocks_only: false })).resolves.toEqual({ verdicts: {}, usage: null })
  })

  it('full config keeps the spec-019 prompt', () => {
    const p = buildReviewerSystemPrompt(full)
    expect(p).toContain('Business activity')
    expect(p).toContain('ALWAYS give numeric estimates')
    expect(buildReviewerSystemPrompt({ ...full })).toBe(p)
  })

  it('business-only prompt: business verdict required, estimates optional', () => {
    const p = buildReviewerSystemPrompt(businessOnly)
    expect(p).toContain('Business activity')
    expect(p).toContain('OPTIONAL in this review (the financial screen is off)')
    expect(p).not.toContain('ALWAYS give numeric estimates')
  })

  it('financial-only prompt: no business task, verdict optional, estimates required', () => {
    const p = buildReviewerSystemPrompt(financialOnly)
    expect(p).not.toContain('Business activity: the main business')
    expect(p).toContain('verdict is OPTIONAL')
    expect(p).toContain('ALWAYS give numeric estimates')
  })

  it('stocks-only off: funds may pass only when explicitly Shariah-compliant', () => {
    expect(buildReviewerSystemPrompt({ ...full, stocks_only: false })).toContain('explicitly Shariah-compliant (Islamic) fund')
  })

  it('business-only schema accepts entries without estimates; full schema rejects them', () => {
    const e = { ticker: 'AAPL', verdict: 'compliant', reason: 'Phones', confidence: 'high' }
    expect(parseReviewerResponse(raw(e), ['AAPL'], 'business').AAPL).toMatchObject({
      verdict: 'compliant', non_permissible_income_pct: null,
      ratio_estimates: { debt_pct: null, cash_and_securities_pct: null, receivables_pct: null },
    })
    expect(parseReviewerResponse(raw(e), ['AAPL'], 'full').AAPL).toBeNull()
  })

  it('financial-only schema accepts a null / missing verdict but requires the estimates', () => {
    expect(parseReviewerResponse(raw(entry('AAPL', { verdict: null })), ['AAPL'], 'financial').AAPL?.verdict).toBeNull()
    const { verdict: _v, ...noVerdict } = entry('AAPL')
    void _v
    expect(parseReviewerResponse(raw(noVerdict), ['AAPL'], 'financial').AAPL?.verdict).toBeNull()
    const { ratio_estimates: _r, ...noEstimates } = entry('AAPL')
    void _r
    expect(parseReviewerResponse(raw(noEstimates), ['AAPL'], 'financial').AAPL).toBeNull()
    expect(parseReviewerResponse(raw(entry('AAPL', { verdict: null })), ['AAPL'], 'full').AAPL).toBeNull()
  })
})
