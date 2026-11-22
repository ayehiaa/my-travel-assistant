import { describe, it, expect } from 'vitest'
import { SEED_PROGRAMME, SEED_TEMPLATE_KEY, findTemplate } from './seedProgramme'
import { ProgrammeDefinitionSchema, parseProgrammeDefinition } from './programmeSchema'

describe('seed programme (12-Week Programme v3)', () => {
  it('parses and is found by key', () => {
    expect(findTemplate(SEED_TEMPLATE_KEY)?.definition.identity.name).toBe('12-Week Programme v3')
    expect(findTemplate('nope')).toBeNull()
    expect(parseProgrammeDefinition(JSON.parse(JSON.stringify(SEED_PROGRAMME)))).not.toBeNull()
  })

  it('covers every §3.1 area', () => {
    const p = SEED_PROGRAMME
    expect(p.identity.durationWeeks).toBe(12)
    expect(p.macros?.satFat).toEqual({ targetG: 15, ceilingG: 18 })
    expect(p.macros?.protein?.gPerKg).toBe(1.8)
    expect(p.macros?.fibre?.minG).toBe(35)
    expect(p.components.map(c => c.key)).toEqual(['plant_stanols', 'beta_glucan', 'soy_protein', 'nuts', 'pulses', 'oily_fish'])
    expect(p.components.find(c => c.key === 'plant_stanols')?.timing).toBe('with_meal')
    expect(p.components.find(c => c.key === 'oily_fish')).toMatchObject({ period: 'week', target: 2 })
    expect(p.mealSlots.map(s => s.key)).toEqual(['breakfast', 'coffee', 'lunch', 'afternoon', 'dinner'])
    expect(p.mealRotation?.days).toHaveLength(7)
    expect(p.mealRotation?.days.find(d => d.day === 'sat')?.slots.find(s => s.slot === 'lunch')?.flex).toBe(true)
    expect(p.nutritionRules.map(r => r.type).sort()).toEqual(
      ['caffeine_cutoff', 'last_meal_before_bed', 'one_starch_per_meal', 'protein_every_occasion', 'treat_budget'])
    expect(p.eatingOut.length).toBeGreaterThanOrEqual(5)
    // Session C's 8 table rows include one superset row (curl + overhead triceps) = 9 exercises
    expect(p.trainingSessions.map(s => s.exercises.length)).toEqual([7, 9, 9])
    expect(p.trainingSessions[1].exercises.map(e => e.name)).toContain('Dumbbell hip thrust')
    expect(p.trainingSessions[0].exercises[0]).toMatchObject({ name: 'Dumbbell bench press', sets: 4, reps: '8-12', restSeconds: 90 })
    expect(p.trainingSessions.every(s => s.exercises.every(e => e.videoUrl?.startsWith('https://www.youtube.com/')))).toBe(true)
    expect(p.weeklySchedule?.days).toHaveLength(7)
    expect(p.weeklySchedule?.shortWeekPriority[0]).toBe('c')
    expect(p.blocks.map(b => b.weeks)).toEqual([[1, 4], [5, 8], [9, 12]])
    expect(p.progression?.loadIncrementKg).toEqual({ upper: 2, lower: 4 })
    expect(p.movementRestrictions?.excluded).toContain('Lunges')
    expect(p.movementRestrictions?.conditionalUnlocks).toHaveLength(2)
    expect(p.painRules?.okThreshold).toBe(3)
    expect(p.cardio?.intensity).toMatchObject({ bpmMin: 104, bpmMax: 122 })
    expect(p.dailyMovement).toEqual({ stepsMin: 8000, stepsMax: 10000 })
    expect(p.sleep?.caffeineCutoff).toBe('14:00')
    expect(p.supplements[0]).toMatchObject({ key: 'creatine', waterWeightWeeks: 3 })
    expect(p.tracking?.doNotTrack).toContain('Morning temperature')
    expect(p.adjustment?.bands).toHaveLength(3)
    expect(p.milestones.map(m => m.week)).toEqual([1, 4, 6, 8, 12])
    expect(p.outcomes?.escalation[0]).toMatchObject({ metric: 'LDL', threshold: 4.9 })
  })

  it('never schedules an excluded movement', () => {
    const banned = /squat|lunge|step-down|kneel/i
    for (const s of SEED_PROGRAMME.trainingSessions) for (const e of s.exercises) expect(e.name).not.toMatch(banned)
  })
})

describe('ProgrammeDefinitionSchema', () => {
  const minimal = { identity: { name: 'Mine', durationWeeks: 4 } }

  it('accepts a minimal programme with defaults', () => {
    const p = ProgrammeDefinitionSchema.parse(minimal)
    expect(p.components).toEqual([])
    expect(p.identity.version).toBe('1')
  })

  it('rejects duplicate keys, unknown sessions and a ceiling below the target', () => {
    const comp = { key: 'x', name: 'X', unit: 'g', target: 1, period: 'day' }
    expect(ProgrammeDefinitionSchema.safeParse({ ...minimal, components: [comp, comp] }).success).toBe(false)
    expect(ProgrammeDefinitionSchema.safeParse({
      ...minimal, weeklySchedule: { days: [{ day: 'mon', kind: 'session', session: 'zz', label: 'Z' }] },
    }).success).toBe(false)
    expect(ProgrammeDefinitionSchema.safeParse({ ...minimal, macros: { satFat: { targetG: 20, ceilingG: 10 } } }).success).toBe(false)
  })

  it('rejects bad times and returns null for junk', () => {
    expect(ProgrammeDefinitionSchema.safeParse({
      ...minimal, mealSlots: [{ key: 'b', name: 'B', start: '7am', end: '08:00' }],
    }).success).toBe(false)
    expect(parseProgrammeDefinition({ nope: true })).toBeNull()
  })
})
