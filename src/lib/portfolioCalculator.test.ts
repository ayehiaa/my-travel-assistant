import { describe, it, expect } from 'vitest'
import { computeHoldingSummaries, formatUsd, computeActionList, computePortfolioReturnMetrics } from './portfolioCalculator'

describe('computeHoldingSummaries', () => {
  it('returns empty summaries and zero totals for an empty holdings array with zero cash', () => {
    const { summaries, totals } = computeHoldingSummaries([], 0)
    expect(summaries).toEqual([])
    expect(totals.holdings_usd).toBe(0)
    expect(totals.cash_usd).toBe(0)
    expect(totals.grand_total_usd).toBe(0)
  })

  it('sets pct_of_portfolio to 0 for all holdings when grand_total is 0', () => {
    const { summaries } = computeHoldingSummaries(
      [{ ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 0 }],
      0
    )
    expect(summaries[0].pct_of_portfolio).toBe(0)
  })

  it('computes pct_of_portfolio correctly with a single holding and no cash', () => {
    const { summaries, totals } = computeHoldingSummaries(
      [{ ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 1000 }],
      0
    )
    expect(totals.grand_total_usd).toBe(1000)
    expect(summaries[0].pct_of_portfolio).toBe(100)
  })

  it('computes pct_of_portfolio correctly when cash is present', () => {
    const { summaries, totals } = computeHoldingSummaries(
      [{ ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 750 }],
      250
    )
    expect(totals.grand_total_usd).toBe(1000)
    expect(totals.holdings_usd).toBe(750)
    expect(totals.cash_usd).toBe(250)
    expect(summaries[0].pct_of_portfolio).toBe(75)
  })

  it('computes pct_of_portfolio for multiple holdings', () => {
    const holdings = [
      { ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 500 },
      { ticker: 'MSFT', company_name: 'Microsoft Corp.', total_value_usd: 300 },
    ]
    const { summaries, totals } = computeHoldingSummaries(holdings, 200)
    expect(totals.grand_total_usd).toBe(1000)
    expect(summaries[0].pct_of_portfolio).toBe(50)
    expect(summaries[1].pct_of_portfolio).toBe(30)
  })

  it('rounds pct_of_portfolio to 2 decimal places', () => {
    const holdings = [
      { ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 1 },
    ]
    // 1 / 3 = 33.333... => should round to 33.33
    const { summaries } = computeHoldingSummaries(holdings, 2)
    expect(summaries[0].pct_of_portfolio).toBe(33.33)
  })

  it('preserves the order of the input holdings array', () => {
    const holdings = [
      { ticker: 'MSFT', company_name: 'Microsoft Corp.', total_value_usd: 300 },
      { ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 700 },
    ]
    const { summaries } = computeHoldingSummaries(holdings, 0)
    expect(summaries[0].ticker).toBe('MSFT')
    expect(summaries[1].ticker).toBe('AAPL')
  })

  it('propagates ticker, company_name, and total_value_usd into summaries', () => {
    const holdings = [
      { ticker: 'NVDA', company_name: 'NVIDIA Corporation', total_value_usd: 2000 },
    ]
    const { summaries } = computeHoldingSummaries(holdings, 0)
    expect(summaries[0].ticker).toBe('NVDA')
    expect(summaries[0].company_name).toBe('NVIDIA Corporation')
    expect(summaries[0].total_value_usd).toBe(2000)
  })
})

describe('formatUsd', () => {
  it('formats zero as $0.00', () => {
    expect(formatUsd(0)).toBe('$0.00')
  })

  it('formats a whole number with two decimal places', () => {
    expect(formatUsd(1000)).toBe('$1,000.00')
  })

  it('formats a decimal value correctly', () => {
    expect(formatUsd(12345.67)).toBe('$12,345.67')
  })

  it('formats a large number with thousands separator', () => {
    expect(formatUsd(1000000)).toBe('$1,000,000.00')
  })

  it('formats a small fractional value with two decimal places', () => {
    expect(formatUsd(0.5)).toBe('$0.50')
  })
})

