import { describe, it, expect } from 'vitest'
import { buildLiveSnapshot } from './alpacaLivePortfolio'

describe('buildLiveSnapshot', () => {
  it('maps positions, uses names, and sorts by value descending', () => {
    const result = buildLiveSnapshot(
      [
        { symbol: 'AAPL', qty: '2.5', market_value: '500.00' },
        { symbol: 'VTI', qty: '10', market_value: '2500.50' },
      ],
      1000,
      { AAPL: 'Apple Inc.', VTI: 'Vanguard Total Stock Market ETF' },
    )
    expect(result.holdings).toEqual([
      { ticker: 'VTI', company_name: 'Vanguard Total Stock Market ETF', qty: 10, total_value_usd: 2500.5 },
      { ticker: 'AAPL', company_name: 'Apple Inc.', qty: 2.5, total_value_usd: 500 },
    ])
    expect(result.cash_usd).toBe(1000)
    expect(result.total_value_usd).toBeCloseTo(4000.5)
  })

  it('falls back to the ticker when no name is known', () => {
    const result = buildLiveSnapshot([{ symbol: 'XYZ', qty: '1', market_value: '10' }], 0, {})
    expect(result.holdings[0].company_name).toBe('XYZ')
  })

  it('skips zero, negative and unparseable market values', () => {
    const result = buildLiveSnapshot(
      [
        { symbol: 'A', qty: '1', market_value: '0' },
        { symbol: 'B', qty: '-1', market_value: '-50' },
        { symbol: 'C', qty: '1', market_value: 'abc' },
      ],
      200,
      {},
    )
    expect(result.holdings).toEqual([])
    expect(result.total_value_usd).toBe(200)
  })

  it('handles a cash-only account', () => {
    const result = buildLiveSnapshot([], 5000, {})
    expect(result.holdings).toEqual([])
    expect(result.cash_usd).toBe(5000)
    expect(result.total_value_usd).toBe(5000)
  })

  it('treats non-finite cash as zero', () => {
    expect(buildLiveSnapshot([], NaN, {}).cash_usd).toBe(0)
  })
})

describe('buildLiveSnapshot — P&L fields', () => {
  it('copies unrealised P&L, avg entry and price when Alpaca returns them', () => {
    const result = buildLiveSnapshot(
      [{
        symbol: 'MSFT', qty: '3', market_value: '1200',
        avg_entry_price: '350.5', current_price: '400', cost_basis: '1051.5',
        unrealized_pl: '148.5', unrealized_plpc: '0.1412',
      }],
      0,
      {},
    )
    expect(result.holdings[0]).toEqual({
      ticker: 'MSFT', company_name: 'MSFT', qty: 3, total_value_usd: 1200,
      avg_entry_price: 350.5, current_price: 400, cost_basis: 1051.5, unrealized_pl: 148.5, unrealized_plpc: 0.1412,
    })
  })

  it('leaves out missing, empty or unparseable P&L values', () => {
    const result = buildLiveSnapshot(
      [{ symbol: 'A', qty: '1', market_value: '10', unrealized_pl: '', unrealized_plpc: 'n/a', avg_entry_price: null }],
      0,
      {},
    )
    expect(Object.keys(result.holdings[0]).sort()).toEqual(['company_name', 'qty', 'ticker', 'total_value_usd'])
  })

  it('keeps negative P&L', () => {
    const result = buildLiveSnapshot([{ symbol: 'A', qty: '1', market_value: '90', unrealized_pl: '-10', unrealized_plpc: '-0.1' }], 0, {})
    expect(result.holdings[0].unrealized_pl).toBe(-10)
    expect(result.holdings[0].unrealized_plpc).toBe(-0.1)
  })
})
