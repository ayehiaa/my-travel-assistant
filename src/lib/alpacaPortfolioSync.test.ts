import { describe, it, expect } from 'vitest'
import { getAlpacaBaseUrl } from './alpacaClient'

// ── getAlpacaBaseUrl ────────────────────────────────────────────────────────────
//
// syncAlpacaPositions and syncAlpacaPositionsForUser are not unit-tested here
// because they require both a live Supabase admin client and a network call to
// Alpaca. Mocking either would violate the project's "pure functions only" rule.
// The reconciliation logic (parseFloat guards, zero/negative market_value filter,
// update vs insert routing) is embedded inside syncAlpacaPositions with no
// extractable pure helper, so integration coverage is left to end-to-end tests.

describe('getAlpacaBaseUrl', () => {
  it('returns the paper trading URL when isPaper is true', () => {
    expect(getAlpacaBaseUrl(true)).toBe('https://paper-api.alpaca.markets')
  })

  it('returns the live trading URL when isPaper is false', () => {
    expect(getAlpacaBaseUrl(false)).toBe('https://api.alpaca.markets')
  })

  it('paper URL does not equal live URL', () => {
    expect(getAlpacaBaseUrl(true)).not.toBe(getAlpacaBaseUrl(false))
  })

  it('both URLs use HTTPS', () => {
    expect(getAlpacaBaseUrl(true).startsWith('https://')).toBe(true)
    expect(getAlpacaBaseUrl(false).startsWith('https://')).toBe(true)
  })
})
