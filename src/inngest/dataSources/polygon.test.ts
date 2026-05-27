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
