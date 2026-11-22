import { describe, it, expect } from 'vitest'
import { SEED_PROGRAMME } from './seedProgramme'
import {
  evaluateJointCheck, exerciseSafety, jointStatus, JointCheckInputSchema, knownRedFlags, nextMorningDue, painRulePassed, recoveryOk,
  type JointCheck,
} from './painRules'

const rules = SEED_PROGRAMME.painRules!
const check = (over: Partial<JointCheck> = {}): JointCheck => ({
  date: '2026-11-18', sessionKey: 'b', duringPain: 2, nextMorningPain: 2, swelling: false, redFlags: [], physioCleared: false, clearedOn: null, ...over,
})

describe('evaluateJointCheck', () => {
  it('≤3 and settled next morning → ok', () => {
    expect(evaluateJointCheck(rules, check())).toBe('ok')
    expect(evaluateJointCheck(rules, check({ duringPain: 3, nextMorningPain: 1 }))).toBe('ok')
  })
  it('>3 during or next morning → reduce', () => {
    expect(evaluateJointCheck(rules, check({ duringPain: 4 }))).toBe('reduce')
    expect(evaluateJointCheck(rules, check({ nextMorningPain: 4, duringPain: 4 }))).toBe('reduce')
    expect(evaluateJointCheck(rules, check({ duringPain: 4, nextMorningPain: null }))).toBe('reduce')
  })
  it('next-day soreness (worse next morning) or swelling → reduce', () => {
    expect(evaluateJointCheck(rules, check({ duringPain: 1, nextMorningPain: 3 }))).toBe('reduce')
    expect(evaluateJointCheck(rules, check({ swelling: true }))).toBe('reduce')
  })
  it('missing next-morning answer → pending', () => {
    expect(evaluateJointCheck(rules, check({ nextMorningPain: null }))).toBe('pending')
    expect(evaluateJointCheck({ ...rules, nextDayCheck: false }, check({ nextMorningPain: null }))).toBe('ok')
  })
  it('red flag → red_flag', () => {
    expect(evaluateJointCheck(rules, check({ redFlags: ['Locking'] }))).toBe('red_flag')
  })
})

describe('jointStatus + exerciseSafety', () => {
  const watched = { jointWatch: true }
  const other = { jointWatch: false }
  it('no rules / no checks → ok', () => {
    expect(jointStatus(undefined, [check({ duringPain: 9 })]).level).toBe('ok')
    expect(jointStatus(rules, []).level).toBe('ok')
  })
  it('latest check failed → reduce for joint-watched exercises only, progression suppressed', () => {
    const s = jointStatus(rules, [check({ date: '2026-11-16' }), check({ duringPain: 5 })])
    expect(s.level).toBe('reduce')
    expect(exerciseSafety(watched, s)).toMatchObject({ disabled: false, suppressProgression: true })
    expect(exerciseSafety(watched, s).warning).toMatch(/shorten the range/i)
    expect(exerciseSafety(other, s)).toEqual({ disabled: false, warning: null, suppressProgression: false })
  })
  it('a later good session clears reduce', () => {
    expect(jointStatus(rules, [check({ date: '2026-11-16', duringPain: 5 }), check()]).level).toBe('ok')
  })
  it('uncleared red flag → stop (disabled) until clearance, even after later checks', () => {
    const flag = check({ date: '2026-11-16', redFlags: ['Giving way'] })
    const s = jointStatus(rules, [flag, check()])
    expect(s.level).toBe('stop')
    expect(s.uncleared?.date).toBe('2026-11-16')
    expect(exerciseSafety(watched, s)).toMatchObject({ disabled: true, suppressProgression: true })
    expect(exerciseSafety(watched, s).warning).toMatch(/physiotherapist/)
    expect(exerciseSafety(other, s).disabled).toBe(false)
    const cleared = jointStatus(rules, [{ ...flag, physioCleared: true, clearedOn: '2026-11-17' }, check()])
    expect(cleared.level).toBe('ok')
    expect(jointStatus(rules, [{ ...flag, physioCleared: true, clearedOn: '2026-11-17' }]).level).toBe('reduce')
  })
})

