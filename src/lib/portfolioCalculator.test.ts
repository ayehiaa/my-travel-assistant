import { describe, it, expect } from 'vitest'
import { computeHoldingSummaries, formatUsd } from './portfolioCalculator'

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
