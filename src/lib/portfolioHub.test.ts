import { describe, it, expect } from 'vitest'
import {
  computeAllocationDrift,
  computeDayChange,
  firstFundedIndex,
  summarisePeriodPerformance,
  formatSignedPct,
  formatSignedUsd,
  hubHref,
  inProgressRunId,
  parseChartPeriod,
  parseHubTab,
  parsePage,
  parseSettingsSection,
  settingsHref,
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
  it('hubHref supports the settings section and a hash fragment', () => {
    expect(hubHref({ tab: 'settings', section: 'safety' })).toBe('/portfolio?tab=settings&section=safety')
    expect(hubHref({ tab: 'settings', section: 'setup', hash: 'alpaca' })).toBe('/portfolio?tab=settings&section=setup#alpaca')
    expect(hubHref({ hash: null })).toBe('/portfolio')
  })
})

describe('settings sections', () => {
  it('parses known sections and defaults to setup', () => {
    expect(parseSettingsSection('notifications')).toBe('notifications')
    expect(parseSettingsSection(['automation', 'safety'])).toBe('automation')
    expect(parseSettingsSection(undefined)).toBe('setup')
    expect(parseSettingsSection('bogus')).toBe('setup')
    expect(parseSettingsSection(' Safety ')).toBe('safety')
  })
  it('maps legacy anchors to their new section', () => {
    expect(parseSettingsSection('alpaca')).toBe('setup')
    expect(parseSettingsSection('#ai-key')).toBe('setup')
    expect(parseSettingsSection('autopilot')).toBe('automation')
    expect(parseSettingsSection('risk')).toBe('safety')
  })
  it('settingsHref builds section links', () => {
    expect(settingsHref()).toBe('/portfolio?tab=settings&section=setup')
    expect(settingsHref('notifications')).toBe('/portfolio?tab=settings&section=notifications')
    expect(settingsHref('setup', 'ai-key')).toBe('/portfolio?tab=settings&section=setup#ai-key')
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

describe('summarisePeriodPerformance', () => {
  const DAY = 86_400
  const T0 = Date.UTC(2026, 7, 28) / 1000
  const ts = (n: number) => Array.from({ length: n }, (_, i) => T0 + i * DAY)

  it('measures from funding and prorates the target to the funded days, not the whole period', () => {
    // 80 unfunded days, then $100k funded for 10 days ending at -$15.48; Alpaca's pct against a $0 base is junk.
    const equity = [...Array(80).fill(0), 100_000, 99_950, 99_901.36, ...Array(7).fill(99_901.36), 99_984.52]
    const pl = [...Array(80).fill(0), 0, -50, -98.64, ...Array(7).fill(-98.64), -15.48]
    const pct = [...Array(90).fill(0), -0.0136]
    const p = summarisePeriodPerformance({ timestamp: ts(91), equity, profit_loss: pl, profit_loss_pct: pct }, 10, 'annual')
    expect(p?.funded_in_period).toBe(true)
    expect(p?.days).toBe(10)
    expect(p?.return_pct).toBeCloseTo(-0.0155, 3)
    expect(p?.target_pct).toBeCloseTo((Math.pow(1.1, 10 / 365) - 1) * 100, 6) // ≈ 0.26%, not 2.40%
    expect(p?.verdict).toBe('too_early')
  })

  it('gives a verdict once there are 3+ weeks of history', () => {
    const equity = Array.from({ length: 31 }, (_, i) => 1000 + i)
    const pl = equity.map(e => e - 1000)
    const p = summarisePeriodPerformance({ timestamp: ts(31), equity, profit_loss: pl }, 10, 'annual')
    expect(p?.funded_in_period).toBe(false)
    expect(p?.return_pct).toBeCloseTo(3, 6)
    expect(p?.verdict).toBe('on_track')
  })

  it('is null without two funded points', () => {
    expect(summarisePeriodPerformance({ timestamp: ts(2), equity: [0, 0] }, 10, 'annual')).toBeNull()
  })
})

describe('firstFundedIndex', () => {
  it('skips leading empty points', () => {
    expect(firstFundedIndex([null, 0, 0, 500, 600])).toBe(3)
    expect(firstFundedIndex([0, 0])).toBe(0)
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
      { ticker: '__cash__', current_pct: 20, target_pct: 20, drift_pct: 0 },
    ])
  })

  it('uses the explicit cash target when the recommendation stores one (specs/031)', () => {
    const rows = computeAllocationDrift([{ ticker: 'AAPL', total_value_usd: 500 }], 500, [{ ticker: 'AAPL', target_pct: 75 }], 25)
    expect(rows.find(r => r.ticker === '__cash__')).toEqual({ ticker: '__cash__', current_pct: 50, target_pct: 25, drift_pct: 25 })
  })

  it('keeps a real holding named CASH as its own stock row, separate from cash', () => {
    const rows = computeAllocationDrift([{ ticker: 'CASH', total_value_usd: 100 }], 100, [{ ticker: 'AAPL', target_pct: 80 }], 20)
    expect(rows.find(r => r.ticker === 'CASH')).toEqual({ ticker: 'CASH', current_pct: 50, target_pct: 0, drift_pct: 50 })
    expect(rows.find(r => r.ticker === '__cash__')?.target_pct).toBe(20)
  })

  it('treats every holding as 0% target when there is no recommendation', () => {
    const rows = computeAllocationDrift([{ ticker: 'AAPL', total_value_usd: 100 }], 0, null)
    expect(rows).toEqual([{ ticker: 'AAPL', current_pct: 100, target_pct: 0, drift_pct: 100 }])
  })

  it('ignores a CASH target row and never makes the cash target negative', () => {
    const rows = computeAllocationDrift([], 100, [{ ticker: 'CASH', target_pct: 50 }, { ticker: 'A', target_pct: 110 }])
    expect(rows.find(r => r.ticker === 'CASH')).toBeUndefined()
    expect(rows.find(r => r.ticker === '__cash__')).toEqual({ ticker: '__cash__', current_pct: 100, target_pct: 0, drift_pct: 100 })
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

  it('shows "off" (not screened) when Islamic screening is off now or was off for the run (specs/030)', () => {
    const off = { islamic: false, business: false, financial: false, stocks_only: true }
    expect(shariahBadgeFor('BAC', screening, off)).toEqual({ kind: 'off' })
    expect(shariahBadgeFor('BAC', { ...screening, config: off })).toEqual({ kind: 'off' })
    expect(shariahBadgeFor('BAC', screening, { ...off, islamic: true, business: true })).toMatchObject({ kind: 'flagged' })
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
