import { describe, expect, it } from 'vitest'
import { appWindow, daysOutsideInWindow, filterExpenses, filterTrips, groupExpenses, summarizeTrip, totalsByCurrency, type ExpenseRow, type TripRow } from './travelData'

const trip = (id: string, legs: Array<[string, string, string]>): TripRow => ({
  id, created_at: '2026-01-01T00:00:00Z', days_outside_uk: 0, trip_type: 'round_trip',
  legs: legs.map(([from, to, dep], i) => ({ from_airport: from, to_airport: to, departure_at: dep, leg_order: i })),
})

const dubai = trip('t1', [['LHR', 'DXB', '2026-03-01T08:00:00Z'], ['DXB', 'LHR', '2026-03-11T08:00:00Z']])
const ny = trip('t2', [['LHR', 'JFK', '2026-12-20T08:00:00Z'], ['JFK', 'LHR', '2026-12-28T08:00:00Z']])
const old = trip('t3', [['LGW', 'AMS', '2025-10-30T08:00:00Z'], ['AMS', 'LGW', '2025-11-05T08:00:00Z']])

describe('trips', () => {
  it('summarises a trip as route, dates and legs', () => {
    expect(summarizeTrip(dubai)).toMatchObject({ route: 'LHR → DXB → LHR', start: '2026-03-01', end: '2026-03-11', legs: 2 })
  })

  it('filters upcoming / past / destination / window and orders them', () => {
    const all = [dubai, ny, old]
    expect(filterTrips(all, { when: 'upcoming' }, '2026-11-26').map(t => t.id)).toEqual(['t2'])
    expect(filterTrips(all, { when: 'past' }, '2026-11-26').map(t => t.id)).toEqual(['t1', 't3'])
    expect(filterTrips(all, { destinationContains: 'jfk' }, '2026-11-26').map(t => t.id)).toEqual(['t2'])
    expect(filterTrips(all, { from: '2026-03-10', to: '2026-04-01' }, '2026-11-26').map(t => t.id)).toEqual(['t1'])
  })

  it('counts days outside the UK like the dashboard (departure and return days excluded, clipped to the window)', () => {
    const r = daysOutsideInWindow([dubai, ny, old], '2025-11-26', '2026-11-26')
    expect(r.trips.map(t => [t.id, t.daysInWindow])).toEqual([['t1', 9]])
    expect(r.totalDays).toBe(9)
    const clipped = daysOutsideInWindow([old], '2025-11-03', '2026-11-03')
    expect(clipped.totalDays).toBe(2) // 3 and 4 Nov
  })

  it('uses a one-year window ending at the reference date', () => {
    expect(appWindow('2026-11-26')).toEqual({ start: '2025-11-26', end: '2026-11-26' })
  })
})

describe('expenses', () => {
  const e = (id: string, date: string, amount: number, currency: string, cat: string, reclaimed = false, trip_id: string | null = null): ExpenseRow =>
    ({ id, title: `Item ${id}`, amount, currency, expense_date: date, reclaimed, trip_id, category: { name: cat }, notes: id === 'e3' ? 'Taxi to airport' : null })
  const rows = [
    e('e1', '2026-10-03', 100, 'GBP', 'Hotel', true, 't1'),
    e('e2', '2026-10-15', 20.5, 'GBP', 'Food'),
    e('e3', '2026-11-01', 40, 'USD', 'Transport', false, 't1'),
    e('e4', '2026-11-02', 9.99, 'GBP', 'Food'),
  ]

  it('filters by range, category, reclaimed and text', () => {
    expect(filterExpenses(rows, { from: '2026-10-01', to: '2026-10-31' }).map(r => r.id)).toEqual(['e2', 'e1'])
    expect(filterExpenses(rows, { category: 'foo' }).map(r => r.id)).toEqual(['e4', 'e2'])
    expect(filterExpenses(rows, { reclaimed: 'no' }).map(r => r.id)).toEqual(['e4', 'e3', 'e2'])
    expect(filterExpenses(rows, { textContains: 'TAXI' }).map(r => r.id)).toEqual(['e3'])
    expect(filterExpenses(rows, { tripId: 't1' }).map(r => r.id)).toEqual(['e3', 'e1'])
  })

  it('totals per currency without converting', () => {
    expect(totalsByCurrency(rows)).toEqual({
      GBP: { total: 130.49, reclaimed: 100, pending: 30.49, count: 3 },
      USD: { total: 40, reclaimed: 0, pending: 40, count: 1 },
    })
  })

  it('groups by category, month and trip', () => {
    expect(groupExpenses(rows, 'category').map(g => g.key)).toEqual(['Food', 'Hotel', 'Transport'])
    expect(groupExpenses(rows, 'month').map(g => [g.key, g.byCurrency.GBP?.total ?? 0])).toEqual([['2026-10', 120.5], ['2026-11', 9.99]])
    const byTrip = groupExpenses(rows, 'trip', id => `Trip ${id}`)
    expect(byTrip.map(g => g.label)).toEqual(['Trip t1', 'Not linked to a trip'])
  })
})
