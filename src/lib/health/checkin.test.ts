import { describe, it, expect } from 'vitest'
import {
  CheckinInputSchema, formatDuration, sevenDayAverage, sevenDayAverageSeries, sleepDurationMinutes, sleepSummary,
  waterWeightNote, weightTrend,
} from './checkin'
import { SEED_PROGRAMME } from './seedProgramme'
import { addDays } from './time'

const series = (start: string, values: number[]) => values.map((w, i) => ({ date: addDays(start, i), weightKg: w }))

describe('weight', () => {
  it('7-day average needs 3 weigh-ins in the window', () => {
    expect(sevenDayAverage(series('2026-11-01', [80, 81]), '2026-11-07')).toBeNull()
    expect(sevenDayAverage(series('2026-11-01', [80, 81, 82]), '2026-11-07')).toEqual({ avg: 81, count: 3 })
    expect(sevenDayAverage(series('2026-11-01', [80, 81, 82]), '2026-11-10')).toBeNull()
  })

  it('series and trend', () => {
    const w = series('2026-11-01', [82, 82, 82, 82, 82, 82, 82, 81.5, 81.5, 81.5, 81.5, 81.5, 81.5, 81.5])
    const s = sevenDayAverageSeries(w, '2026-11-01', '2026-11-14')
    expect(s).toHaveLength(14)
    expect(s[0].avg).toBeNull()
    expect(s[13].avg).toBe(81.5)
    const t = weightTrend(w, '2026-11-14')
    expect(t).toMatchObject({ average: 81.5, weeklyChangeKg: -0.5, direction: 'down', lossPerWeekKg: 0.5 })
    expect(t.latest?.weightKg).toBe(81.5)
    expect(weightTrend(w.slice(0, 5), '2026-11-05').direction).toBeNull()
  })

  it('flat within 0.1 kg', () => {
    const w = series('2026-11-01', Array(14).fill(80))
    expect(weightTrend(w, '2026-11-14').direction).toBe('flat')
  })

  it('creatine water-weight note during the first 3 weeks only', () => {
    expect(waterWeightNote(SEED_PROGRAMME, '2026-11-01', '2026-11-21')).toMatch(/Creatine.*waist/)
    expect(waterWeightNote(SEED_PROGRAMME, '2026-11-01', '2026-11-22')).toBeNull()
    expect(waterWeightNote(SEED_PROGRAMME, '2026-11-10', '2026-11-01')).toBeNull()
  })
})

describe('sleep', () => {
  it('duration across midnight', () => {
    expect(sleepDurationMinutes('23:00', '06:30')).toBe(450)
    expect(sleepDurationMinutes('01:00', '07:00')).toBe(360)
    expect(sleepDurationMinutes('07:00', '07:00')).toBeNull()
    expect(sleepDurationMinutes(null, '07:00')).toBeNull()
    expect(formatDuration(450)).toBe('7 h 30 min')
    expect(formatDuration(null)).toBe('—')
  })

  it('consistency vs ±30 min of the typical times', () => {
    const nights = [
      { date: '2026-11-16', bedTime: '23:00', wakeTime: '06:30' },
      { date: '2026-11-17', bedTime: '23:15', wakeTime: '06:45' },
      { date: '2026-11-18', bedTime: '00:30', wakeTime: '07:30' },
      { date: '2026-11-19', bedTime: '22:50', wakeTime: '06:30' },
    ]
    const s = sleepSummary(nights, '2026-11-19', SEED_PROGRAMME)
    expect(s.nights).toBe(4)
    expect(s.typicalBedTime).toBe('23:08')
    expect(s.consistentNights).toBe(3)
    expect(s.lastNightMinutes).toBe(460)
    expect(s.durationOk).toBe(true)
    expect(sleepSummary([], '2026-11-19').nights).toBe(0)
  })
})

describe('CheckinInputSchema', () => {
  it('validates', () => {
    expect(CheckinInputSchema.safeParse({ date: '2026-11-22', weightKg: 80.4, bedTime: '23:00', wakeTime: '06:45', supplementsTaken: ['creatine'] }).success).toBe(true)
    expect(CheckinInputSchema.safeParse({ date: '2026-11-22', weightKg: 10 }).success).toBe(false)
    expect(CheckinInputSchema.safeParse({ date: '2026-11-22', bedTime: '11pm' }).success).toBe(false)
  })
})
