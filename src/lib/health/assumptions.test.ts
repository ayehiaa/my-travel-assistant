import { describe, it, expect } from 'vitest'
import {
  applyAssumptionPrefs, assumptionKey, assumptionPrefsOf, assumptionTotals, baseNutrients, dropAddedFat, readAssumptions,
  setAssumptionKept, withAssumptions, type Assumption,
} from './assumptions'

const butter: Assumption = { key: 'butter', label: 'butter on toast', kind: 'added_fat', addsKcal: 50, addsSatFatG: 3.6, addsProteinG: 0, addsCarbsG: 0, addsFatG: 5.7, kept: true, grams: 7, refId: 'usda-sr28:01001' }
const bigger: Assumption = { key: 'large_portion', label: 'larger slice', kind: 'portion', addsKcal: 40, addsSatFatG: 0.1, addsProteinG: 1.5, addsCarbsG: 7.5, addsFatG: 0.3, kept: true }
type TestItem = { kcal: number; proteinG: number; carbsG: number; fatG: number; satFatG: number; assumptions?: Assumption[] }
const toast: TestItem = { kcal: 204, proteinG: 8.1, carbsG: 37.3, fatG: 1.8, satFatG: 0.4 }

describe('assumptions', () => {
  it('stable keys from labels', () => {
    expect(assumptionKey('Butter (assumed)')).toBe('butter')
    expect(assumptionKey('Olive oil')).toBe('olive_oil')
    expect(assumptionKey('2 tbsp dressing')).toBe('tbsp_dressing')
    expect(assumptionKey('!!!')).toBe('assumption')
  })

  it('reads stored assumptions tolerantly (back-compat: missing / junk → none)', () => {
    expect(readAssumptions(undefined)).toEqual([])
    expect(readAssumptions('butter')).toEqual([])
    const out = readAssumptions([butter, { key: 'Bad Key' }, { ...butter }, { ...bigger, kept: undefined }])
    expect(out.map(a => a.key)).toEqual(['butter', 'large_portion'])
    expect(out[1].kept).toBe(true)
  })

  it('totals with assumptions kept and removed', () => {
    const item = withAssumptions(toast, [butter, bigger])
    expect(item).toMatchObject({ kcal: 294, satFatG: 4.1, fatG: 7.8 })
    const noButter = setAssumptionKept(item, 'butter', false)
    expect(noButter).toMatchObject({ kcal: 244, satFatG: 0.5 })
    expect(noButter.assumptions?.find(a => a.key === 'butter')?.kept).toBe(false)
    // add back → original totals; unknown key / same state → unchanged object
    expect(setAssumptionKept(noButter, 'butter', true)).toMatchObject({ kcal: 294, satFatG: 4.1 })
    expect(setAssumptionKept(item, 'nope', false)).toBe(item)
    expect(setAssumptionKept(item, 'butter', true)).toBe(item)
    expect(baseNutrients(noButter)).toMatchObject(toast)
    expect(assumptionTotals(noButter.assumptions)).toMatchObject({ kcal: 40 })
    expect(assumptionTotals(noButter.assumptions, false)).toMatchObject({ kcal: 90 })
  })

  it('no-butter/oil toggle drops added-fat assumptions only', () => {
    const item = withAssumptions(toast, [butter, bigger])
    const out = dropAddedFat(item)
    expect(out.assumptions?.map(a => a.key)).toEqual(['large_portion'])
    expect(out).toMatchObject({ kcal: 244, satFatG: 0.5 })
    expect(dropAddedFat(toast)).toBe(toast)
  })

  it('remembered chip choices apply and are derived from an item', () => {
    const item = withAssumptions(toast, [butter])
    const prefs = assumptionPrefsOf(setAssumptionKept(item, 'butter', false))
    expect(prefs).toEqual({ butter: false })
    expect(applyAssumptionPrefs(item, prefs)).toMatchObject({ kcal: 204, satFatG: 0.4 })
    expect(applyAssumptionPrefs(item, null)).toBe(item)
  })
})
