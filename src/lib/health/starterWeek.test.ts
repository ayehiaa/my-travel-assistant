import { describe, it, expect } from 'vitest'
import { SEED_PROGRAMME as def } from './seedProgramme'
import {
  addDays, firstProgrammeMonday, hasStarterWeek, programmeEndDate, programmeWeek, programmeWeekLabel, programmeWeekStart,
  proRate, shortDayLabel, starterWeekRangeLabel, weekWindow,
} from './time'
import { orderWarning, recommendSession, sessionsForWeek, trainingPosition, weekSchedule, type WorkoutSummary } from './training'
import { componentProgress, weeklyComponentTarget } from './nutrition'
import { cardioTarget, weeklyCardio, type CardioSession } from './cardio'
import { computeWeeklyReview } from './weeklyReview'
import { latestFinishedPeriod } from './adjustment'
import { milestoneViews, milestoneWindow } from './measurements'
import { evaluateRules } from './rules'
import type { ProgrammeDefinition } from './programmeSchema'

/**
 * Spec 029 P3.2 — starter week (week 0) for non-Monday starts and Monday-aligned programme weeks.
 * Dates: 2026-11-20 is a Friday, 2026-11-22 a Sunday, 2026-11-23 a Monday.
 */
const FRI = '2026-11-20'
const SUN = '2026-11-22'
const MON = '2026-11-23'
const w = (date: string, sessionKey: string, status: WorkoutSummary['status'] = 'done'): WorkoutSummary => ({ date, sessionKey, status })

describe('week numbering', () => {
  it('Monday start: no starter week, week 1 = that week', () => {
    expect(hasStarterWeek(MON)).toBe(false)
    expect(firstProgrammeMonday(MON)).toBe(MON)
    expect(programmeWeek(MON, MON)).toBe(1)
    expect(programmeWeek(MON, addDays(MON, 6))).toBe(1)
    expect(programmeWeek(MON, addDays(MON, 7))).toBe(2)
    expect(programmeEndDate(MON, 12)).toBe(addDays(MON, 83))
  })
  it('Friday start: Fri–Sun is week 0, week 1 starts the next Monday, full 12 weeks after', () => {
    expect(hasStarterWeek(FRI)).toBe(true)
    expect(firstProgrammeMonday(FRI)).toBe(MON)
    expect(programmeWeek(FRI, FRI)).toBe(0)
    expect(programmeWeek(FRI, SUN)).toBe(0)
    expect(programmeWeek(FRI, MON)).toBe(1)
    expect(programmeWeek(FRI, addDays(MON, 7))).toBe(2)
    expect(programmeEndDate(FRI, 12)).toBe('2027-02-14') // Sunday
    expect(programmeWeek(FRI, '2027-02-14')).toBe(12)
    expect(programmeWeek(FRI, '2027-02-15')).toBe(13) // after the end
  })
  it('Sunday start: a 1-day starter week', () => {
    expect(programmeWeek(SUN, SUN)).toBe(0)
    expect(programmeWeek(SUN, MON)).toBe(1)
    expect(weekWindow(SUN, SUN)).toEqual({ weekStart: SUN, weekEnd: SUN, days: 1, fraction: 1 / 7, isStarter: true })
    expect(starterWeekRangeLabel(SUN)).toBe('Starter week (Sun)')
  })
  it('before the start → null', () => {
    expect(programmeWeek(FRI, '2026-11-19')).toBeNull()
    expect(programmeWeek(MON, SUN)).toBeNull()
  })
  it('programmeWeekStart', () => {
    expect(programmeWeekStart(FRI, 0)).toBe(FRI)
    expect(programmeWeekStart(FRI, 1)).toBe(MON)
    expect(programmeWeekStart(FRI, 3)).toBe(addDays(MON, 14))
  })
})

