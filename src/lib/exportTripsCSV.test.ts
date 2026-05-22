import { describe, it, expect } from 'vitest'
import { exportTripsCSV } from './exportTripsCSV'
import { TripWithUsers } from '@/types/database'

function makeTrip(overrides: Partial<TripWithUsers> = {}): TripWithUsers {
  return {
    id: 'trip-1',
    owner_id: 'user-1',
    source: 'search',
    trip_type: 'round_trip',
    days_outside_uk: 4,
    created_by: 'user-1',
    last_modified_by: 'user-1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    creator: { display_name: 'Alice' },
    modifier: { display_name: 'Alice' },
    legs: [
      {
        id: 'leg-1',
        trip_id: 'trip-1',
        leg_order: 1,
        from_airport: 'LHR',
        to_airport: 'CDG',
        airline: 'BA',
        flight_number: 'BA001',
        departure_at: '2026-05-01T08:00:00Z',
        arrival_at: '2026-05-01T10:00:00Z',
        created_at: '2026-04-01T00:00:00Z',
      },
      {
        id: 'leg-2',
        trip_id: 'trip-1',
        leg_order: 2,
        from_airport: 'CDG',
        to_airport: 'LHR',
        airline: 'AF',
        flight_number: 'AF002',
        departure_at: '2026-05-05T12:00:00Z',
        arrival_at: '2026-05-05T14:00:00Z',
        created_at: '2026-04-01T00:00:00Z',
      },
    ],
    ...overrides,
  }
}

describe('exportTripsCSV', () => {
  it('generates CSV header row for empty input', () => {
    const result = exportTripsCSV([])
    expect(result).toContain('Departure Airport,Destination Airport')
    expect(result).toContain('Days Outside UK,Created Date')
  })

  it('includes only header when trips array is empty', () => {
    const result = exportTripsCSV([])
    const lines = result.split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(1)
  })

  it('formats a single trip with all fields correctly', () => {
    const result = exportTripsCSV([makeTrip()])
    const lines = result.split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(2)
    expect(result).toContain('LHR')
    expect(result).toContain('CDG')
    expect(result).toContain('BA')
    expect(result).toContain('BA001')
    expect(result).toContain('AF')
    expect(result).toContain('AF002')
    expect(result).toContain('4')
    expect(result).toContain('2026-04-01')
  })

  it('produces header + N rows for multiple trips', () => {
    const trips = [makeTrip({ id: 'trip-1' }), makeTrip({ id: 'trip-2' }), makeTrip({ id: 'trip-3' })]
    const lines = exportTripsCSV(trips).split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(4) // 1 header + 3 rows
  })

  it('formats datetimes as YYYY-MM-DD HH:MM:SS (UTC)', () => {
    const result = exportTripsCSV([makeTrip()])
    expect(result).toContain('2026-05-01 08:00:00')
    expect(result).toContain('2026-05-01 10:00:00')
    expect(result).toContain('2026-05-05 12:00:00')
    expect(result).toContain('2026-05-05 14:00:00')
  })

  it('formats created_at as YYYY-MM-DD only', () => {
    const result = exportTripsCSV([makeTrip()])
    expect(result).toContain('2026-04-01')
    expect(result).not.toContain('2026-04-01T')
  })

  it('escapes commas in airline names per RFC 4180', () => {
    const trip = makeTrip()
    trip.legs[0].airline = 'Air France, KLM'
    const result = exportTripsCSV([trip])
    expect(result).toContain('"Air France, KLM"')
  })

  it('escapes quotes in values per RFC 4180', () => {
    const trip = makeTrip()
    trip.legs[0].airline = 'O\'Brien Airways'
    trip.legs[0].flight_number = '"OB001"'
    const result = exportTripsCSV([trip])
    expect(result).toContain('""OB001""')
  })

  it('outputs empty strings (not "null") for null fields', () => {
    const trip = makeTrip()
    trip.legs[0].airline = null
    trip.legs[0].flight_number = null
    trip.legs[0].arrival_at = null
    const result = exportTripsCSV([trip])
    expect(result).not.toContain('null')
    const dataRow = result.split('\r\n')[1]
    expect(dataRow).toContain(',,')
  })

  it('handles trip with no return leg (one leg only)', () => {
    const trip = makeTrip()
    trip.legs = [trip.legs[0]]
    trip.trip_type = 'round_trip'
    const result = exportTripsCSV([trip])
    expect(result).not.toContain('null')
    const dataRow = result.split('\r\n')[1]
    // Return fields should be empty
    expect(dataRow).toContain(',,')
  })

  it('uses last leg for return fields on multi-city trip', () => {
    const trip = makeTrip()
    trip.trip_type = 'multi_city'
    trip.legs = [
      { ...trip.legs[0], from_airport: 'LHR', to_airport: 'CDG', airline: 'BA', flight_number: 'BA001', departure_at: '2026-05-01T08:00:00Z', arrival_at: '2026-05-01T10:00:00Z' },
      { id: 'leg-mid', trip_id: 'trip-1', leg_order: 2, from_airport: 'CDG', to_airport: 'FCO', airline: 'AF', flight_number: 'AF100', departure_at: '2026-05-03T09:00:00Z', arrival_at: '2026-05-03T11:00:00Z', created_at: '2026-04-01T00:00:00Z' },
      { id: 'leg-ret', trip_id: 'trip-1', leg_order: 3, from_airport: 'FCO', to_airport: 'LHR', airline: 'IB', flight_number: 'IB999', departure_at: '2026-05-07T15:00:00Z', arrival_at: '2026-05-07T17:00:00Z', created_at: '2026-04-01T00:00:00Z' },
    ]
    const result = exportTripsCSV([trip])
    expect(result).toContain('IB')
    expect(result).toContain('IB999')
    expect(result).toContain('2026-05-07 15:00:00')
  })

  it('handles manual trip with null arrival_at on all legs', () => {
    const trip = makeTrip({ source: 'manual' })
    trip.legs = trip.legs.map(l => ({ ...l, airline: null, flight_number: null, arrival_at: null }))
    const result = exportTripsCSV([trip])
    expect(result).not.toContain('null')
  })
})
