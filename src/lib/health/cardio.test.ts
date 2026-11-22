import { describe, it, expect } from 'vitest'
import { SEED_PROGRAMME as def } from './seedProgramme'
import {
  CardioInputSchema, cardioTypeOptions, checkCardioInput, classifyCardioType, hrFlagMessage, hrZoneFlag, intervalsUnlock,
  stepsStatus, stepsTargetLabel, weeklyCardio, type CardioSession,
} from './cardio'

const s = (date: string, minutes: number): CardioSession => ({ date, type: 'Incline treadmill', minutes, avgHr: null, intervals: false })

describe('cardio types', () => {
  it('offers the allowed list and classifies avoid-list types', () => {
    expect(cardioTypeOptions(def)).toContain('Bike (saddle high)')
    expect(cardioTypeOptions(def)).not.toContain('Running')
    expect(classifyCardioType(def, 'running')).toBe('avoid')
    expect(classifyCardioType(def, 'Front crawl')).toBe('allowed')
    expect(classifyCardioType(def, 'Zumba')).toBe('other')
  })
  it('avoid-list types need confirmation', () => {
    const unlock = intervalsUnlock(def, { week: 1, painRulePassed: false, recoveryOk: false })
    expect(checkCardioInput(def, { type: 'Running', intervals: false, confirmAvoid: false }, unlock)).toMatchObject({ ok: false, status: 409, needsConfirmation: true })
    expect(checkCardioInput(def, { type: 'Running', intervals: false, confirmAvoid: true }, unlock)).toEqual({ ok: true })
    expect(checkCardioInput(def, { type: 'Bike (saddle high)', intervals: true, confirmAvoid: false }, unlock)).toMatchObject({ ok: false, status: 400 })
  })
  it('schema validates minutes and HR', () => {
    expect(CardioInputSchema.safeParse({ date: '2026-11-20', type: 'Walk', minutes: 0 }).success).toBe(false)
    expect(CardioInputSchema.safeParse({ date: '2026-11-20', type: 'Walk', minutes: 30, avgHr: 250 }).success).toBe(false)
    expect(CardioInputSchema.parse({ date: '2026-11-20', type: 'Walk', minutes: 30 }).intervals).toBe(false)
  })
})

describe('heart rate zone', () => {
  it('flags outside 104–122 bpm', () => {
    expect(hrZoneFlag(def, null)).toBeNull()
    expect(hrZoneFlag(def, 110)).toBe('in_zone')
    expect(hrZoneFlag(def, 130)).toBe('above')
    expect(hrZoneFlag(def, 95)).toBe('below')
    expect(hrFlagMessage(def, 'above')).toMatch(/104–122/)
    expect(hrFlagMessage(def, 'in_zone')).toBeNull()
  })
})

describe('weekly minutes and steps', () => {
  it('sums the ISO week vs 4 × 30 = 120', () => {
    const w = weeklyCardio(def, [s('2026-11-16', 30), s('2026-11-18', 45), s('2026-11-23', 30), s('2026-11-15', 60)], '2026-11-20')
    expect(w).toMatchObject({ weekStart: '2026-11-16', minutes: 75, sessions: 2, targetMinutes: 120, met: false })
  })
  it('steps vs 8–10k', () => {
    expect(stepsStatus(def, 7999)).toBe('below')
    expect(stepsStatus(def, 9000)).toBe('in_range')
    expect(stepsStatus(def, 12000)).toBe('above')
    expect(stepsStatus(def, null)).toBeNull()
    expect(stepsTargetLabel(def)).toBe('8,000–10,000')
  })
})

describe('intervals unlock', () => {
  it('from week 5 only with the pain rule passed and recovery OK', () => {
    expect(intervalsUnlock(def, { week: 4, painRulePassed: true, recoveryOk: true }).available).toBe(false)
    expect(intervalsUnlock(def, { week: 5, painRulePassed: false, recoveryOk: true }).available).toBe(false)
    expect(intervalsUnlock(def, { week: 5, painRulePassed: true, recoveryOk: false }).available).toBe(false)
    const u = intervalsUnlock(def, { week: 5, painRulePassed: true, recoveryOk: true })
    expect(u.available).toBe(true)
    expect(u.prescription).toMatch(/6 × 1 min/)
  })
})