describe('weekWindow', () => {
  it('starter week is clipped to the start date', () => {
    expect(weekWindow(FRI, SUN)).toEqual({ weekStart: FRI, weekEnd: SUN, days: 3, fraction: 3 / 7, isStarter: true })
    expect(weekWindow(FRI, '2026-11-17')).toMatchObject({ weekStart: FRI, days: 3, isStarter: true })
  })
  it('later weeks and Monday starts are full Mon–Sun weeks', () => {
    expect(weekWindow(FRI, '2026-11-25')).toEqual({ weekStart: MON, weekEnd: addDays(MON, 6), days: 7, fraction: 1, isStarter: false })
    expect(weekWindow(MON, MON)).toMatchObject({ weekStart: MON, days: 7, isStarter: false })
  })
  it('labels', () => {
    expect(shortDayLabel(MON)).toBe('Mon 23 Nov')
    expect(programmeWeekLabel(FRI, '2026-11-21', 12)).toBe('Starter week · 3 days (Fri–Sun) · Week 1 starts Mon 23 Nov')
    expect(programmeWeekLabel(FRI, MON, 12)).toBe('Week 1 of 12')
    expect(programmeWeekLabel(FRI, '2026-11-19', 12)).toBeNull()
    expect(programmeWeekLabel(FRI, '2027-02-15', 12)).toBeNull()
    expect(starterWeekRangeLabel(FRI)).toBe('Starter week (Fri–Sun)')
    expect(proRate(2, 3 / 7)).toBe(1)
    expect(proRate(2, 1 / 7)).toBe(0)
  })
})

describe('training in the starter week', () => {
  it('position: week 0 uses Block 1 as week 1, never light/deload; later weeks use the new numbering', () => {
    const p = trainingPosition(def, FRI, FRI)
    expect(p).toMatchObject({ phase: 'active', week: 0, starter: true, prescriptionWeek: 1, light: false, deload: false })
    expect(p.block?.key).toBe('b1')
    const w4 = trainingPosition(def, FRI, addDays(MON, 21))
    expect(w4).toMatchObject({ week: 4, light: true, starter: false, prescriptionWeek: 4 })
    expect(trainingPosition(def, FRI, '2027-02-14').phase).toBe('active')
    expect(trainingPosition(def, FRI, '2027-02-15').phase).toBe('completed')
    expect(trainingPosition(def, FRI, '2026-11-19').phase).toBe('before_start')
  })
  it('schedule: days before the start are "before_start", never missed', () => {
    const days = weekSchedule(def, '2026-11-21', [], FRI)
    expect(days.map(d => d.status)).toEqual(['before_start', null, 'before_start', null, 'missed', null, null])
    // Without the start date the old behaviour stands.
    expect(weekSchedule(def, '2026-11-21', []).filter(d => d.status === 'missed')).toHaveLength(3)
  })
  it('Friday start → only Session C counts; no short week, no roll-forward of A/B', () => {
    expect(sessionsForWeek(def, FRI, FRI)).toEqual(['c'])
    const r = recommendSession(def, FRI, [], FRI)
    expect(r).toMatchObject({ sessionKey: 'c', remaining: ['c'], shortWeek: false, missed: [] })
    expect(r.warnings).toEqual([])
    // Saturday after missing C on Friday: catch up C (no A/B).
    const sat = recommendSession(def, '2026-11-21', [], FRI)
    expect(sat).toMatchObject({ sessionKey: 'c', missed: ['c'], shortWeek: false })
    // C done → all done for the starter week.
    expect(recommendSession(def, SUN, [w(FRI, 'c')], FRI).reason).toMatch(/All sessions done/)
    // No out-of-order warning for C in the starter week.
    expect(orderWarning(def, 'c', [], { date: FRI, startDate: FRI })).toBeNull()
    expect(orderWarning(def, 'c', [], { date: '2026-11-27', startDate: FRI })).toMatch(/Out of order/)
  })
  it('Wednesday start → B and C', () => {
    expect(sessionsForWeek(def, '2026-11-18', '2026-11-18')).toEqual(['b', 'c'])
    expect(recommendSession(def, '2026-11-18', [], '2026-11-18').sessionKey).toBe('b')
  })
  it('before the start date → no session', () => {
    const r = recommendSession(def, '2026-11-18', [], FRI)
    expect(r.sessionKey).toBeNull()
    expect(r.reason).toMatch(/starts Fri 20 Nov/)
  })
  it('week 1 after a starter week has the full A → B → C week', () => {
    expect(recommendSession(def, MON, [w(FRI, 'c')], FRI)).toMatchObject({ sessionKey: 'a', remaining: ['a', 'b', 'c'] })
  })
  it('no weekly schedule → round(n × days/7) sessions, priority first', () => {
    const noSched = { ...def, weeklySchedule: undefined } as ProgrammeDefinition
    expect(sessionsForWeek(noSched, FRI, FRI)).toEqual(['a']) // round(3 × 3/7) = 1
  })
})

