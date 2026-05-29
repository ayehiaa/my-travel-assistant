import { describe, it, expect } from 'vitest'
import { getMostVisitedCountry } from './mostVisitedCountry'

function makeTrip(legPairs: [string, string][]) {
  return {
    id: Math.random().toString(),
    days_outside_uk: 1,
    legs: legPairs.map(([from_airport, to_airport], i) => ({
      from_airport,
      to_airport,
      departure_at: '2025-01-01T10:00:00',
      leg_order: i + 1,
    })),
  }
}

describe('getMostVisitedCountry', () => {
  it('returns null with no trips', () => {
    expect(getMostVisitedCountry([])).toBeNull()
  })

  it('returns United Kingdom with count 1 for a single trip visiting UK', () => {
    // CDG→LHR (leg 1) and LHR→CDG (leg 2 — return, excluded by slice)
    // Only leg 1 destination counts: UK
    const trips = [makeTrip([['CDG', 'LHR'], ['LHR', 'CDG']])]
    expect(getMostVisitedCountry(trips)).toEqual({ country: 'United Kingdom', count: 1 })
  })

  it('returns country with highest visit count across multiple trips', () => {
    const france1 = makeTrip([['LHR', 'CDG'], ['CDG', 'LHR']])
    const france2 = makeTrip([['LHR', 'NCE'], ['NCE', 'LHR']])
    const spain   = makeTrip([['LHR', 'MAD'], ['MAD', 'LHR']])
    expect(getMostVisitedCountry([france1, france2, spain])).toEqual({ country: 'France', count: 2 })
  })

  it('returns one result consistently when two countries are tied', () => {
    const france = makeTrip([['LHR', 'CDG'], ['CDG', 'LHR']])
    const spain  = makeTrip([['LHR', 'MAD'], ['MAD', 'LHR']])
    const result1 = getMostVisitedCountry([france, spain])
    const result2 = getMostVisitedCountry([france, spain])
    expect(result1).not.toBeNull()
    expect(result1).toEqual(result2)
    expect(result1!.count).toBe(1)
  })

  it('counts only destination countries (to_airport), not origin countries (from_airport)', () => {
    // LHR→CDG→MAD→LHR: slice(0,-1) gives legs to CDG (France) and MAD (Spain)
    // UK (LHR) only appears as the last-leg destination and is excluded
    const trip = makeTrip([['LHR', 'CDG'], ['CDG', 'MAD'], ['MAD', 'LHR']])
    const result = getMostVisitedCountry([trip])
    expect(result).not.toBeNull()
    expect(['France', 'Spain']).toContain(result!.country)
    expect(result!.count).toBe(1)
  })
})
