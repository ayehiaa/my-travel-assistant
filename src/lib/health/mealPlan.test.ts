import { describe, expect, it } from 'vitest'
import {
  buildShoppingList, cleanChoices, formatQuantity, matchPart, normalisePart, parseIngredientSplit, parseOption, planWeek,
  shoppingListText, slotAlternatives, splitOption,
} from './mealPlan'
import { SEED_PROGRAMME } from './seedProgramme'

const WEEK = '2026-11-23'

describe('option parsing', () => {
  it('splits options into parts', () => {
    expect(splitOption('Oats + soya + walnuts + blueberries')).toEqual(['Oats', 'soya', 'walnuts', 'blueberries'])
    expect(splitOption('Sardines or mackerel on wholegrain toast + salad')).toEqual(['Sardines or mackerel', 'wholegrain toast', 'salad'])
  })
  it('normalises parts', () => {
    expect(normalisePart('Leblebi (40 g)')).toBe('leblebi')
    expect(normalisePart('2 poached eggs')).toBe('poached eggs')
    expect(normalisePart('Lighter: skyr')).toBe('skyr')
    expect(normalisePart('Crudités')).toBe('crudites')
  })
  it('matches the longest alias and merges alternatives', () => {
    expect(matchPart('Smoked salmon').map(d => d.key)).toEqual(['smoked_salmon'])
    expect(matchPart('Cod or hake').map(d => d.key)).toEqual(['white_fish'])
    expect(matchPart('Jacket potato').map(d => d.key)).toEqual(['baking_potato'])
    expect(matchPart('Shish tawook (no butter)').map(d => d.key)).toEqual(['chicken'])
  })
  it('every non-flex seed rotation option resolves with the dictionary alone', () => {
    for (const day of SEED_PROGRAMME.mealRotation!.days) {
      for (const slot of day.slots) {
        if (slot.flex) continue
        for (const option of slot.options) {
          const r = parseOption(option)
          expect(r.unresolved, option).toEqual([])
          if (!/leftover/i.test(option)) expect(r.ingredients.length, option).toBeGreaterThan(0)
        }
      }
    }
  })
  it('ignores leftovers and uses the AI cache for unknown parts', () => {
    expect(parseOption('Leftover grilled fish')).toEqual({ ingredients: [], unresolved: [] })
    expect(parseOption('Quinoa bowl + salad').unresolved).toEqual(['Quinoa bowl'])
    const cache = { 'quinoa bowl': [{ key: 'ai_quinoa', name: 'Quinoa', aisle: 'Cupboard' as const, quantity: 60, unit: 'g' }] }
    const r = parseOption('Quinoa bowl + salad', cache)
    expect(r.unresolved).toEqual([])
    expect(r.ingredients.map(i => i.key)).toEqual(['ai_quinoa', 'salad'])
  })
})

describe('week plan', () => {
  it('has a cell per day × slot in programme slot order', () => {
    const cells = planWeek(SEED_PROGRAMME, WEEK)
    expect(cells).toHaveLength(28)
    expect(cells[0]).toMatchObject({ day: 'mon', date: WEEK, slot: 'breakfast', chosen: 'Oats + soya + walnuts + blueberries', swapped: false })
    expect(cells[27].date).toBe('2026-11-29')
    const satLunch = cells.find(c => c.day === 'sat' && c.slot === 'lunch')!
    expect(satLunch.flex).toBe(true)
    expect(satLunch.options).toHaveLength(1)
  })
  it('swaps within a slot only', () => {
    const alts = slotAlternatives(SEED_PROGRAMME, 'mon', 'lunch')
    expect(alts[0]).toBe('Jacket potato + tuna + big salad')
    expect(alts).toContain('Lentil soup + tabbouleh + 1 flatbread')
    expect(alts).not.toContain('Eat out — grilled protein, salad, one starch')
    expect(alts).not.toContain('Skyr + pomegranate')
    const cells = planWeek(SEED_PROGRAMME, WEEK, { 'mon:lunch': 'Lentil soup + tabbouleh + 1 flatbread', 'mon:dinner': 'Skyr + nuts' })
    const lunch = cells.find(c => c.day === 'mon' && c.slot === 'lunch')!
    expect(lunch).toMatchObject({ chosen: 'Lentil soup + tabbouleh + 1 flatbread', swapped: true })
    // Invalid (cross-slot) choice falls back to the rotation.
    expect(cells.find(c => c.day === 'mon' && c.slot === 'dinner')!.swapped).toBe(false)
  })
  it('cleanChoices drops stale choices', () => {
    expect(cleanChoices(SEED_PROGRAMME, { 'mon:lunch': 'Lentil soup + tabbouleh + 1 flatbread', 'mon:dinner': 'Skyr + nuts' }))
      .toEqual({ 'mon:lunch': 'Lentil soup + tabbouleh + 1 flatbread' })
  })
})

