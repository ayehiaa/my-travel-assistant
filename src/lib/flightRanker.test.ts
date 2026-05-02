import { describe, it, expect } from 'vitest'
import { rankAndFilter } from './flightRanker'
import { FlightOffer } from '@/types/flights'

function offer(partial: Partial<FlightOffer> & { id: string }): FlightOffer {
  return {
    airline: 'Test Airline',
    airlineCode: 'TA',
    flightNumber: 'TA100',
    departureAt: '2025-06-01T09:00:00',
    arrivalAt: '2025-06-01T11:00:00',
    durationMinutes: 120,
    stops: 0,
    price: 200,
    currency: 'GBP',
    isBA: false,
    ...partial,
  }
}

describe('rankAndFilter', () => {
  describe('time slot filtering', () => {
    it('returns only morning flights (06:00–12:59) for morning slot', () => {
      const offers = [
        offer({ id: '1', departureAt: '2025-06-01T05:59:00' }),
        offer({ id: '2', departureAt: '2025-06-01T06:00:00' }),
        offer({ id: '3', departureAt: '2025-06-01T12:59:00' }),
        offer({ id: '4', departureAt: '2025-06-01T13:00:00' }),
      ]
      const result = rankAndFilter(offers, 'morning', 10)
      expect(result.map(o => o.id)).toEqual(['2', '3'])
    })

    it('returns only evening flights (13:00–23:59) for evening slot', () => {
      const offers = [
        offer({ id: '1', departureAt: '2025-06-01T12:59:00' }),
        offer({ id: '2', departureAt: '2025-06-01T13:00:00' }),
        offer({ id: '3', departureAt: '2025-06-01T23:59:00' }),
      ]
      const result = rankAndFilter(offers, 'evening', 10)
      expect(result.map(o => o.id)).toEqual(['2', '3'])
    })
  })

  describe('BA priority', () => {
    it('places BA flights before non-BA flights regardless of stops or duration', () => {
      const offers = [
        offer({ id: '1', isBA: false, stops: 0, durationMinutes: 90 }),
        offer({ id: '2', isBA: true,  stops: 1, durationMinutes: 200 }),
        offer({ id: '3', isBA: false, stops: 0, durationMinutes: 80 }),
      ]
      const [first] = rankAndFilter(offers, 'morning', 10)
      expect(first.id).toBe('2')
    })
  })

  describe('stop count ranking', () => {
    it('sorts direct flights before flights with stops', () => {
      const offers = [
        offer({ id: '1', stops: 1, durationMinutes: 100 }),
        offer({ id: '2', stops: 0, durationMinutes: 150 }),
      ]
      const result = rankAndFilter(offers, 'morning', 10)
      expect(result[0].id).toBe('2')
    })
  })

  describe('duration tiebreaker', () => {
    it('within the same stop count, sorts by fastest duration', () => {
      const offers = [
        offer({ id: '1', stops: 0, durationMinutes: 150 }),
        offer({ id: '2', stops: 0, durationMinutes: 90 }),
        offer({ id: '3', stops: 0, durationMinutes: 120 }),
      ]
      const result = rankAndFilter(offers, 'morning', 10)
      expect(result.map(o => o.id)).toEqual(['2', '3', '1'])
    })
  })

  describe('limit', () => {
    it('returns at most `limit` results', () => {
      const offers = Array.from({ length: 10 }, (_, i) =>
        offer({ id: String(i), departureAt: `2025-06-01T0${Math.min(i + 6, 9)}:00:00` })
      )
      expect(rankAndFilter(offers, 'morning', 3)).toHaveLength(3)
    })
  })
})
