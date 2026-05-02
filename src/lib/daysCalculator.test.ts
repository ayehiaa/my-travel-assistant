import { describe, it, expect } from 'vitest'
import { daysOutsideUK } from './daysCalculator'

describe('daysOutsideUK', () => {
  it('returns 4 for May 5 → May 10 (the documented example)', () => {
    expect(daysOutsideUK('2025-05-05T10:00:00', '2025-05-10T14:00:00')).toBe(4)
  })

  it('returns 0 for same-day departure and return', () => {
    expect(daysOutsideUK('2025-05-05T08:00:00', '2025-05-05T22:00:00')).toBe(0)
  })

  it('returns 0 for consecutive days (back the next day)', () => {
    expect(daysOutsideUK('2025-05-05T08:00:00', '2025-05-06T18:00:00')).toBe(0)
  })

  it('returns 1 for a two-night stay', () => {
    expect(daysOutsideUK('2025-05-05T08:00:00', '2025-05-07T18:00:00')).toBe(1)
  })

  it('ignores time component — only dates matter', () => {
    expect(daysOutsideUK('2025-05-05T23:59:00', '2025-05-10T00:01:00')).toBe(4)
  })
})
