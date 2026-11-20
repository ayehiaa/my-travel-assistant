import { describe, expect, it } from 'vitest'
import { detectDivestments } from './divest'
import type { ShariahScreeningResult, TickerScreening } from '@/types/shariah'
import type { ActionItem } from '@/types/database'

const ratio = { value_pct: 10, status: 'pass' as const, source: 'polygon' as const, basis: 'exact' as const }

function t(ticker: string, verdict: 'compliant' | 'non_compliant', isHolding = true, reasons: string[] = []): TickerScreening {
  return {
    ticker,
    name:                       `${ticker} Inc`,
    verdict,
    reasons,
    security_type:              'CS',
    sic_code:                   null,
    sic_description:            null,
    reviewer_verdict:           null,
    reviewer_reason:            null,
    non_permissible_income_pct: null,
    ratios:                     { debt: ratio, cash_and_securities: ratio, receivables: ratio },
    ratio_source:               'polygon',
    is_holding:                 isHolding,
    excluded:                   verdict === 'non_compliant',
    screened_at:                '2026-11-20T15:00:00Z',
  }
}

function screening(tickers: TickerScreening[]): ShariahScreeningResult {
  return { version: 1, screened_at: '2026-11-20T15:00:00Z', tickers, excluded: [] }
}

function sell(ticker: string): ActionItem {
  return { ticker, action: 'sell', current_pct: 10, target_pct: 0, current_usd: 1000, target_usd: 0, delta_usd: -1000 }
}

describe('detectDivestments', () => {
  it('flags a holding that went from compliant to non-compliant, with the SELL flag', () => {
    const prev = screening([t('AAPL', 'compliant'), t('MSFT', 'compliant')])
    const curr = screening([t('AAPL', 'non_compliant', true, ['Debt ratio 45% exceeds 30%']), t('MSFT', 'compliant')])
    expect(detectDivestments(prev, curr, [sell('AAPL')])).toEqual([
      { ticker: 'AAPL', name: 'AAPL Inc', reasons: ['Debt ratio 45% exceeds 30%'], has_sell: true },
    ])
  })

  it('reports has_sell false when the recommendation has no SELL for it', () => {
    const items = detectDivestments(screening([t('AAPL', 'compliant')]), screening([t('AAPL', 'non_compliant')]), [])
    expect(items).toHaveLength(1)
    expect(items[0].has_sell).toBe(false)
    expect(items[0].reasons).toEqual(['Failed Shariah screening'])
  })

  it('ignores non-holdings, already non-compliant tickers and tickers not screened before', () => {
    const prev = screening([t('AAA', 'compliant'), t('BBB', 'non_compliant')])
    const curr = screening([
      t('AAA', 'non_compliant', false), // proposed buy, not a holding
      t('BBB', 'non_compliant'),       // was already non-compliant
      t('CCC', 'non_compliant'),       // first screening
    ])
    expect(detectDivestments(prev, curr, null)).toEqual([])
  })

  it('returns nothing without both screenings', () => {
    const curr = screening([t('AAPL', 'non_compliant')])
    expect(detectDivestments(null, curr, [])).toEqual([])
    expect(detectDivestments(curr, null, [])).toEqual([])
  })

  it('matches tickers case-insensitively and sorts output', () => {
    const prev = screening([t('zzz', 'compliant'), t('AAA', 'compliant')])
    const curr = screening([t('ZZZ', 'non_compliant'), t('aaa', 'non_compliant')])
    expect(detectDivestments(prev, curr, [sell('zzz')]).map(i => [i.ticker, i.has_sell])).toEqual([
      ['AAA', false],
      ['ZZZ', true],
    ])
  })
})
