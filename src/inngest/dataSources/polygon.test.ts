import { describe, it, expect } from 'vitest'
import { fetchPriceHistory, fetchTickerDetails } from './polygon'

describe('fetchPriceHistory', () => {
  it('is exported as a function', () => {
    expect(typeof fetchPriceHistory).toBe('function')
  })

  it('returns {} for empty tickers array', async () => {
    const result = await fetchPriceHistory([])
    expect(result).toEqual({})
  })

  it('returns {} when POLYGON_API_KEY is not set', async () => {
    const original = process.env.POLYGON_API_KEY
    delete process.env.POLYGON_API_KEY
    const result = await fetchPriceHistory(['AAPL'])
    expect(result).toEqual({})
    process.env.POLYGON_API_KEY = original
  })

  it('returns a plain object, not an array', async () => {
    // No network call — empty tickers hits the early-return guard
    const result = await fetchPriceHistory([])
    expect(typeof result).toBe('object')
    expect(Array.isArray(result)).toBe(false)
  })
})

describe('fetchTickerDetails', () => {
  it('is exported as a function', () => {
    expect(typeof fetchTickerDetails).toBe('function')
  })

  it('returns {} for empty tickers array', async () => {
    const result = await fetchTickerDetails([])
    expect(result).toEqual({})
  })

  it('returns {} when POLYGON_API_KEY is not set', async () => {
    const original = process.env.POLYGON_API_KEY
    delete process.env.POLYGON_API_KEY
    const result = await fetchTickerDetails(['AAPL'])
    expect(result).toEqual({})
    process.env.POLYGON_API_KEY = original
  })
})

describe('parseTickerDetail', () => {
  it('captures type, sic_code and market_cap', async () => {
    const { parseTickerDetail } = await import('./polygon')
    const d = parseTickerDetail('AAPL', {
      results: { ticker: 'AAPL', name: 'Apple Inc.', sic_description: 'Electronic computers', primary_exchange: 'XNAS', type: 'CS', sic_code: '3571', market_cap: 3e12 },
    })
    expect(d).toMatchObject({ type: 'CS', sic_code: '3571', market_cap: 3e12, name: 'Apple Inc.' })
  })

  it('returns null fields for a missing payload', async () => {
    const { parseTickerDetail } = await import('./polygon')
    expect(parseTickerDetail('X', {})).toEqual({
      ticker: 'X', name: 'X', sic_description: null, primary_exchange: null, type: null, sic_code: null, market_cap: null,
    })
  })
})

describe('parseFinancialsResponse', () => {
  it('extracts balance sheet and income statement items', async () => {
    const { parseFinancialsResponse } = await import('./polygon')
    const f = parseFinancialsResponse({
      results: [{
        end_date: '2026-06-30',
        financials: {
          balance_sheet: {
            liabilities: { value: 300 }, long_term_debt: { value: 100 }, current_assets: { value: 200 },
            accounts_receivable: { value: 40 }, cash: { value: 50 },
          },
          income_statement: { revenues: { value: 1000 } },
        },
      }],
    })
    expect(f).toEqual({
      period_end: '2026-06-30', total_liabilities: 300, long_term_debt: 100, current_debt: null, current_assets: 200,
      cash: 50, short_term_investments: null, accounts_receivable: 40, revenues: 1000,
    })
  })

  it('returns null when no financials are available', async () => {
    const { parseFinancialsResponse } = await import('./polygon')
    expect(parseFinancialsResponse({ results: [] })).toBeNull()
    expect(parseFinancialsResponse(null)).toBeNull()
  })
})

describe('fetchLatestFinancials', () => {
  it('returns {} without tickers or API key', async () => {
    const { fetchLatestFinancials } = await import('./polygon')
    expect(await fetchLatestFinancials([])).toEqual({})
    const original = process.env.POLYGON_API_KEY
    delete process.env.POLYGON_API_KEY
    expect(await fetchLatestFinancials(['AAPL'])).toEqual({})
    if (original !== undefined) process.env.POLYGON_API_KEY = original
  })
})