describe('shopping list', () => {
  const list = buildShoppingList(planWeek(SEED_PROGRAMME, WEEK))
  const find = (key: string) => list.groups.flatMap(g => g.items).find(i => i.key === key)
  it('aggregates quantities across the week', () => {
    // Oats: Mon, Tue, Wed, Fri, Sat (first option), Sun = 6 × 50 g.
    expect(find('oats')).toMatchObject({ quantity: 300, unit: 'g', count: 6, aisle: 'Cupboard' })
    // Benecol at 6 dinners (not Saturday's lighter dinner).
    expect(find('benecol')).toMatchObject({ quantity: 6, count: 6 })
    expect(find('skyr')!.count).toBe(5)
  })
  it('groups by aisle in store order and skips flex meals', () => {
    expect(list.groups.map(g => g.aisle)[0]).toBe('Fruit & veg')
    expect(list.flexMeals).toBe(1)
    expect(list.unresolved).toEqual([])
  })
  it('lists unresolved parts under Other', () => {
    const l = buildShoppingList([{ day: 'mon', date: WEEK, slot: 'lunch', slotName: 'Lunch', options: ['Quinoa bowl'], chosen: 'Quinoa bowl', flex: false, swapped: false }])
    expect(l.groups).toEqual([{ aisle: 'Other', items: [expect.objectContaining({ name: 'Quinoa bowl', aisle: 'Other' })] }])
    expect(l.unresolved).toEqual(['Quinoa bowl'])
  })
  it('formats quantities and text', () => {
    expect(formatQuantity({ quantity: 1500, unit: 'ml' })).toBe('1.5 l')
    expect(formatQuantity({ quantity: 2, unit: 'tin' })).toBe('2 tins')
    expect(formatQuantity({ quantity: 3, unit: 'piece' })).toBe('3')
    const text = shoppingListText(list, WEEK, ['oats'])
    expect(text.split('\n')[0]).toBe(`Shopping list — week of ${WEEK}`)
    expect(text).toContain('✓ Oats — 300 g')
    expect(text).toContain('1 meal out (flex) — nothing to buy.')
  })
})

describe('AI ingredient split parsing', () => {
  it('keeps only asked parts and valid ingredients, mapping known names to the dictionary', () => {
    const json = { parts: [
      { text: 'Quinoa bowl', ingredients: [{ name: 'Quinoa', aisle: 'Cupboard', quantity: 60, unit: 'g' }, { name: 'Salad', aisle: 'Fruit & veg', quantity: 1, unit: 'portion' }, { name: 'x', aisle: 'Moon', quantity: -1, unit: 'g' }] },
      { text: 'Not asked', ingredients: [{ name: 'Y', aisle: 'Other', quantity: 1, unit: 'g' }] },
    ] }
    const r = parseIngredientSplit(json, ['Quinoa bowl'])
    expect(Object.keys(r)).toEqual(['quinoa bowl'])
    expect(r['quinoa bowl']).toEqual([
      { key: 'ai_quinoa', name: 'Quinoa', aisle: 'Cupboard', quantity: 60, unit: 'g' },
      { key: 'salad', name: 'Salad leaves & salad veg', aisle: 'Fruit & veg', quantity: 1, unit: 'portion' },
    ])
    expect(parseIngredientSplit('nope', ['a'])).toEqual({})
  })
})
