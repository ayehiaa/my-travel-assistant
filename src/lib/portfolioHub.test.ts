import { describe, it, expect } from 'vitest'
import {
  computeAllocationDrift,
  computeDayChange,
  computePeriodReturnPct,
  formatSignedPct,
  formatSignedUsd,
  hubHref,
  inProgressRunId,
  parseChartPeriod,
  parseHubTab,
  parsePage,
  proratedTargetPct,
  shariahBadgeFor,
  tradesForTicker,
} from './portfolioHub'
import type { AlpacaOrderResult } from '@/types/database'
import type { ShariahScreeningResult, TickerScreening } from '@/types/shariah'

describe('URL params', () => {
  it('parses tabs with overview default', () => {
    expect(parseHubTab('activity')).toBe('activity')
    expect(parseHubTab(['settings', 'x'])).toBe('settings')
    expect(parseHubTab('nope')).toBe('overview')
    expect(parseHubTab(undefined)).toBe('overview')
  })

  it('parses chart periods case-insensitively with 1M default', () => {
    expect(parseChartPeriod('1y')).toBe('1Y')
    expect(parseChartPeriod('3M')).toBe('3M')
    expect(parseChartPeriod('5Y')).toBe('1M')
    expect(parseChartPeriod(undefined)).toBe('1M')
  })

  it('parses pages within bounds', () => {
    expect(parsePage('3', 10)).toBe(3)
    expect(parsePage('0', 10)).toBe(1)
    expect(parsePage('abc', 10)).toBe(1)
    expect(parsePage('99', 10)).toBe(10)
  })

  it('builds hub hrefs and drops empty params', () => {
    expect(hubHref({ tab: 'activity', filter: 'runs', page: 2 })).toBe('/portfolio?tab=activity&filter=runs&page=2')
    expect(hubHref({ tab: 'overview', period: null })).toBe('/portfolio?tab=overview')
    expect(hubHref({})).toBe('/portfolio')
  })
})

describe('computeDayChange', () => {
  it('computes $ and % change vs previous close', () => {
    const r = computeDayChange(10_500, 10_000)!
    expect(r.change_usd).toBe(500)
    expect(r.change_pct).toBeCloseTo(5)
  })
  it('handles losses', () => {
    expect(computeDayChange(9_900, 10_000)!.change_pct).toBeCloseTo(-1)
  })
  it('returns null when a value is missing', () => {
    expect(computeDayChange(null, 10_000)).toBeNull()
    expect(computeDayChange(10_000, undefined)).toBeNull()
    expect(computeDayChange(NaN, 1)).toBeNull()
  })
  it('has no % when previous equity is zero', () => {
    expect(computeDayChange(100, 0)).toEqual({ change_usd: 100, change_pct: null })
  })
})

describe('computePeriodReturnPct', () => {
  it('prefers the last non-null deposit-adjusted profit_loss_pct', () => {
    expect(computePeriodReturnPct([100, 200], [0, 0.05, null])).toBeCloseTo(5)
  })
  it('falls back to last / first positive equity', () => {
    expect(computePeriodReturnPct([null, 0, 1000, 1100])).toBeCloseTo(10)
  })
  it('returns null without enough data', () => {
    expect(computePeriodReturnPct([])).toBeNull()
    expect(computePeriodReturnPct([1000])).toBeNull()
    expect(computePeriodReturnPct([0, 0])).toBeNull()
  })
})

describe('proratedTargetPct', () => {
  it('is the full annual target over a year', () => {
    expect(proratedTargetPct(10, 'annual', 365)).toBeCloseTo(10)
  })
  it('compounds an annual target down to a month', () => {
    // (1.10)^(30/365) − 1 ≈ 0.7864%
    expect(proratedTargetPct(10, 'annual', 30)).toBeCloseTo(0.7864, 3)
  })
  it('compounds a monthly target up to a year', () => {
    // (1.01)^(365/30.4375) − 1 ≈ 12.68%
    expect(proratedTargetPct(1, 'monthly', 365)).toBeCloseTo(12.68, 1)
  })
  it('is 0 for invalid input', () => {
    expect(proratedTargetPct(10, 'annual', 0)).toBe(0)
    expect(proratedTargetPct(NaN, 'annual', 30)).toBe(0)
  })
})

describe('computeAllocationDrift', () => {
  it('compares current and target weights against total value and adds cash', () => {
    const rows = computeAllocationDrift(
      [{ ticker: 'AAPL', total_value_usd: 600 }, { ticker: 'MSFT', total_value_usd: 200 }],
      200,
      [{ ticker: 'AAPL', target_pct: 40 }, { ticker: 'MSFT', target_pct: 20 }, { ticker: 'NVDA', target_pct: 20 }],
    )
    expect(rows).toEqual([
      { ticker: 'AAPL', current_pct: 60, target_pct: 40, drift_pct: 20 },
      { ticker: 'NVDA', current_pct: 0, target_pct: 20, drift_pct: -20 },
      { ticker: 'MSFT', current_pct: 20, target_pct: 20, drift_pct: 0 },
      { ticker: 'CASH', current_pct: 20, target_pct: 20, drift_pct: 0 },
    ])
  })

  it('treats every holding as 0% target when there is no recommendation', () => {
    const rows = computeAllocationDrift([{ ticker: 'AAPL', total_value_usd: 100 }], 0, null)
    expect(rows).toEqual([{ ticker: 'AAPL', current_pct: 100, target_pct: 0, drift_pct: 100 }])
  })

  it('ignores a CASH target row and never makes the cash target negative', () => {
    const rows = computeAllocationDrift([], 100, [{ ticker: 'CASH', target_pct: 50 }, { ticker: 'A', target_pct: 110 }])
    expect(rows.find(r => r.ticker === 'CASH')).toEqual({ ticker: 'CASH', current_pct: 100, target_pct: 0, drift_pct: 100 })
  })

  it('handles an empty account', () => {
    expect(computeAllocationDrift([], 0, null)).toEqual([])
  })
})

