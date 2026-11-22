import { describe, it, expect } from 'vitest'
import {
  addDays, daysBetween, daysLeftInWeek, hhmmToMinutes, isValidDate, localDate, localTime, minutesToHhmm,
  programmeWeek, weekStart, weekdayOf, zonedInstant,
} from './time'

describe('health time helpers', () => {
  it('local date/time in a timezone', () => {
    const t = new Date('2026-11-22T23:30:00Z')
    expect(localDate(t, 'Europe/London')).toBe('2026-11-22')
    expect(localDate(t, 'Asia/Dubai')).toBe('2026-11-23')
    expect(localTime(t, 'Asia/Dubai')).toBe('03:30')
  })

  it('hh:mm conversions', () => {
    expect(hhmmToMinutes('07:30')).toBe(450)
    expect(hhmmToMinutes('24:00')).toBeNull()
    expect(minutesToHhmm(1500)).toBe('01:00')
    expect(minutesToHhmm(-30)).toBe('23:30')
  })

  it('dates and weeks', () => {
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('2026-11-22')).toBe(true)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-11-20', '2026-11-22')).toBe(2)
    expect(weekdayOf('2026-11-22')).toBe('sun')
    expect(weekStart('2026-11-22')).toBe('2026-11-16')
    expect(daysLeftInWeek('2026-11-19')).toBe(4)
    expect(daysLeftInWeek('2026-11-22')).toBe(1)
    expect(programmeWeek('2026-11-16', '2026-11-22')).toBe(1)
    expect(programmeWeek('2026-11-16', '2026-11-23')).toBe(2)
    expect(programmeWeek('2026-11-16', '2026-11-15')).toBeNull()
  })

  it('zoned instants (incl. DST)', () => {
    expect(zonedInstant('2026-11-22', '13:20', 'Europe/London').toISOString()).toBe('2026-11-22T13:20:00.000Z')
    expect(zonedInstant('2026-07-01', '13:20', 'Europe/London').toISOString()).toBe('2026-07-01T12:20:00.000Z')
    expect(zonedInstant('2026-11-22', '08:00', 'Asia/Dubai').toISOString()).toBe('2026-11-22T04:00:00.000Z')
  })
})
