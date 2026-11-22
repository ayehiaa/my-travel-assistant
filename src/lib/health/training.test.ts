import { describe, it, expect } from 'vitest'
import { SEED_PROGRAMME } from './seedProgramme'
import {
  blockRepRangeFor, displayName, dropSetLoad, formatLoggedSet, suggestedStartLoad, topSetSeries, dropSetExerciseKey, effectivePrescription, exerciseClass, holdCap, isExcludedMovement,
  isStalled, orderWarning, parseRepRange, preTrainingCoffee, progressionSuggestion, recommendSession, sessionOrder,
  spacingWarning, trainingPosition, validateWorkoutAgainstProgramme, WorkoutInputSchema, unlockHostSession, unlockKey, unlockStatuses, weekSchedule, UNLOCK_EXERCISES,
  type ExercisePerformance, type LoggedSet, type TrainingSession, type WorkoutSummary,
} from './training'

const def = SEED_PROGRAMME
const session = (k: string) => def.trainingSessions.find(s => s.key === k) as TrainingSession
const ex = (s: string, k: string) => session(s).exercises.find(e => e.key === k)!
const rx = (s: string, k: string, week: number | null) => effectivePrescription(def, session(s), ex(s, k), week)
const START = '2026-11-02' // a Monday
const set = (over: Partial<LoggedSet> = {}): LoggedSet => ({ setIndex: 0, loadKg: 20, reps: 10, holdSeconds: null, rir: 2, toFailure: false, isDropSet: false, ...over })
const sets = (n: number, over: Partial<LoggedSet> = {}) => Array.from({ length: n }, (_, i) => set({ setIndex: i, ...over }))
const perf = (date: string, s: LoggedSet[]): ExercisePerformance => ({ date, sets: s })

describe('trainingPosition', () => {
  it('derives week and block from the start date', () => {
    expect(trainingPosition(def, START, '2026-11-01').phase).toBe('before_start')
    const w1 = trainingPosition(def, START, START)
    expect([w1.week, w1.block?.key, w1.light]).toEqual([1, 'b1', false])
    const w4 = trainingPosition(def, START, '2026-11-26')
    expect([w4.week, w4.block?.key, w4.light]).toEqual([4, 'b1', true])
    const w5 = trainingPosition(def, START, '2026-11-30')
    expect([w5.week, w5.block?.key]).toEqual([5, 'b2'])
    const w12 = trainingPosition(def, START, addWeeks(11))
    expect([w12.week, w12.block?.key, w12.deload]).toEqual([12, 'b3', true])
    expect(trainingPosition(def, START, addWeeks(12)).phase).toBe('completed')
  })
})