function order(partial: Partial<AlpacaOrderResult>): AlpacaOrderResult {
  return {
    ticker: 'AAPL', action: 'buy', qty: 1, price_at_execution: 100, estimated_value: 100,
    alpaca_order_id: null, status: 'filled', error_message: null, ...partial,
  }
}

describe('tradesForTicker', () => {
  const executions = [
    {
      recommendation_id: 'r1', executed_at: '2026-11-01T15:00:00Z', dry_run: false,
      orders: [
        order({ ticker: 'AAPL', filled_qty: 2, filled_avg_price: 101, filled_at: '2026-11-01T15:01:00Z' }),
        order({ ticker: 'MSFT' }),
        order({ ticker: 'AAPL', status: 'skipped' }),
      ],
    },
    {
      recommendation_id: 'r2', executed_at: '2026-11-10T15:00:00Z', dry_run: true,
      orders: [order({ ticker: 'AAPL', action: 'sell', status: 'simulated', qty: 1, estimated_value: 110, price_at_execution: 110 })],
    },
  ]

  it('returns this ticker’s non-skipped trades newest first', () => {
    const trades = tradesForTicker(executions, 'AAPL')
    expect(trades.map(t => t.recommendation_id)).toEqual(['r2', 'r1'])
    expect(trades[0]).toMatchObject({ action: 'sell', status: 'simulated', qty: 1, value_usd: 110, price: 110, dry_run: true })
    expect(trades[1]).toMatchObject({ action: 'buy', qty: 2, value_usd: 202, price: 101, executed_at: '2026-11-01T15:01:00Z' })
  })

  it('respects the limit and unknown tickers', () => {
    expect(tradesForTicker(executions, 'AAPL', 1)).toHaveLength(1)
    expect(tradesForTicker(executions, 'TSLA')).toEqual([])
  })
})

describe('shariahBadgeFor', () => {
  const t = (ticker: string, verdict: TickerScreening['verdict'], reasons: string[]): TickerScreening => ({
    ticker, name: null, verdict, reasons, security_type: 'CS', sic_code: null, sic_description: null,
    reviewer_verdict: null, reviewer_reason: null, non_permissible_income_pct: null,
    ratios: {
      debt:                { value_pct: 10, status: 'pass', source: 'polygon', basis: 'exact' },
      cash_and_securities: { value_pct: 10, status: 'pass', source: 'polygon', basis: 'exact' },
      receivables:         { value_pct: 10, status: 'pass', source: 'polygon', basis: 'exact' },
    },
    ratio_source: 'polygon', is_holding: true, excluded: verdict !== 'compliant', screened_at: '2026-11-20T00:00:00Z',
  })
  const screening: ShariahScreeningResult = {
    version: 1, screened_at: '2026-11-20T00:00:00Z',
    tickers: [t('AAPL', 'compliant', ['Clean']), t('BAC', 'non_compliant', ['Conventional bank'])],
    excluded: [],
  }

  it('maps compliant, flagged and unscreened', () => {
    expect(shariahBadgeFor('AAPL', screening)).toMatchObject({ kind: 'compliant', reason: 'Clean' })
    expect(shariahBadgeFor('BAC', screening)).toMatchObject({ kind: 'flagged', reason: 'Conventional bank' })
    expect(shariahBadgeFor('XYZ', screening)).toEqual({ kind: 'unscreened' })
    expect(shariahBadgeFor('AAPL', null)).toEqual({ kind: 'unscreened' })
  })
})

describe('formatting', () => {
  it('formats signed USD and %', () => {
    expect(formatSignedUsd(1234.5)).toBe('+$1,234.50')
    expect(formatSignedUsd(-12)).toBe('−$12.00')
    expect(formatSignedUsd(0)).toBe('$0.00')
    expect(formatSignedPct(1.234)).toBe('+1.23%')
    expect(formatSignedPct(-0.4)).toBe('−0.40%')
    expect(formatSignedPct(-0.001)).toBe('0.00%')
  })
})

describe('inProgressRunId', () => {
  const now = new Date('2026-11-20T12:00:00Z')
  it('resumes a recent running run', () => {
    expect(inProgressRunId({ id: 'r', status: 'running', run_at: '2026-11-20T11:30:00Z' }, now)).toBe('r')
  })
  it('ignores stale, finished, missing or invalid runs', () => {
    expect(inProgressRunId({ id: 'r', status: 'running', run_at: '2026-11-20T10:00:00Z' }, now)).toBeNull()
    expect(inProgressRunId({ id: 'r', status: 'complete', run_at: '2026-11-20T11:59:00Z' }, now)).toBeNull()
    expect(inProgressRunId(null, now)).toBeNull()
    expect(inProgressRunId({ id: 'r', status: 'running', run_at: 'bad' }, now)).toBeNull()
  })
})
