import { describe, it, expect } from 'vitest'
import { SEED_PROGRAMME as def } from './seedProgramme'
import { computeWeeklyReview, type ReviewDayFood } from './weeklyReview'
import { addDays } from './time'

const targets = { kcal: 2200, proteinG: 145, fatG: 75, satFatTargetG: 15, satFatCeilingG: 18, carbsG: 235, fibreMinG: 35 }
const MON = '2026-11-16'
const item = (over: Partial<{ proteinG: number; satFatG: number; components: Record<string, number> }> = {}) => ({
  kcal: 500, proteinG: 40, carbsG: 50, fatG: 15, satFatG: 3, fibreG: 8, components: {}, ...over,
})

function week(days: (i: number) => ReviewDayFood['items']): ReviewDayFood[] {
  return Array.from({ length: 7 }, (_, i) => ({ date: addDays(MON, i), items: days(i) }))
}

describe('computeWeeklyReview', () => {
  it('counts adherence and picks the combined oats + soya focus first', () => {
    const food = week(i => [
      item({ proteinG: i < 5 ? 150 : 100, satFatG: i === 2 ? 20 : 10, components: { nuts: 30, pulses: 1, plant_stanols: 2, oily_fish: i < 2 ? 1 : 0 } }),
    ])
    const r = computeWeeklyReview({
      def, targets, weekStart: MON, food,
      workouts: [{ date: MON, status: 'done' }, { date: addDays(MON, 2), status: 'partial' }],
      cardio: [{ date: addDays(MON, 1), type: 'Walk', minutes: 30, avgHr: null, intervals: false }],
      steps: [{ date: MON, steps: 9000 }, { date: addDays(MON, 1), steps: 7000 }],
      sleep: [], weighIns: [], waist: [],
    })
    expect(r.daysLogged).toBe(7)
    expect(r.proteinDays).toBe(5)
    expect(r.satFatWithinTargetDays).toBe(6)
    expect(r.satFatWithinCeilingDays).toBe(6)
    expect(r.components.find(c => c.key === 'beta_glucan')).toMatchObject({ value: 0, of: 7 })
    expect(r.components.find(c => c.key === 'nuts')).toMatchObject({ value: 7 })
    expect(r.components.find(c => c.key === 'oily_fish')).toMatchObject({ period: 'week', value: 2, of: 2 })
    expect(r.sessions).toEqual({ done: 1, partial: 1, planned: 3 })
    expect(r.cardio).toEqual({ minutes: 30, target: 120 })
    expect(r.steps.average).toBe(8000)
    expect(r.focus).toHaveLength(3)
    expect(r.focus[0]).toMatch(/Oats with soya milk/)
    expect(r.focus[1]).toMatch(/Saturated fat/)
  })
  it('an all-good week says so', () => {
    const food = week(() => [item({ proteinG: 150, components: { beta_glucan: 3, soy_protein: 25, nuts: 30, pulses: 1, plant_stanols: 2, oily_fish: 1 } })])
    const r = computeWeeklyReview({
      def, targets, weekStart: MON, food,
      workouts: [0, 2, 4].map(i => ({ date: addDays(MON, i), status: 'done' as const })),
      cardio: [1, 3, 5, 6].map(i => ({ date: addDays(MON, i), type: 'Walk', minutes: 30, avgHr: null, intervals: false })),
      steps: [], sleep: [], weighIns: [], waist: [],
    })
    expect(r.focus).toEqual(['Everything on track — keep the same routine and plan next week\'s food today.'])
  })
  it('partial week scales the thresholds', () => {
    const r = computeWeeklyReview({ def, targets, weekStart: MON, daysElapsed: 2, food: [], workouts: [], cardio: [], steps: [], sleep: [], weighIns: [], waist: [] })
    expect(r.daysCounted).toBe(2)
    expect(r.components.find(c => c.key === 'nuts')?.of).toBe(2)
  })
})
