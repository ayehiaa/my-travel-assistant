import { describe, it, expect } from 'vitest'
import {
  FoodEntryInputSchema, FoodItemSchema, componentProgress, mealsRemaining, progressRatio, remainingBudget, scaleItem,
  suggestSlot, sumComponents, sumNutrients, uncertaintyBand, type FoodItem,
} from './nutrition'
import { SEED_PROGRAMME } from './seedProgramme'
import { computeTargets } from './targets'

const item = (over: Partial<FoodItem> = {}): FoodItem => ({
  name: 'Food', quantityG: 100, kcal: 200, proteinG: 10, carbsG: 20, fatG: 8, satFatG: 2, fibreG: 3,
  components: {}, confidence: 'medium', isTreat: false, source: 'ai', libraryId: null, offCode: null, ...over,
})

const targets = computeTargets(SEED_PROGRAMME, { sex: 'male', age: 40, heightCm: 180, weightKg: 80.5, activityLevel: 'moderate', timezone: 'Europe/London' }).targets

describe('nutrition', () => {
  it('sums nutrients and components', () => {
    const items = [item({ components: { nuts: 30 } }), item({ kcal: 150.4, satFatG: 1.25, components: { nuts: 5, pulses: 1 } })]
    expect(sumNutrients(items)).toEqual({ kcal: 350, proteinG: 20, carbsG: 40, fatG: 16, satFatG: 3.3, fibreG: 6 })
    expect(sumComponents(items)).toEqual({ nuts: 35, pulses: 1 })
  })

  it('remaining budget and ±15% band', () => {
    const r = remainingBudget(sumNutrients([item({ kcal: 1000, satFatG: 16 })]), targets, { mealsRemaining: 2, oneStarchRule: true })
    expect(r.kcal).toBe(1200)
    expect(r.satFatToTargetG).toBe(-1)
    expect(r.satFatToCeilingG).toBe(2)
    expect(r.starchServingsLeft).toBe(2)
    expect(remainingBudget(sumNutrients([]), targets).starchServingsLeft).toBeNull()
    expect(uncertaintyBand(400)).toEqual({ low: 340, high: 460 })
    expect(progressRatio(30, 15)).toBe(1)
    expect(progressRatio(5, 0)).toBe(0)
  })

  it('suggests slots and finds meals still to come', () => {
    expect(suggestSlot(SEED_PROGRAMME.mealSlots, '07:30')?.key).toBe('breakfast')
    expect(suggestSlot(SEED_PROGRAMME.mealSlots, '12:00')?.key).toBe('coffee')
    expect(suggestSlot(SEED_PROGRAMME.mealSlots, '21:00')?.key).toBe('dinner')
    expect(suggestSlot([], '12:00')).toBeNull()
    expect(mealsRemaining(SEED_PROGRAMME.mealSlots, '13:30', ['breakfast']).map(s => s.key)).toEqual(['lunch', 'dinner'])
    expect(mealsRemaining(SEED_PROGRAMME.mealSlots, '13:30', ['lunch']).map(s => s.key)).toEqual(['dinner'])
  })

  it('component progress (daily vs weekly)', () => {
    const p = componentProgress(SEED_PROGRAMME, { nuts: 30, pulses: 0.5 }, { oily_fish: 1, nuts: 90 })
    expect(p.find(c => c.key === 'nuts')).toMatchObject({ value: 30, met: true })
    expect(p.find(c => c.key === 'pulses')).toMatchObject({ value: 0.5, met: false })
    expect(p.find(c => c.key === 'oily_fish')).toMatchObject({ value: 1, target: 2, period: 'week', met: false })
  })

  it('scales a portion', () => {
    const s = scaleItem(item({ components: { nuts: 30 } }), 150)
    expect(s).toMatchObject({ quantityG: 150, kcal: 300, proteinG: 15, components: { nuts: 45 } })
    expect(scaleItem(item({ quantityG: 0 }), 50).quantityG).toBe(0)
  })

  it('validates items and entries', () => {
    expect(FoodItemSchema.safeParse({ ...item(), kcal: -1 }).success).toBe(false)
    expect(FoodItemSchema.safeParse({ ...item(), components: { 'Bad Key': 1 } }).success).toBe(false)
    const ok = { date: '2026-11-22', time: '13:00', slot: 'lunch', items: [item()] }
    expect(FoodEntryInputSchema.safeParse(ok).success).toBe(true)
    expect(FoodEntryInputSchema.safeParse({ ...ok, items: [] }).success).toBe(false)
    expect(FoodEntryInputSchema.safeParse({ ...ok, photoPaths: ['../../etc/passwd'] }).success).toBe(false)
    expect(FoodEntryInputSchema.safeParse({
      ...ok, photoPaths: ['11111111-1111-1111-1111-111111111111/2026-11-22/22222222-2222-2222-2222-222222222222.jpg'],
    }).success).toBe(true)
  })
})
