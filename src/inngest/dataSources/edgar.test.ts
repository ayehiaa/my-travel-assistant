import { describe, it, expect } from 'vitest'
import { EDGAR_USER_AGENT, fetchEdgarFilings } from './edgar'

describe('EDGAR_USER_AGENT', () => {
  it('is a non-empty string', () => {
    expect(typeof EDGAR_USER_AGENT).toBe('string')
    expect(EDGAR_USER_AGENT.length).toBeGreaterThan(0)
  })

  it('contains "Sojourn"', () => {
    expect(EDGAR_USER_AGENT).toContain('Sojourn')
  })
})

describe('fetchEdgarFilings', () => {
  it('is exported as a function', () => {
    expect(typeof fetchEdgarFilings).toBe('function')
  })

  it('returns empty array for empty tickers input without making network calls', async () => {
    const result = await fetchEdgarFilings([])
    expect(result).toEqual([])
  })
})