describe('weekly food components', () => {
  it('pro-rated in the starter week, full afterwards; 0 → not due', () => {
    expect(weeklyComponentTarget(2, FRI, SUN)).toEqual({ target: 1, proRated: true, days: 3, notDue: false, note: 'pro-rated for a 3-day starter week' })
    expect(weeklyComponentTarget(2, SUN, SUN)).toMatchObject({ target: 0, notDue: true })
    expect(weeklyComponentTarget(2, FRI, MON)).toMatchObject({ target: 2, proRated: false, note: null })
    expect(weeklyComponentTarget(2, undefined, SUN)).toMatchObject({ target: 2, proRated: false })
  })
  it('componentProgress: weekly pro-rated, daily unchanged', () => {
    const p = componentProgress(def, {}, { oily_fish: 1 }, { startDate: FRI, date: '2026-11-21' })
    const fish = p.find(c => c.key === 'oily_fish')!
    expect(fish).toMatchObject({ target: 1, met: true, note: 'pro-rated for a 3-day starter week' })
    const daily = p.find(c => c.period === 'day')!
    expect(daily.target).toBe(def.components.find(c => c.key === daily.key)!.target)
    const sun = componentProgress(def, {}, {}, { startDate: SUN, date: SUN }).find(c => c.key === 'oily_fish')!
    expect(sun).toMatchObject({ notDue: true, met: false })
  })
  it('rules: weekly nudge uses the pro-rated target and label; not-due components stay silent', () => {
    const targets = { kcal: 2200, proteinG: 145, fatG: 75, satFatTargetG: 15, satFatCeilingG: 18, carbsG: 235, fibreMinG: 35 }
    const base = { def, targets, now: '20:00', entries: [], weekComponents: {}, bedtime: null }
    const fri = evaluateRules({ ...base, date: SUN, startDate: FRI }).find(f => f.key === 'component_week.oily_fish')
    expect(fri?.message).toMatch(/0 of 1 this week \(pro-rated for a 3-day starter week\)/)
    expect(evaluateRules({ ...base, date: SUN, startDate: SUN }).find(f => f.key === 'component_week.oily_fish')).toBeUndefined()
  })
})

describe('cardio targets', () => {
  const s = (date: string, minutes: number): CardioSession => ({ date, type: 'Walk', minutes, avgHr: null, intervals: false })
  it('starter week: scheduled cardio/walk days from the start × minutes', () => {
    // Fri start: Sat cardio + Sun walk = 2 × 30.
    expect(cardioTarget(def, FRI, FRI)).toEqual({ sessions: 2, minutes: 60, starter: true, days: 3 })
    const wk = weeklyCardio(def, [s('2026-11-21', 30), s(SUN, 30)], SUN, FRI)
    expect(wk).toMatchObject({ targetMinutes: 60, targetSessions: 2, met: true, starter: true })
    expect(cardioTarget(def, MON, FRI)).toMatchObject({ sessions: 4, minutes: 120, starter: false })
  })
  it('no weekly schedule: minutes and sessions pro-rated', () => {
    const noSched = { ...def, weeklySchedule: undefined } as ProgrammeDefinition
    expect(cardioTarget(noSched, FRI, FRI)).toEqual({ sessions: 2, minutes: 51, starter: true, days: 3 })
  })
})

