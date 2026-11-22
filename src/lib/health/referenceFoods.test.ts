import { describe, it, expect } from 'vitest'
import {
  REFERENCE_DATASET, REFERENCE_FOODS, matchReferenceStrict, referenceById, referenceCandidates, scaleReference,
  scaleReferenceParts, searchReference, singularWord,
} from './referenceFoods'

const top = (q: string) => searchReference(q, 1)[0]?.food.name

describe('reference dataset', () => {
  it('is a sourced compact subset with complete rows', () => {
    expect(REFERENCE_DATASET.id).toBe('usda-sr28')
    expect(REFERENCE_FOODS.length).toBeGreaterThanOrEqual(300)
    expect(REFERENCE_FOODS.length).toBeLessThanOrEqual(600)
    const ids = new Set<string>()
    for (const f of REFERENCE_FOODS) {
      expect(f.id).toMatch(/^usda-sr28:[0-9]{5}$/)
      expect(f.sourceDesc.length).toBeGreaterThan(2)
      for (const v of Object.values(f.per100)) expect(Number.isFinite(v) && v >= 0).toBe(true)
      expect(f.per100.satFatG).toBeLessThanOrEqual(f.per100.fatG + 0.1)
      ids.add(f.id)
    }
    expect(ids.size).toBe(REFERENCE_FOODS.length)
  })

  it('carries the dataset values for the regression foods (SR28 rows 09037, 18029, 01001)', () => {
    expect(referenceById('usda-sr28:09037')?.per100).toMatchObject({ kcal: 160, fatG: 14.7, satFatG: 2.13 })
    expect(referenceById('usda-sr28:18029')?.per100).toMatchObject({ kcal: 272, satFatG: 0.53 })
    expect(referenceById('usda-sr28:01001')?.per100).toMatchObject({ kcal: 717, satFatG: 51.37 })
    expect(referenceById('nope:1')).toBeNull()
  })

  it('scales per portion', () => {
    const avo = referenceById('usda-sr28:09037')!
    expect(scaleReference(avo, 80)).toEqual({ kcal: 128, proteinG: 1.6, carbsG: 1.4, fatG: 11.8, satFatG: 1.7, fibreG: 5.4 })
    expect(scaleReference(avo, 0).kcal).toBe(0)
    const espresso = referenceById(searchReference('espresso', 1)[0].food.id)!
    const soya = searchReference('soya milk', 1)[0].food
    const fw = scaleReferenceParts([{ food: espresso, grams: 60 }, { food: soya, grams: 150 }])
    expect(fw.kcal).toBe(Math.round(espresso.per100.kcal * 0.6 + soya.per100.kcal * 1.5))
  })

  it('ranks matches deterministically', () => {
    expect(singularWord('tomatoes')).toBe('tomato')
    expect(singularWord('berries')).toBe('berry')
    expect(top('avocado')).toBe('Avocado')
    expect(top('smashed avocado')).toBe('Avocado')
    expect(top('sourdough toast')).toBe('Sourdough bread')
    expect(top('sourdough')).toBe('Sourdough bread')
    expect(top('2 poached eggs')).toBe('Poached egg')
    expect(top('soya milk')).toBe('Soya milk, unsweetened')
    expect(top('salmon')).toBe('Salmon (cooked)')
    expect(top('bulgur')).toBe('Bulgur wheat (cooked)')
    expect(searchReference('zzzz')).toEqual([])
    expect(searchReference('avocado', 3)).toEqual(searchReference('avocado', 3))
  })

  it('strict matching refuses weak or ambiguous names', () => {
    expect(matchReferenceStrict('Poached eggs')?.name).toBe('Poached egg')
    expect(matchReferenceStrict('Grandma special casserole')).toBeNull()
  })

  it('candidates for the production example include every component and added fats', () => {
    const names = referenceCandidates('Avocado on one sourdough toast, 2 poached eggs, 2 flat white soya milk').map(f => f.name)
    for (const n of ['Avocado', 'Sourdough bread', 'Poached egg', 'Soya milk, unsweetened', 'Espresso', 'Butter', 'Olive oil']) expect(names).toContain(n)
    expect(names.length).toBeLessThanOrEqual(45)
    expect(referenceCandidates(null).map(f => f.name)).toContain('Butter')
  })
})
