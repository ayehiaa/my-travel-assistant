import { describe, it, expect } from 'vitest'
import { CASH_RULES, SynthesisSchema, buildPerformanceSection, finaliseSynthesis, synthesizerWording } from './synthesizer'
import type { RealReturnMetrics } from '@/lib/returnMetrics'

describe('synthesizerWording (specs/030)', () => {
  const full = { islamic: true, business: true, financial: true, stocks_only: true }

  it('full config keeps the Shariah-compliant common-stock wording', () => {
    const w = synthesizerWording(full)
    expect(w.newPortfolioRules).toContain('individual Shariah-compliant common stocks')
    expect(w.newHoldingsLine).toContain('otherwise non-compliant should be given 0%')
    expect(w.tickerRules).toContain('Never use ETFs')
  })

  it('Islamic off drops the Shariah wording but keeps stocks-only rules', () => {
    const w = synthesizerWording({ islamic: false, business: false, financial: false, stocks_only: true })
    expect(w.newPortfolioRules).not.toContain('Shariah')
    expect(w.newHoldingsLine).not.toContain('Shariah')
    expect(w.tickerRules).toContain('Never use ETFs')
  })

  it('stocks-only off allows ETFs', () => {
    const w = synthesizerWording({ islamic: false, business: false, financial: false, stocks_only: false })
    expect(w.tickerRules).not.toContain('Never use ETFs')
    expect(w.newPortfolioRules).toContain('ETF is allowed')
  })
})

describe('synthesizer output with explicit cash (specs/031)', () => {
  const base = { summary_text: 's', conflict_notes: '' }

  it('cash_target_pct defaults to 0 and stocks + cash must sum to ~100', () => {
    const ok = SynthesisSchema.safeParse({ ...base, target_allocation: [{ ticker: 'AAPL', target_pct: 100, rationale: '' }] })
    expect(ok.success && ok.data.cash_target_pct).toBe(0)
    expect(SynthesisSchema.safeParse({ ...base, cash_target_pct: 30, target_allocation: [{ ticker: 'AAPL', target_pct: 70, rationale: '' }] }).success).toBe(true)
    expect(SynthesisSchema.safeParse({ ...base, cash_target_pct: 50, target_allocation: [{ ticker: 'AAPL', target_pct: 70, rationale: '' }] }).success).toBe(false)
    expect(SynthesisSchema.safeParse({ ...base, cash_target_pct: 120, target_allocation: [] }).success).toBe(false)
  })

  it('converts reserved words into cash and normalises stocks + cash to 100', () => {
    const parsed = SynthesisSchema.parse({
      ...base,
      cash_target_pct: 10,
      target_allocation: [
        { ticker: 'AAPL', target_pct: 50, rationale: '' },
        { ticker: 'MSFT', target_pct: 30, rationale: '' },
        { ticker: 'CASH', target_pct: 15, rationale: 'hold dry powder' },
      ],
    })
    const out = finaliseSynthesis(parsed) // total 105
    expect(out.target_allocation.map(a => a.ticker)).toEqual(['AAPL', 'MSFT'])
    expect(out.cash_converted).toEqual(['CASH'])
    expect(out.cash_target_pct).toBeCloseTo((25 * 100) / 105, 6)
    expect(out.target_allocation.reduce((s, a) => s + a.target_pct, 0) + (out.cash_target_pct ?? 0)).toBeCloseTo(100, 9)
  })
})

describe('buildPerformanceSection (specs/031)', () => {
  const ok: RealReturnMetrics = {
    version: 1, status: 'ok', reason: null, window: 'programme_start', start_date: '2026-10-01', end_date: '2026-11-20',
    days: 50, method: 'profit_loss_pct', period_return_pct: 0.5, annualised_return_pct: null, basis: 'period',
    target_pct: 10, target_horizon: 'annual', target_annual_pct: 10, target_period_pct: 1.31, gap_pct: -0.81,
  }

  it('shows the real period, return, prorated target and gap', () => {
    const text = buildPerformanceSection(ok)
    expect(text).toContain('PERFORMANCE VS TARGET')
    expect(text).toContain('2026-10-01 to 2026-11-20 (50 days, since the programme started)')
    expect(text).toContain('+0.50%')
    expect(text).toContain('prorated from 10.00% a year')
    expect(text).toContain('-0.81% (behind target')
    expect(text).toContain('MUST address this gap')
  })

  it('shows the annualised comparison from 60 days', () => {
    const text = buildPerformanceSection({ ...ok, days: 90, basis: 'annualised', annualised_return_pct: 14, target_period_pct: null, gap_pct: 4 })
    expect(text).toContain('Annualised (compounded): +14.00%')
    expect(text).toContain('ahead of target')
  })

  it('with insufficient history: no gap, focus on the target mix', () => {
    const text = buildPerformanceSection({ ...ok, status: 'insufficient_history', reason: 'Only 9 days of account history (minimum 21).', period_return_pct: null, gap_pct: null, basis: null })
    expect(text).toContain('Insufficient history')
    expect(text).toContain('Do NOT claim')
    expect(text).toContain('building / maintaining the target mix')
    expect(text).not.toContain('MUST address this gap')
  })

  it('labels per-holding momentum as an input, not the verdict', () => {
    const text = buildPerformanceSection(ok, { rows: [{ ticker: 'AAPL', return_pct: -3, weight_pct: 40 }], coverage_pct: 100 })
    expect(text).toContain('NOT the performance verdict')
    expect(text).toContain('AAPL: -3.00%')
  })

  it('cash rules say cash is never a ticker', () => {
    expect(CASH_RULES).toContain('NEVER as a ticker')
    expect(CASH_RULES).toContain('CASH is also a real bank stock')
  })
})