describe('weekly review in the starter week', () => {
  const targets = { kcal: 2200, proteinG: 145, fatG: 75, satFatTargetG: 15, satFatCeilingG: 18, carbsG: 235, fibreMinG: 35 }
  it('window = start..Sunday with pro-rated targets', () => {
    const r = computeWeeklyReview({
      def, targets, weekStart: '2026-11-16', startDate: FRI,
      food: [{ date: '2026-11-17', items: [{ kcal: 500, proteinG: 200, carbsG: 0, fatG: 0, satFatG: 0, fibreG: 0, components: { oily_fish: 5 } }] }],
      workouts: [w('2026-11-17', 'a'), w(FRI, 'c')], cardio: [{ date: '2026-11-21', type: 'Walk', minutes: 30, avgHr: null, intervals: false }],
      steps: [], sleep: [], weighIns: [], waist: [],
    })
    expect(r).toMatchObject({ weekStart: '2026-11-16', windowStart: FRI, windowDays: 3, daysCounted: 3, starter: true, label: 'Starter week (Fri–Sun)' })
    expect(r.daysLogged).toBe(0) // Tuesday's food is before the start
    expect(r.sessions).toEqual({ done: 1, partial: 0, planned: 1 })
    expect(r.cardio).toEqual({ minutes: 30, target: 60 })
    expect(r.components.find(c => c.key === 'oily_fish')).toMatchObject({ value: 0, of: 1, note: 'pro-rated for a 3-day starter week' })
  })
  it('a normal week is unchanged', () => {
    const r = computeWeeklyReview({ def, targets, weekStart: MON, startDate: FRI, food: [], workouts: [], cardio: [], steps: [], sleep: [], weighIns: [], waist: [] })
    expect(r).toMatchObject({ windowStart: MON, windowDays: 7, daysCounted: 7, starter: false, label: null })
    expect(r.sessions.planned).toBe(3)
    expect(r.cardio.target).toBe(120)
  })
})

describe('adjustment fortnights', () => {
  it('count from the first programme Monday; the starter week never forms a fortnight', () => {
    expect(latestFinishedPeriod(def, FRI, addDays(MON, 13))).toBeNull()
    expect(latestFinishedPeriod(def, FRI, addDays(MON, 14))).toEqual({ index: 1, start: MON, end: addDays(MON, 13) })
    expect(latestFinishedPeriod(def, FRI, SUN)).toBeNull()
  })
})

describe('milestones', () => {
  it('week 1 covers the starter week; other weeks use the new numbering', () => {
    expect(milestoneWindow(FRI, 1)).toEqual({ start: FRI, end: addDays(MON, 6) })
    expect(milestoneWindow(FRI, 4)).toEqual({ start: addDays(MON, 21), end: addDays(MON, 27) })
    expect(milestoneWindow(MON, 1)).toEqual({ start: MON, end: addDays(MON, 6) })
    const views = milestoneViews(def, { startDate: FRI, today: FRI, startWeightKg: null, weighIns: [], waist: [], doneKeys: new Set() })
    expect(views[0]).toMatchObject({ week: 1, state: 'current', start: FRI })
    expect(views[1].state).toBe('upcoming')
    const w4 = milestoneViews(def, { startDate: FRI, today: addDays(MON, 22), startWeightKg: null, weighIns: [], waist: [], doneKeys: new Set() })
    expect(w4.find(v => v.week === 4)?.state).toBe('current')
  })
})
