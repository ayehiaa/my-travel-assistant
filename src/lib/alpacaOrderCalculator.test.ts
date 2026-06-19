import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeOrderQty, isNYSEOpen } from './alpacaOrderCalculator'

// ── computeOrderQty ────────────────────────────────────────────────────────────

describe('computeOrderQty — buy side', () => {
  it('returns exact floor qty when delta divides evenly', () => {
    expect(computeOrderQty(500, 100, 0, 'buy')).toBe(5)
  })

  it('floors the result, does not round up', () => {
    expect(computeOrderQty(549.99, 100, 0, 'buy')).toBe(5)
  })

  it('returns 0 when delta is too small to buy even 1 share', () => {
    expect(computeOrderQty(50, 100, 0, 'buy')).toBe(0)
  })

  it('returns 0 when delta is zero', () => {
    expect(computeOrderQty(0, 100, 0, 'buy')).toBe(0)
  })

  it('returns 0 when ask price is zero (division-by-zero guard)', () => {
    expect(computeOrderQty(500, 0, 0, 'buy')).toBe(0)
  })

  it('returns 0 when ask price is negative', () => {
    expect(computeOrderQty(500, -1, 0, 'buy')).toBe(0)
  })
})

describe('computeOrderQty — sell side', () => {
  it('returns floor qty when within position', () => {
    expect(computeOrderQty(-500, 100, 10, 'sell')).toBe(5)
  })

  it('caps qty at position held when computed qty exceeds it', () => {
    expect(computeOrderQty(-1000, 100, 7, 'sell')).toBe(7)
  })

  it('returns 0 when delta is too small to sell even 1 share', () => {
    expect(computeOrderQty(-50, 100, 10, 'sell')).toBe(0)
  })

  it('returns 0 when no position is held', () => {
    expect(computeOrderQty(-500, 100, 0, 'sell')).toBe(0)
  })

  it('returns 0 when delta is zero', () => {
    expect(computeOrderQty(0, 100, 5, 'sell')).toBe(0)
  })

  it('returns 0 when ask price is zero (division-by-zero guard)', () => {
    expect(computeOrderQty(-500, 0, 5, 'sell')).toBe(0)
  })
})

// ── isNYSEOpen ────────────────────────────────────────────────────────────────
//
// All times are given as UTC equivalents of specific Eastern Time moments.
// Eastern Time offset:
//   EST (UTC-5): November–March
//   EDT (UTC-4): March–November
//
// June dates are in EDT (UTC-4), so:
//   09:30 ET = 13:30 UTC
//   16:00 ET = 20:00 UTC
//
// We use June 2026 dates for weekday tests:
//   Mon 2026-06-15, Wed 2026-06-17, Fri 2026-06-19
// And a January 2026 week for any UTC offset sanity (not used here).

describe('isNYSEOpen', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false on Saturday', () => {
    // Saturday 2026-06-20 at 12:00 ET (16:00 UTC)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-20T16:00:00Z'))
    expect(isNYSEOpen()).toBe(false)
  })

  it('returns false on Sunday', () => {
    // Sunday 2026-06-21 at 12:00 ET (16:00 UTC)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-21T16:00:00Z'))
    expect(isNYSEOpen()).toBe(false)
  })

  it('returns false at 09:29 ET on Monday (one minute before open)', () => {
    // Monday 2026-06-15 at 09:29 ET = 13:29 UTC (EDT, UTC-4)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T13:29:00Z'))
    expect(isNYSEOpen()).toBe(false)
  })

  it('returns true at exactly 09:30 ET on Monday (market open)', () => {
    // Monday 2026-06-15 at 09:30 ET = 13:30 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T13:30:00Z'))
    expect(isNYSEOpen()).toBe(true)
  })

  it('returns true at 13:00 ET on Wednesday (midday)', () => {
    // Wednesday 2026-06-17 at 13:00 ET = 17:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-17T17:00:00Z'))
    expect(isNYSEOpen()).toBe(true)
  })

  it('returns true at 15:59 ET on Friday (one minute before close)', () => {
    // Friday 2026-06-19 at 15:59 ET = 19:59 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-19T19:59:00Z'))
    expect(isNYSEOpen()).toBe(true)
  })

  it('returns false at exactly 16:00 ET on Friday (market closed)', () => {
    // Friday 2026-06-19 at 16:00 ET = 20:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-19T20:00:00Z'))
    expect(isNYSEOpen()).toBe(false)
  })

  it('returns false at 16:01 ET on Friday (after close)', () => {
    // Friday 2026-06-19 at 16:01 ET = 20:01 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-19T20:01:00Z'))
    expect(isNYSEOpen()).toBe(false)
  })
})