function addWeeks(n: number): string {
  const d = new Date(`${START}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n * 7)
  return d.toISOString().slice(0, 10)
}

describe('parseRepRange / exerciseClass', () => {
  it('parses ranges with suffixes', () => {
    expect(parseRepRange('8-12')).toEqual({ min: 8, max: 12, suffix: '' })
    expect(parseRepRange('12 each way')).toEqual({ min: 12, max: 12, suffix: 'each way' })
    expect(parseRepRange('10–15')).toEqual({ min: 10, max: 15, suffix: '' })
    expect(parseRepRange('AMRAP')).toBeNull()
    expect(parseRepRange(undefined)).toBeNull()
  })
  it('classifies compounds and isolation work', () => {
    expect(exerciseClass(ex('a', 'db_bench_press'))).toBe('compound')
    expect(exerciseClass(ex('a', 'one_arm_row'))).toBe('compound')
    expect(exerciseClass(ex('a', 'band_lat_pulldown'))).toBe('compound')
    expect(exerciseClass(ex('b', 'romanian_deadlift'))).toBe('compound')
    expect(exerciseClass(ex('b', 'db_hip_thrust'))).toBe('compound')
    expect(exerciseClass(ex('a', 'lateral_raise'))).toBe('isolation')
    expect(exerciseClass(ex('a', 'band_face_pull'))).toBe('isolation')
    expect(exerciseClass(ex('c', 'db_curl'))).toBe('isolation')
    expect(exerciseClass(ex('c', 'oh_triceps_ext'))).toBe('isolation')
    expect(exerciseClass(ex('b', 'dead_bug'))).toBe('isolation')
    expect(exerciseClass(ex('c', 'band_pull_apart'))).toBe('isolation')
  })
  it('splits the Block 3 range', () => {
    const b3 = def.blocks[2]
    expect(blockRepRangeFor(b3, ex('a', 'db_bench_press'))).toMatchObject({ min: 6, max: 12 })
    expect(blockRepRangeFor(b3, ex('a', 'lateral_raise'))).toMatchObject({ min: 12, max: 20 })
  })
})

describe('effectivePrescription', () => {
  it('Block 1: 3 sets of every exercise, 10–15, RIR 2–3', () => {
    for (const s of def.trainingSessions) {
      for (const e of s.exercises) {
        const p = effectivePrescription(def, s, e, 2)
        expect(p.sets).toBe(3)
        if (p.kind === 'reps') {
          expect([p.reps?.min, p.reps?.max]).toEqual([10, 15])
          expect(p.rir).toBe('2-3')
        }
        expect(p.lastSetToFailure).toBe(false)
      }
    }
    expect(rx('b', 'band_side_step', 1).target).toBe('10–15 each way')
  })
  it('Block 1 light week 4: 2 sets, no load reduction', () => {
    const p = rx('a', 'db_bench_press', 4)
    expect(p.sets).toBe(2)
    expect(p.loadFactor).toBeNull()
  })
  it('Block 2: session-table sets, 8–12, last set to failure (not on holds)', () => {
    expect(rx('a', 'db_bench_press', 5).sets).toBe(4)
    expect(rx('a', 'one_arm_row', 5).sets).toBe(4)
    expect(rx('a', 'seated_shoulder_press', 6).sets).toBe(3)
    const p = rx('a', 'lateral_raise', 6)
    expect([p.reps?.min, p.reps?.max, p.lastSetToFailure]).toEqual([8, 12, true])
    const hold = rx('b', 'shallow_wall_sit', 6)
    expect(hold.kind).toBe('hold')
    expect(hold.lastSetToFailure).toBe(false)
    expect(hold.target).toBe('45 s')
  })
  it('Block 2 light week 8: 2 sets at 60% load, no failure', () => {
    const p = rx('a', 'db_bench_press', 8)
    expect([p.sets, p.loadFactor, p.lastSetToFailure]).toEqual([2, 0.6, false])
  })
  it('Block 3: 4 sets, compound 6–12 / isolation 12–20, one drop set per session', () => {
    expect(rx('a', 'db_bench_press', 9)).toMatchObject({ sets: 4, reps: { min: 6, max: 12 } })
    expect(rx('a', 'band_face_pull', 10)).toMatchObject({ sets: 4, reps: { min: 12, max: 20 } })
    expect(rx('b', 'plank', 10).sets).toBe(4)
    for (const s of def.trainingSessions) {
      const drops = s.exercises.filter(e => effectivePrescription(def, s, e, 10).dropSetOnFinalSet)
      expect(drops).toHaveLength(1)
      expect(drops[0].region).not.toBe('core')
      expect(drops[0].jointWatch).toBe(false)
    }
    expect(dropSetExerciseKey(session('a'))).toBe('lateral_raise')
    expect(dropSetExerciseKey(session('b'))).toBe('standing_calf_raise')
    expect(dropSetExerciseKey(session('c'))).toBe('oh_triceps_ext')
  })
  it('week 12 deload: half the volume, no drop set, retest flag', () => {
    const p = rx('a', 'lateral_raise', 12)
    expect([p.sets, p.dropSetOnFinalSet, p.retest]).toEqual([2, false, true])
  })
  it('outside the programme uses the session table as written', () => {
    expect(rx('a', 'band_face_pull', null)).toMatchObject({ sets: 3, reps: { min: 15, max: 20 } })
    expect(rx('a', 'band_face_pull', 13)).toMatchObject({ sets: 3, reps: { min: 15, max: 20 } })
  })
})

describe('excluded movements, travel, unlocks', () => {
  const excluded = def.movementRestrictions!.excluded
  it('matches excluded movements by stem', () => {
    expect(isExcludedMovement('Goblet squat', excluded)).toBe(true)
    expect(isExcludedMovement('Reverse lunge', excluded)).toBe(true)
    expect(isExcludedMovement('Bulgarian split squat', excluded)).toBe(true)
    expect(isExcludedMovement('Lateral step-down', excluded)).toBe(true)
    expect(isExcludedMovement('Kneeling hip flexor stretch', excluded)).toBe(true)
    expect(isExcludedMovement('Low step-up (10–15 cm step)', excluded)).toBe(false)
    expect(isExcludedMovement('Sit-to-stand (from a high seat)', excluded)).toBe(false)
  })
  it('no seed exercise, travel substitute or unlock exercise is excluded', () => {
    for (const s of def.trainingSessions) for (const e of s.exercises) {
      expect(isExcludedMovement(e.name, excluded)).toBe(false)
      if (e.travelSubstitute) expect(isExcludedMovement(e.travelSubstitute.name, excluded)).toBe(false)
    }
    for (const e of Object.values(UNLOCK_EXERCISES)) expect(isExcludedMovement(e.name, excluded)).toBe(false)
  })
  it('travel mode swaps names and never offers an excluded substitute', () => {
    const row = ex('a', 'one_arm_row')
    expect(displayName(row, true, excluded)).toBe('Backpack row')
    expect(displayName(row, false, excluded)).toBe('One-arm dumbbell row')
    const bad = { ...row, travelSubstitute: { name: 'Bodyweight squat' } }
    expect(displayName(bad, true, excluded)).toBe('One-arm dumbbell row')
    // Same sets/reps in travel mode: prescription does not depend on travel.
    expect(rx('a', 'one_arm_row', 5).sets).toBe(4)
  })
  it('unlock keys', () => {
    expect(unlockKey('Sit-to-stand')).toBe('sit_to_stand')
    expect(unlockKey('Step-ups')).toBe('step_ups')
    expect(unlockHostSession(def)).toBe('b')
  })
  it('sit-to-stand: Block 2+ and pain rule passed', () => {
    const at = (blockIndex: number, painRulePassed: boolean) =>
      unlockStatuses(def, { blockIndex, painRulePassed, approvals: [], jointStopped: false }).find(u => u.key === 'sit_to_stand')!
    expect(at(0, true).available).toBe(false)
    expect(at(1, false).available).toBe(false)
    expect(at(1, true).available).toBe(true)
    expect(at(1, true).exercise?.reps).toBe('8-10')
  })
  it('step-ups: Block 3 and a recorded approval; never while a red flag is open', () => {
    const at = (blockIndex: number, approvals: string[], jointStopped = false) =>
      unlockStatuses(def, { blockIndex, painRulePassed: true, approvals, jointStopped }).find(u => u.key === 'step_ups')!
    expect(at(1, ['step_ups']).available).toBe(false)
    expect(at(2, []).available).toBe(false)
    expect(at(2, ['step_ups']).available).toBe(true)
    expect(at(2, ['step_ups'], true).available).toBe(false)
  })
})

describe('progressionSuggestion', () => {
  const bench = ex('a', 'db_bench_press')
  const b1 = rx('a', 'db_bench_press', 2) // 3 × 10–15
  it('top of range on every set with RIR → +2 kg upper', () => {
    const s = progressionSuggestion(def, bench, b1, [perf('2026-11-02', sets(3, { reps: 15, loadKg: 20 }))])
    expect(s).toMatchObject({ kind: 'add_load', nextLoadKg: 22 })
  })
  it('+4 kg for lower-body exercises', () => {
    const rdl = ex('b', 'romanian_deadlift')
    const s = progressionSuggestion(def, rdl, rx('b', 'romanian_deadlift', 2), [perf('d', sets(3, { reps: 15, loadKg: 16 }))])
    expect(s).toMatchObject({ kind: 'add_load', nextLoadKg: 20 })
  })
  it('needs RIR (or failure) recorded on every set', () => {
    const s = progressionSuggestion(def, bench, b1, [perf('d', [...sets(2, { reps: 15 }), set({ setIndex: 2, reps: 15, rir: null })])])
    expect(s.kind).toBe('keep')
    const f = progressionSuggestion(def, bench, b1, [perf('d', [...sets(2, { reps: 15 }), set({ setIndex: 2, reps: 15, rir: null, toFailure: true })])])
    expect(f.kind).toBe('add_load')
  })
  it('needs every prescribed set at the top', () => {
    expect(progressionSuggestion(def, bench, b1, [perf('d', sets(2, { reps: 15 }))]).kind).toBe('keep')
    expect(progressionSuggestion(def, bench, b1, [perf('d', [...sets(2, { reps: 15 }), set({ setIndex: 2, reps: 13 })])]).kind).toBe('keep')
  })
  it('band exercises → shorter band / further / thicker', () => {
    const pull = ex('a', 'band_face_pull')
    const s = progressionSuggestion(def, pull, rx('a', 'band_face_pull', 2), [perf('d', sets(3, { reps: 15, loadKg: null }))])
    expect(s.kind).toBe('band')
    expect(s.message).toMatch(/shorter band/)
  })
  it('holds → +15 s up to the cap; joint-watched holds capped at the programme hold', () => {
    const plank = ex('b', 'plank')
    const p = rx('b', 'plank', 2)
    expect(progressionSuggestion(def, plank, p, [perf('d', sets(3, { holdSeconds: 60, reps: null, loadKg: null }))])).toMatchObject({ kind: 'add_time', nextHoldSeconds: 75 })
    expect(progressionSuggestion(def, plank, p, [perf('d', sets(3, { holdSeconds: 90, reps: null, loadKg: null }))]).kind).toBe('at_cap')
    expect(progressionSuggestion(def, plank, p, [perf('d', sets(3, { holdSeconds: 40, reps: null, loadKg: null }))]).kind).toBe('keep')
    const wall = ex('b', 'shallow_wall_sit')
    expect(holdCap(wall)).toBe(45)
    expect(progressionSuggestion(def, wall, rx('b', 'shallow_wall_sit', 2), [perf('d', sets(3, { holdSeconds: 45, reps: null, loadKg: null }))]).kind).toBe('at_cap')
  })
  it('stalled two sessions running → keep the weight, add a set', () => {
    const h = [
      perf('d1', sets(3, { reps: 12, loadKg: 20 })),
      perf('d2', sets(3, { reps: 12, loadKg: 20 })),
      perf('d3', sets(3, { reps: 11, loadKg: 20 })),
    ]
    expect(isStalled(h)).toBe(true)
    expect(progressionSuggestion(def, bench, b1, h)).toMatchObject({ kind: 'add_set', nextSets: 4, nextLoadKg: 20 })
    const better = [h[0], h[1], perf('d3', sets(3, { reps: 13, loadKg: 20 }))]
    expect(isStalled(better)).toBe(false)
    expect(isStalled(h.slice(1))).toBe(false)
  })
  it('suppressed for joint-flagged exercises and quiet in light weeks', () => {
    const h = [perf('d', sets(3, { reps: 15 }))]
    expect(progressionSuggestion(def, bench, b1, h, { suppressedReason: 'Joint rule' }).kind).toBe('suppressed')
    expect(progressionSuggestion(def, bench, b1, h, { lightOrDeload: true }).kind).toBe('keep')
    expect(progressionSuggestion(def, bench, b1, []).kind).toBe('none')
  })
  it('drop-set rows do not count as working sets', () => {
    const s = progressionSuggestion(def, bench, b1, [perf('d', [...sets(3, { reps: 15 }), set({ setIndex: 2, isDropSet: true, reps: 6, loadKg: 14 })])])
    expect(s.kind).toBe('add_load')
  })
})

describe('schedule', () => {
  const w = (date: string, sessionKey: string, status: WorkoutSummary['status'] = 'done'): WorkoutSummary => ({ date, sessionKey, status })
  // Week of Mon 2026-11-16 … Sun 2026-11-22
  it('session order follows the weekly schedule (A → B → C)', () => {
    expect(sessionOrder(def)).toEqual(['a', 'b', 'c'])
  })
  it('planned session today', () => {
    const r = recommendSession(def, '2026-11-16', [])
    expect(r.sessionKey).toBe('a')
    expect(r.plannedKey).toBe('a')
    expect(r.shortWeek).toBe(false)
  })
  it('cardio day with nothing missed → no session', () => {
    expect(recommendSession(def, '2026-11-17', [w('2026-11-16', 'a')]).sessionKey).toBeNull()
  })
  it('missed Monday → catch up on Tuesday, keep order on Wednesday', () => {
    const tue = recommendSession(def, '2026-11-17', [])
    expect(tue.sessionKey).toBe('a')
    expect(tue.missed).toEqual(['a'])
    const wed = recommendSession(def, '2026-11-18', [])
    expect(wed.sessionKey).toBe('a')
    expect(wed.reason).toMatch(/A → B → C/)
  })
  it('week cut short → C first', () => {
    const r = recommendSession(def, '2026-11-20', []) // Fri: Fri + Sun left → 2 slots for 3 sessions
    expect(r.shortWeek).toBe(true)
    expect(r.remaining).toEqual(['c', 'a'])
    expect(r.sessionKey).toBe('c')
    const sun = recommendSession(def, '2026-11-22', [])
    expect(sun.remaining).toEqual(['c'])
  })
  it('spacing rule: warn after lifting yesterday', () => {
    expect(spacingWarning([w('2026-11-17', 'a')], '2026-11-18')).toMatch(/one day between/)
    expect(spacingWarning([w('2026-11-17', 'a', 'skipped')], '2026-11-18')).toBeNull()
    const r = recommendSession(def, '2026-11-18', [w('2026-11-17', 'a')])
    expect(r.sessionKey).toBe('b')
    expect(r.warnings.join(' ')).toMatch(/one day between/)
  })
  it('rest day after a catch-up lift does not suggest another lift', () => {
    const r = recommendSession(def, '2026-11-21', [w('2026-11-16', 'a'), w('2026-11-18', 'b'), w('2026-11-20', 'c')])
    expect(r.sessionKey).toBeNull()
    expect(r.reason).toMatch(/All sessions done/)
  })
  it('already trained today', () => {
    expect(recommendSession(def, '2026-11-16', [w('2026-11-16', 'a')]).reason).toMatch(/trained today/)
  })
  it('week schedule statuses', () => {
    const days = weekSchedule(def, '2026-11-20', [w('2026-11-17', 'a'), w('2026-11-18', 'b', 'skipped')])
    expect(days.map(d => d.status)).toEqual(['moved', 'done', 'skipped', null, 'today', null, null])
  })
  it('order warning', () => {
    expect(orderWarning(def, 'c', [w('2026-11-16', 'a')])).toMatch(/Session B/)
    expect(orderWarning(def, 'b', [w('2026-11-16', 'a')])).toBeNull()
  })
})

describe('preTrainingCoffee', () => {
  it('before the cut-off recommends coffee 45 min before; after it says skip', () => {
    expect(preTrainingCoffee('14:00', '09:00', true, false)?.message).toMatch(/45 min/)
    expect(preTrainingCoffee('14:00', '16:30', true, false)?.message).toMatch(/skip the pre-training coffee/i)
    expect(preTrainingCoffee('14:00', '09:00', false, false)).toBeNull()
    expect(preTrainingCoffee('14:00', '09:00', true, true)).toBeNull()
    expect(preTrainingCoffee(null, '09:00', true, false)).toBeNull()
  })
})

describe('workout input', () => {
  const base = { date: '2026-11-18', sessionKey: 'b', status: 'done', exercises: [{ exerciseKey: 'db_hip_thrust', sets: [{ setIndex: 0, loadKg: 20, reps: 12, rir: 2 }] }] }
  it('parses a done session and requires a skip reason', () => {
    expect(WorkoutInputSchema.safeParse(base).success).toBe(true)
    expect(WorkoutInputSchema.safeParse({ ...base, status: 'skipped', exercises: [] }).success).toBe(false)
    expect(WorkoutInputSchema.safeParse({ ...base, status: 'skipped', skipReason: 'Travel', exercises: [] }).success).toBe(true)
    expect(WorkoutInputSchema.safeParse({ ...base, exercises: [] }).success).toBe(false)
    expect(WorkoutInputSchema.safeParse({ ...base, duringPain: 11 }).success).toBe(false)
  })
  it('validates against the programme', () => {
    const input = WorkoutInputSchema.parse(base)
    const ctx = { availableUnlocks: [] as string[], jointStopped: false }
    expect(validateWorkoutAgainstProgramme(def, input, ctx)).toBeNull()
    expect(validateWorkoutAgainstProgramme(def, { ...input, sessionKey: 'z' }, ctx)).toBe('Unknown session')
    expect(validateWorkoutAgainstProgramme(def, { ...input, sessionKey: 'a' }, ctx)).toMatch(/not part of/)
    expect(validateWorkoutAgainstProgramme(def, input, { ...ctx, jointStopped: true })).toMatch(/physiotherapist/)
    const unlock = { ...input, exercises: [{ exerciseKey: 'sit_to_stand', sets: input.exercises[0].sets }] }
    expect(validateWorkoutAgainstProgramme(def, unlock, ctx)).toMatch(/not part of/)
    expect(validateWorkoutAgainstProgramme(def, unlock, { ...ctx, availableUnlocks: ['sit_to_stand'] })).toBeNull()
    const dup = { ...input, exercises: [{ exerciseKey: 'db_hip_thrust', sets: [...input.exercises[0].sets, ...input.exercises[0].sets] }] }
    expect(validateWorkoutAgainstProgramme(def, dup, ctx)).toMatch(/Duplicate/)
  })
})

describe('player helpers', () => {
  it('drop-set load and suggested start load', () => {
    expect(dropSetLoad(20)).toBe(14)
    expect(dropSetLoad(17)).toBe(12)
    expect(suggestedStartLoad(sets(3, { loadKg: 20 }), null, null)).toBe(20)
    expect(suggestedStartLoad(sets(3, { loadKg: 20 }), { kind: 'add_load', message: '', nextLoadKg: 22 }, null)).toBe(22)
    expect(suggestedStartLoad(sets(3, { loadKg: 20 }), null, 0.6)).toBe(12)
    expect(suggestedStartLoad(null, null, null)).toBeNull()
    expect(suggestedStartLoad(sets(2, { loadKg: null }), null, null)).toBeNull()
  })
  it('formats sets and builds the top-set series', () => {
    expect(formatLoggedSet(set())).toBe('20 kg × 10 · RIR 2')
    expect(formatLoggedSet(set({ loadKg: null, reps: 15, rir: null, toFailure: true }))).toBe('15 · failure')
    expect(formatLoggedSet(set({ loadKg: null, reps: null, holdSeconds: 45, rir: null }))).toBe('45 s')
    expect(formatLoggedSet(set({ isDropSet: true, loadKg: 14, reps: 6, rir: null, toFailure: true }))).toBe('drop: 14 kg × 6 · failure')
    expect(topSetSeries([perf('a', sets(2, { loadKg: 20 })), perf('b', sets(2, { loadKg: null, reps: null, holdSeconds: 40 })), perf('c', sets(1, { loadKg: null, reps: 10 }))]))
      .toEqual([{ date: 'a', value: 20 }, { date: 'b', value: 40 }, { date: 'c', value: null }])
  })
})
