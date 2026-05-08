import { describe, it, expect } from 'vitest'
import { daysOutsideUK, daysOutsideUKInWindow } from './daysCalculator'

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

describe('daysOutsideUKInWindow', () => {
  const win = (start: string, end: string) => ({ windowStart: new Date(start), windowEnd: new Date(end) })

  it('trip fully inside window — same as daysOutsideUK', () => {
    const { windowStart, windowEnd } = win('2025-07-15', '2026-07-15')
    expect(daysOutsideUKInWindow('2025-08-01T10:00:00', '2025-08-10T10:00:00', windowStart, windowEnd)).toBe(8)
  })

  it('trip crosses window start boundary — counts only days inside (agreed example: 4 days)', () => {
    const { windowStart, windowEnd } = win('2025-07-15', '2026-07-15')
    // trip 10 Jul → 20 Jul: clipped to 15 Jul → 20 Jul = 5 days diff → 4 days counted
    expect(daysOutsideUKInWindow('2025-07-10T10:00:00', '2025-07-20T10:00:00', windowStart, windowEnd)).toBe(4)
  })

  it('trip crosses window end boundary — counts only days inside', () => {
    const { windowStart, windowEnd } = win('2025-07-15', '2026-07-15')
    // trip 10 Jul 2026 → 20 Jul 2026: clipped to 10 Jul → 15 Jul = 5 days diff → 4 days counted
    expect(daysOutsideUKInWindow('2026-07-10T10:00:00', '2026-07-20T10:00:00', windowStart, windowEnd)).toBe(4)
  })

  it('trip entirely before window — returns 0', () => {
    const { windowStart, windowEnd } = win('2025-07-15', '2026-07-15')
    expect(daysOutsideUKInWindow('2025-06-01T10:00:00', '2025-07-14T10:00:00', windowStart, windowEnd)).toBe(0)
  })

  it('trip entirely after window — returns 0', () => {
    const { windowStart, windowEnd } = win('2025-07-15', '2026-07-15')
    expect(daysOutsideUKInWindow('2026-07-16T10:00:00', '2026-07-20T10:00:00', windowStart, windowEnd)).toBe(0)
  })

  it('trip spans entire window — counts full window minus boundary days', () => {
    const { windowStart, windowEnd } = win('2026-01-01', '2026-01-10')
    // clipped = entire window: 10 - 1 = 9 days diff → 8 days
    expect(daysOutsideUKInWindow('2025-12-01T10:00:00', '2026-01-20T10:00:00', windowStart, windowEnd)).toBe(8)
  })
})