describe('computePortfolioReturnMetrics', () => {
  const candles = (first: number, last: number) => [{ close: first }, { close: last }]

  it('returns all zeros and full negative gap when totalValue is 0', () => {
    const m = computePortfolioReturnMetrics([], {}, 10, 'annual')
    expect(m.weighted_30d_return_pct).toBe(0)
    expect(m.annualized_return_pct).toBe(0)
    expect(m.target_annual_pct).toBe(10)
    expect(m.annual_gap_pct).toBe(-10)
    expect(m.data_coverage_pct).toBe(0)
  })

  it('computes correct 30-day return for a single holding', () => {
    // AAPL: $100 → $110 = +10%
    const m = computePortfolioReturnMetrics(
      [{ ticker: 'AAPL', total_value_usd: 1000 }],
      { AAPL: candles(100, 110) },
      10,
      'annual',
    )
    expect(m.weighted_30d_return_pct).toBeCloseTo(10)
    expect(m.annualized_return_pct).toBeCloseTo(120)
    expect(m.target_annual_pct).toBe(10)
    expect(m.annual_gap_pct).toBeCloseTo(110)   // massively outperforming
    expect(m.data_coverage_pct).toBe(100)
  })

  it('weights returns by holding value', () => {
    // AAPL: $100 → $110 = +10%, value $1000
    // MSFT: $200 → $190 = -5%, value $1000
    // weighted = (10 * 1000 + -5 * 1000) / 2000 = 2.5%
    const m = computePortfolioReturnMetrics(
      [
        { ticker: 'AAPL', total_value_usd: 1000 },
        { ticker: 'MSFT', total_value_usd: 1000 },
      ],
      { AAPL: candles(100, 110), MSFT: candles(200, 190) },
      12,
      'annual',
    )
    expect(m.weighted_30d_return_pct).toBeCloseTo(2.5)
    expect(m.annualized_return_pct).toBeCloseTo(30)
    expect(m.annual_gap_pct).toBeCloseTo(18)   // 30 - 12
  })

  it('converts monthly target to annual for gap calculation', () => {
    // 2% per month = 24% per year target
    // Portfolio up 1% over 30d = 12% annualised → gap = -12%
    const m = computePortfolioReturnMetrics(
      [{ ticker: 'AAPL', total_value_usd: 500 }],
      { AAPL: candles(100, 101) },
      2,
      'monthly',
    )
    expect(m.target_annual_pct).toBe(24)
    expect(m.annualized_return_pct).toBeCloseTo(12)
    expect(m.annual_gap_pct).toBeCloseTo(-12)
  })

  it('excludes holdings with no price data from weighted return', () => {
    // AAPL has data (+10%), MSFT does not
    const m = computePortfolioReturnMetrics(
      [
        { ticker: 'AAPL', total_value_usd: 500 },
        { ticker: 'MSFT', total_value_usd: 500 },
      ],
      { AAPL: candles(100, 110) },
      10,
      'annual',
    )
    expect(m.weighted_30d_return_pct).toBeCloseTo(10)
    expect(m.data_coverage_pct).toBe(50)
  })

  it('returns 0 weighted return when no holdings have price data', () => {
    const m = computePortfolioReturnMetrics(
      [{ ticker: 'AAPL', total_value_usd: 1000 }],
      {},
      10,
      'annual',
    )
    expect(m.weighted_30d_return_pct).toBe(0)
    expect(m.data_coverage_pct).toBe(0)
  })

  it('skips a holding whose first candle close is 0 to avoid division by zero', () => {
    const m = computePortfolioReturnMetrics(
      [{ ticker: 'AAPL', total_value_usd: 1000 }],
      { AAPL: candles(0, 110) },
      10,
      'annual',
    )
    expect(m.weighted_30d_return_pct).toBe(0)
    expect(m.data_coverage_pct).toBe(0)
  })
})

