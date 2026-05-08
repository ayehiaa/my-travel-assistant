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
    // firstDay=2 Aug, lastDay=9 Aug → 8 days
    expect(daysOutsideUKInWindow('2025-08-01T10:00:00', '2025-08-10T10:00:00', windowStart, windowEnd)).toBe(8)
  })

  it('trip crosses window start — window boundary is counted (not a travel day)', () => {
    const { windowStart, windowEnd } = win('2025-07-15', '2026-07-15')
    // trip 10 Jul → 20 Jul: days abroad = 11–19 Jul, intersect with window [15 Jul, …] = 15,16,17,18,19 = 5
    expect(daysOutsideUKInWindow('2025-07-10T10:00:00', '2025-07-20T10:00:00', windowStart, windowEnd)).toBe(5)
  })

  it('real case: trip 8 Jul → 17 Jul, window starts 12 Jul → 5 days', () => {
    const { windowStart, windowEnd } = win('2025-07-12', '2026-07-12')
    // days abroad = 9–16 Jul, intersect [12 Jul, …] = 12,13,14,15,16 = 5
    expect(daysOutsideUKInWindow('2025-07-08T00:00:00', '2025-07-17T00:00:00', windowStart, windowEnd)).toBe(5)
  })

  it('trip crosses window end — window boundary is counted (not a travel day)', () => {
    const { windowStart, windowEnd } = win('2025-07-15', '2026-07-15')
    // trip 10 Jul 2026 → 20 Jul 2026: days abroad = 11–19 Jul, intersect […, 15 Jul] = 11,12,13,14,15 = 5
    expect(daysOutsideUKInWindow('2026-07-10T10:00:00', '2026-07-20T10:00:00', windowStart, windowEnd)).toBe(5)
  })

  it('trip entirely before window — returns 0', () => {
    const { windowStart, windowEnd } = win('2025-07-15', '2026-07-15')
    expect(daysOutsideUKInWindow('2025-06-01T10:00:00', '2025-07-14T10:00:00', windowStart, windowEnd)).toBe(0)
  })

  it('trip entirely after window — returns 0', () => {
    const { windowStart, windowEnd } = win('2025-07-15', '2026-07-15')
    expect(daysOutsideUKInWindow('2026-07-16T10:00:00', '2026-07-20T10:00:00', windowStart, windowEnd)).toBe(0)
  })

  it('trip spans entire window — counts every day in window inclusive', () => {
    const { windowStart, windowEnd } = win('2026-01-01', '2026-01-10')
    // days abroad extends beyond window on both sides → count entire window: 1–10 Jan = 10 days
    expect(daysOutsideUKInWindow('2025-12-01T10:00:00', '2026-01-20T10:00:00', windowStart, windowEnd)).toBe(10)
  })
})
