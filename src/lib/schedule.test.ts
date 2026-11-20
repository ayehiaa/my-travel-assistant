import { describe, expect, it } from 'vitest'
import {
  addWeekdays,
  autopilotChangeNeedsConfirm,
  computeNextRunAt,
  cooldownRemainingSeconds,
  formatRunTime,
  isDue,
  isScheduledRunDue,
  isTradingDayFromCalendar,
  nextScheduleSlot,
  nyDateString,
  nyOffsetMinutes,
  nyWallTimeToUtc,
  parseAutopilotMode,
  parseRunInterval,
  readAutopilotSettings,
} from './schedule'

describe('parsing', () => {
  it('parseRunInterval accepts 1/7/14/30 and defaults to 30', () => {
    expect(parseRunInterval(1)).toBe(1)
    expect(parseRunInterval(7)).toBe(7)
    expect(parseRunInterval('14')).toBe(14)
    expect(parseRunInterval(30)).toBe(30)
    expect(parseRunInterval(3)).toBe(30)
    expect(parseRunInterval(undefined)).toBe(30)
  })

  it('parseAutopilotMode defaults to off', () => {
    expect(parseAutopilotMode('approval')).toBe('approval')
    expect(parseAutopilotMode('auto')).toBe('auto')
    expect(parseAutopilotMode('AUTO')).toBe('off')
    expect(parseAutopilotMode(undefined)).toBe('off')
    expect(parseAutopilotMode(null)).toBe('off')
  })

  it('readAutopilotSettings tolerates a missing row / column', () => {
    expect(readAutopilotSettings(null)).toEqual({
      mode: 'off', run_interval_days: 30, last_run_at: null, next_run_at: null, migration_applied: false,
    })
    const s = readAutopilotSettings({ run_interval_days: 7, autopilot_mode: 'approval', next_run_at: '2026-11-23T15:30:00Z' })
    expect(s.mode).toBe('approval')
    expect(s.run_interval_days).toBe(7)
    expect(s.next_run_at).toBe('2026-11-23T15:30:00Z')
    expect(s.migration_applied).toBe(true)
  })

  it('only a change into auto needs the typed confirmation', () => {
    expect(autopilotChangeNeedsConfirm('off', 'auto')).toBe(true)
    expect(autopilotChangeNeedsConfirm('approval', 'auto')).toBe(true)
    expect(autopilotChangeNeedsConfirm('auto', 'auto')).toBe(false)
    expect(autopilotChangeNeedsConfirm('auto', 'off')).toBe(false)
    expect(autopilotChangeNeedsConfirm('off', 'approval')).toBe(false)
  })
})

describe('New York time', () => {
  it('offset is -300 in winter and -240 in summer', () => {
    expect(nyOffsetMinutes(new Date('2026-01-15T12:00:00Z'))).toBe(-300)
    expect(nyOffsetMinutes(new Date('2026-07-15T12:00:00Z'))).toBe(-240)
  })

  it('10:30 New York → UTC across DST', () => {
    expect(nyWallTimeToUtc({ year: 2026, month: 11, day: 23 }, 10, 30).toISOString()).toBe('2026-11-23T15:30:00.000Z')
    expect(nyWallTimeToUtc({ year: 2026, month: 7, day: 15 }, 10, 30).toISOString()).toBe('2026-07-15T14:30:00.000Z')
    // DST starts 2026-03-08 (second Sunday of March); Monday 9 March is EDT
    expect(nyWallTimeToUtc({ year: 2026, month: 3, day: 9 }, 10, 30).toISOString()).toBe('2026-03-09T14:30:00.000Z')
    // DST ends 2026-11-01; Monday 2 November is EST
    expect(nyWallTimeToUtc({ year: 2026, month: 11, day: 2 }, 10, 30).toISOString()).toBe('2026-11-02T15:30:00.000Z')
  })

  it('nyDateString uses the New York calendar date', () => {
    // 03:00 UTC on the 21st is still the 20th in New York
    expect(nyDateString(new Date('2026-11-21T03:00:00Z'))).toBe('2026-11-20')
    expect(nyDateString(new Date('2026-11-21T06:00:00Z'))).toBe('2026-11-21')
  })
})

describe('addWeekdays', () => {
  it('skips weekends', () => {
    expect(addWeekdays({ year: 2026, month: 11, day: 20 }, 1)).toEqual({ year: 2026, month: 11, day: 23 }) // Fri → Mon
    expect(addWeekdays({ year: 2026, month: 11, day: 23 }, 5)).toEqual({ year: 2026, month: 11, day: 30 }) // Mon → Mon
    expect(addWeekdays({ year: 2026, month: 11, day: 18 }, 2)).toEqual({ year: 2026, month: 11, day: 20 }) // Wed → Fri
  })

  it('n = 0 rolls a weekend forward to Monday', () => {
    expect(addWeekdays({ year: 2026, month: 11, day: 21 }, 0)).toEqual({ year: 2026, month: 11, day: 23 })
    expect(addWeekdays({ year: 2026, month: 11, day: 20 }, 0)).toEqual({ year: 2026, month: 11, day: 20 })
  })

  it('crosses month and year ends', () => {
    expect(addWeekdays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 })
    expect(addWeekdays({ year: 2027, month: 1, day: 1 }, 1)).toEqual({ year: 2027, month: 1, day: 4 })
  })
})