describe('computeActionList', () => {
  it('produces action "buy" when target_usd > current_usd', () => {
    const result = computeActionList(
      [{ ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 200 }],
      0,
      [{ ticker: 'AAPL', target_pct: 100 }]
    )
    // current = 200, target = 200, delta = 0 — need a case where delta > 0
    const result2 = computeActionList(
      [{ ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 100 }],
      0,
      [{ ticker: 'AAPL', target_pct: 100 }]
    )
    // grand_total=100, target_usd=100, delta=0 — equal case; use cash to shift
    const result3 = computeActionList(
      [{ ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 500 }],
      500,
      [{ ticker: 'AAPL', target_pct: 100 }]
    )
    // grand_total=1000, target_usd=1000, current=500, delta=500 → buy
    const aapl3 = result3.find(a => a.ticker === 'AAPL')!
    expect(aapl3.action).toBe('buy')
    expect(aapl3.delta_usd).toBe(500)
    void result
    void result2
  })

  it('produces action "sell" when target_usd < current_usd', () => {
    const result = computeActionList(
      [{ ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 1000 }],
      0,
      [{ ticker: 'AAPL', target_pct: 50 }]
    )
    // grand_total=1000, target_usd=500, current=1000, delta=-500 → sell
    const aapl = result.find(a => a.ticker === 'AAPL')!
    expect(aapl.action).toBe('sell')
    expect(aapl.delta_usd).toBe(-500)
  })

  it('produces action "hold" when target_usd === current_usd', () => {
    const result = computeActionList(
      [{ ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 500 }],
      500,
      [{ ticker: 'AAPL', target_pct: 50 }]
    )
    // grand_total=1000, target_usd=500, current=500, delta=0 → hold
    const aapl = result.find(a => a.ticker === 'AAPL')!
    expect(aapl.action).toBe('hold')
    expect(aapl.delta_usd).toBe(0)
  })

  it('computes correct current_usd, target_usd, delta_usd with multiple holdings and cash', () => {
    const holdings = [
      { ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 300 },
      { ticker: 'MSFT', company_name: 'Microsoft Corp.', total_value_usd: 500 },
    ]
    const allocation = [
      { ticker: 'AAPL', target_pct: 40 },
      { ticker: 'MSFT', target_pct: 60 },
    ]
    // grand_total = 300 + 500 + 200(cash) = 1000
    const result = computeActionList(holdings, 200, allocation)
    const aapl = result.find(a => a.ticker === 'AAPL')!
    const msft = result.find(a => a.ticker === 'MSFT')!
    expect(aapl.current_usd).toBe(300)
    expect(aapl.target_usd).toBe(400)
    expect(aapl.delta_usd).toBe(100)
    expect(msft.current_usd).toBe(500)
    expect(msft.target_usd).toBe(600)
    expect(msft.delta_usd).toBe(100)
  })

  it('produces balanced action list when allocation sums to 100% and cash is 0', () => {
    const holdings = [
      { ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 700 },
      { ticker: 'MSFT', company_name: 'Microsoft Corp.', total_value_usd: 300 },
    ]
    const allocation = [
      { ticker: 'AAPL', target_pct: 50 },
      { ticker: 'MSFT', target_pct: 50 },
    ]
    // grand_total=1000, AAPL: target=500 delta=-200 (sell), MSFT: target=500 delta=200 (buy)
    const result = computeActionList(holdings, 0, allocation)
    const totalBuys = result.filter(a => a.action === 'buy').reduce((s, a) => s + a.delta_usd, 0)
    const totalSells = result.filter(a => a.action === 'sell').reduce((s, a) => s + Math.abs(a.delta_usd), 0)
    expect(totalBuys).toBeCloseTo(totalSells, 2)
  })

  it('includes ticker absent from holdings with current_usd 0 and action "buy"', () => {
    const result = computeActionList(
      [],
      1000,
      [{ ticker: 'NVDA', target_pct: 100 }]
    )
    // grand_total=1000, NVDA: current=0, target=1000, delta=1000 → buy
    const nvda = result.find(a => a.ticker === 'NVDA')!
    expect(nvda.current_usd).toBe(0)
    expect(nvda.action).toBe('buy')
    expect(nvda.delta_usd).toBe(1000)
  })

  it('includes ticker absent from allocation with target_pct 0, target_usd 0, action "sell"', () => {
    const result = computeActionList(
      [{ ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 500 }],
      0,
      []
    )
    // grand_total=500, AAPL: target_pct=0, target_usd=0, delta=-500 → sell
    const aapl = result.find(a => a.ticker === 'AAPL')!
    expect(aapl.target_pct).toBe(0)
    expect(aapl.target_usd).toBe(0)
    expect(aapl.action).toBe('sell')
  })

  it('returns all current_pct as 0 and target_usd as 0 when grand_total is 0', () => {
    const result = computeActionList(
      [{ ticker: 'AAPL', company_name: 'Apple Inc.', total_value_usd: 0 }],
      0,
      [{ ticker: 'AAPL', target_pct: 100 }]
    )
    const aapl = result.find(a => a.ticker === 'AAPL')!
    expect(aapl.current_pct).toBe(0)
    expect(aapl.target_usd).toBe(0)
    expect(aapl.action).toBe('hold') // delta = 0 - 0 = 0
  })
})