describe('painRulePassed', () => {
  it('needs the last two pain-check sessions ok', () => {
    expect(painRulePassed(rules, [check({ date: '2026-11-16' }), check()])).toBe(true)
    expect(painRulePassed(rules, [check()])).toBe(false)
    expect(painRulePassed(rules, [check({ date: '2026-11-16' }), check({ nextMorningPain: null })])).toBe(false)
    expect(painRulePassed(rules, [check({ date: '2026-11-14', duringPain: 6 }), check({ date: '2026-11-16' }), check()])).toBe(true)
    expect(painRulePassed(rules, [check({ date: '2026-11-16', duringPain: 6 }), check()])).toBe(false)
    expect(painRulePassed(undefined, [check(), check()])).toBe(false)
  })
})

describe('nextMorningDue', () => {
  it('prompts the morning after a pain-check session until answered', () => {
    const pending = check({ date: '2026-11-18', nextMorningPain: null })
    expect(nextMorningDue(rules, [pending], '2026-11-19')).toBe(pending)
    expect(nextMorningDue(rules, [pending], '2026-11-18')).toBeNull() // same day
    expect(nextMorningDue(rules, [pending], '2026-11-21')).toBeNull() // too old
    expect(nextMorningDue(rules, [check()], '2026-11-19')).toBeNull() // answered
    expect(nextMorningDue({ ...rules, nextDayCheck: false }, [pending], '2026-11-19')).toBeNull()
  })
})

describe('inputs', () => {
  it('validates next-morning and clearance payloads', () => {
    const id = '7b0f8f5e-3c55-4a59-9e7c-2f0f5b1d2a11'
    expect(JointCheckInputSchema.safeParse({ action: 'next_morning', checkId: id, nextMorningPain: 2, swelling: false }).success).toBe(true)
    expect(JointCheckInputSchema.safeParse({ action: 'next_morning', checkId: id, nextMorningPain: 11, swelling: false }).success).toBe(false)
    expect(JointCheckInputSchema.safeParse({ action: 'clearance', checkId: id }).success).toBe(true)
    expect(JointCheckInputSchema.safeParse({ action: 'other', checkId: id }).success).toBe(false)
  })
  it('keeps only programme red flags', () => {
    expect(knownRedFlags(rules, ['Locking', 'made up', 'Locking'])).toEqual(['Locking'])
  })
})

describe('recoveryOk (intervals unlock)', () => {
  it('needs ≥2 of the last 3 sessions OK and no red flags', () => {
    expect(recoveryOk(rules, [])).toBe(false)
    expect(recoveryOk(rules, [check({ date: '2026-11-10' }), check({ date: '2026-11-12' })])).toBe(true)
    expect(recoveryOk(rules, [check({ date: '2026-11-10' }), check({ date: '2026-11-12', duringPain: 5 }), check({ date: '2026-11-14', nextMorningPain: null })])).toBe(false)
    expect(recoveryOk(rules, [check({ date: '2026-11-10' }), check({ date: '2026-11-12', duringPain: 5 }), check({ date: '2026-11-14' })])).toBe(true)
  })
  it('any red flag in the window, or an uncleared one, blocks it', () => {
    expect(recoveryOk(rules, [check({ date: '2026-11-10', redFlags: ['Locking'], physioCleared: true }), check({ date: '2026-11-12' }), check({ date: '2026-11-14' })])).toBe(false)
    expect(recoveryOk(rules, [check({ date: '2026-11-01', redFlags: ['Locking'] }), check({ date: '2026-11-10' }), check({ date: '2026-11-12' }), check({ date: '2026-11-14' })])).toBe(false)
  })
})