describe('computeNextRunAt', () => {
  const fridayFire = new Date('2026-11-20T15:30:05Z') // Fri 20 Nov 10:30 ET

  it('daily: next trading day at 10:30 ET (Friday → Monday)', () => {
    expect(computeNextRunAt(fridayFire, 1).toISOString()).toBe('2026-11-23T15:30:00.000Z')
  })

  it('daily midweek: the next day', () => {
    expect(computeNextRunAt(new Date('2026-11-18T15:30:00Z'), 1).toISOString()).toBe('2026-11-19T15:30:00.000Z')
  })

  it('weekly = 5 trading days (same weekday next week)', () => {
    expect(computeNextRunAt(fridayFire, 7).toISOString()).toBe('2026-11-27T15:30:00.000Z')
  })

  it('fortnightly = 10 trading days, monthly = 21 trading days', () => {
    expect(computeNextRunAt(fridayFire, 14).toISOString()).toBe('2026-12-04T15:30:00.000Z')
    expect(computeNextRunAt(fridayFire, 30).toISOString()).toBe('2026-12-21T15:30:00.000Z')
  })

  it('from a weekend start counts from Monday', () => {
    // Sat 21 Nov → roll to Mon 23 → +1 weekday = Tue 24
    expect(computeNextRunAt(new Date('2026-11-21T12:00:00Z'), 1).toISOString()).toBe('2026-11-24T15:30:00.000Z')
  })

  it('handles a DST change between runs (EDT → EST)', () => {
    // Fri 30 Oct 2026 10:30 EDT → Mon 2 Nov 10:30 EST
    expect(computeNextRunAt(new Date('2026-10-30T14:30:00Z'), 1).toISOString()).toBe('2026-11-02T15:30:00.000Z')
  })
})

describe('nextScheduleSlot', () => {
  it('today when before 10:30 on a weekday', () => {
    expect(nextScheduleSlot(new Date('2026-11-20T14:00:00Z')).toISOString()).toBe('2026-11-20T15:30:00.000Z')
  })
  it('next weekday when after 10:30 on Friday', () => {
    expect(nextScheduleSlot(new Date('2026-11-20T16:00:00Z')).toISOString()).toBe('2026-11-23T15:30:00.000Z')
  })
  it('Monday from a Saturday', () => {
    expect(nextScheduleSlot(new Date('2026-11-21T16:00:00Z')).toISOString()).toBe('2026-11-23T15:30:00.000Z')
  })
})

describe('isDue', () => {
  const now = new Date('2026-11-23T15:30:00Z')

  it('null / invalid → due', () => {
    expect(isDue(null, now)).toBe(true)
    expect(isDue(undefined, now)).toBe(true)
    expect(isDue('nonsense', now)).toBe(true)
  })

  it('past or within tolerance → due; future → not due', () => {
    expect(isDue('2026-11-20T15:30:00Z', now)).toBe(true)
    expect(isDue('2026-11-23T15:30:00Z', now)).toBe(true)
    expect(isDue('2026-11-23T15:50:00Z', now)).toBe(true) // fired 20 min early
    expect(isDue('2026-11-23T16:30:00Z', now)).toBe(false)
    expect(isDue('2026-11-24T15:30:00Z', now)).toBe(false)
  })

  it('isScheduledRunDue requires mode != off', () => {
    expect(isScheduledRunDue({ mode: 'off', next_run_at: null }, now)).toBe(false)
    expect(isScheduledRunDue({ mode: 'approval', next_run_at: null }, now)).toBe(true)
    expect(isScheduledRunDue({ mode: 'auto', next_run_at: '2026-11-24T15:30:00Z' }, now)).toBe(false)
  })
})

describe('cooldownRemainingSeconds', () => {
  const now = new Date('2026-11-23T15:30:00Z')

  it('no last run → 0', () => {
    expect(cooldownRemainingSeconds(null, now, 'manual')).toBe(0)
  })

  it('manual: 24 h cooldown', () => {
    expect(cooldownRemainingSeconds('2026-11-23T05:30:00Z', now, 'manual')).toBe(14 * 3600)
    expect(cooldownRemainingSeconds('2026-11-22T15:30:00Z', now, 'manual')).toBe(0)
  })

  it('scheduled: only 20 h, so a daily run 24 h later always passes', () => {
    expect(cooldownRemainingSeconds('2026-11-22T15:30:00Z', now, 'schedule')).toBe(0)
    expect(cooldownRemainingSeconds('2026-11-22T19:30:00Z', now, 'schedule')).toBe(0) // exactly 20 h
    expect(cooldownRemainingSeconds('2026-11-23T05:30:00Z', now, 'schedule')).toBe(10 * 3600)
  })
})

describe('isTradingDayFromCalendar', () => {
  it('trading day only when the calendar has an entry for the date', () => {
    expect(isTradingDayFromCalendar([{ date: '2026-11-23', open: '09:30', close: '16:00' }], '2026-11-23')).toBe(true)
    expect(isTradingDayFromCalendar([], '2026-11-26')).toBe(false) // Thanksgiving
    expect(isTradingDayFromCalendar([{ date: '2026-11-27' }], '2026-11-26')).toBe(false)
    expect(isTradingDayFromCalendar(null, '2026-11-23')).toBe(false)
    expect(isTradingDayFromCalendar({ date: '2026-11-23' }, '2026-11-23')).toBe(false)
  })
})

describe('formatRunTime', () => {
  it('shows UK and New York time', () => {
    const text = formatRunTime('2026-11-23T15:30:00Z')
    expect(text).toContain('15:30')
    expect(text).toContain('10:30 New York')
  })
  it('invalid → unknown', () => {
    expect(formatRunTime('x')).toBe('unknown')
  })
})
