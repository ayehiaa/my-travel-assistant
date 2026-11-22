import { describe, it, expect } from 'vitest'
import { SEED_PROGRAMME as def } from './seedProgramme'
import { DayTimezoneInputSchema, resolveTimezone, restaurantTips, rowsToTrips, tripOn, tripRanges } from './travel'

const trips = rowsToTrips([
  { id: 't1', trip_type: 'round_trip', legs: [
    { departure_at: '2026-11-20T08:00:00Z', arrival_at: '2026-11-20T15:00:00Z', from_airport: 'LHR', to_airport: 'DXB' },
    { departure_at: '2026-11-27T02:00:00Z', arrival_at: '2026-11-27T06:30:00Z', from_airport: 'DXB', to_airport: 'LHR' },
  ] },
  { id: 't2', trip_type: 'one_way', legs: [{ departure_at: '2026-12-10T22:30:00Z', arrival_at: null, from_airport: 'LGW', to_airport: 'CDG' }] },
  { id: 't3', trip_type: 'round_trip', legs: [] },
])

describe('trip ranges', () => {
  it('covers departure → last arrival; one-way = travel day only', () => {
    const r = tripRanges(trips, 'Europe/London')
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ tripId: 't1', start: '2026-11-20', end: '2026-11-27', label: 'LHR → DXB' })
    expect(r[1]).toMatchObject({ start: '2026-12-10', end: '2026-12-10' })
    expect(tripOn(r, '2026-11-24')?.tripId).toBe('t1')
    expect(tripOn(r, '2026-11-28')).toBeNull()
  })
})

describe('resolveTimezone', () => {
  it('uses an override when it is that date in the override tz', () => {
    const now = new Date('2026-11-21T21:30:00Z') // London 21:30 on the 21st; Dubai 01:30 on the 22nd
    expect(resolveTimezone(now, 'Europe/London', [])).toBe('Europe/London')
    expect(resolveTimezone(now, 'Europe/London', [{ date: '2026-11-22', timezone: 'Asia/Dubai' }])).toBe('Asia/Dubai')
    expect(resolveTimezone(now, 'Europe/London', [{ date: '2026-11-21', timezone: 'Asia/Dubai' }])).toBe('Europe/London')
    expect(resolveTimezone(now, 'Europe/London', [{ date: '2026-11-21', timezone: 'Asia/Dubai' }, { date: '2026-11-22', timezone: 'Asia/Dubai' }])).toBe('Asia/Dubai')
  })
  it('validates input', () => {
    expect(DayTimezoneInputSchema.safeParse({ dates: ['2026-11-22'], timezone: 'Mars/Base' }).success).toBe(false)
    expect(DayTimezoneInputSchema.safeParse({ dates: ['2026-11-22'], timezone: null }).success).toBe(true)
  })
})

describe('restaurantTips', () => {
  it('item-specific asks first, then programme rules; max 5', () => {
    const tips = restaurantTips(def, [
      { name: 'Grilled steak with peppercorn sauce', satFatG: 14, kcal: 700, components: { starch_servings: 1 } },
      { name: 'Chips', satFatG: 2, kcal: 400, components: { starch_servings: 1 } },
    ], 6)
    expect(tips[0]).toMatch(/sauce on the side/)
    expect(tips.join(' ')).toMatch(/no butter on the grill/)
    expect(tips.join(' ')).toMatch(/fried for grilled/)
    expect(tips.join(' ')).toMatch(/more than you have left/)
    expect(tips.length).toBeLessThanOrEqual(5)
  })
  it('falls back to the eating-out rules', () => {
    expect(restaurantTips(def, [], null)).toEqual(def.eatingOut.slice(0, 5))
  })
})
