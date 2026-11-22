import { describe, it, expect } from 'vitest'
import { itemFromLibrary, itemsFromLibraryText, matchLibrary, normalizeFoodName, per100FromItem, readLibraryRow, splitFoodText, type LibraryFood } from './foodLibrary'

const lib: LibraryFood[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Soya flat white', normalizedName: 'soya flat white', defaultQuantityG: 250,
    per100: { kcal: 40, proteinG: 2.8, carbsG: 2, fatG: 1.8, satFatG: 0.3, fibreG: 0.4, components: { soy_protein: 1.2, caffeine_mg: 50 } }, isTreat: false },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Oat So Simple Original', normalizedName: 'oat so simple original', defaultQuantityG: 27,
    per100: { kcal: 370, proteinG: 11, carbsG: 59, fatG: 8, satFatG: 1.5, fibreG: 9, components: { beta_glucan: 3.6 } }, isTreat: false },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Walnuts', normalizedName: 'walnuts', defaultQuantityG: 45,
    per100: { kcal: 690, proteinG: 15, carbsG: 3, fatG: 69, satFatG: 6, fibreG: 7, components: { nuts: 100 } }, isTreat: false },
]

describe('food library', () => {
  it('normalises names', () => {
    expect(normalizeFoodName('  Café-Latte!! (Soya) ')).toBe('cafe latte soya')
  })

  it('matches exact and close names only', () => {
    expect(matchLibrary('soya flat white', lib)?.id).toBe(lib[0].id)
    expect(matchLibrary('Flat white, soya', lib)?.id).toBe(lib[0].id)
    expect(matchLibrary('oat so simple', lib)?.id).toBe(lib[1].id)
    expect(matchLibrary('oat milk', lib)).toBeNull()
    expect(matchLibrary('', lib)).toBeNull()
  })

  it('builds items from per-100 g values', () => {
    expect(itemFromLibrary(lib[2])).toMatchObject({ quantityG: 45, kcal: 311, components: { nuts: 45 }, source: 'library', confidence: 'high' })
    expect(itemFromLibrary(lib[1], 54).components.beta_glucan).toBe(1.9)
  })

  it('per-100 g round trip', () => {
    const i = itemFromLibrary(lib[0])
    expect(per100FromItem(i)).toMatchObject({ kcal: 40, proteinG: 2.8, components: { soy_protein: 1.2 } })
    expect(per100FromItem({ ...i, quantityG: 0 })).toBeNull()
  })

  it('splits text and logs from the library without AI when everything matches', () => {
    expect(splitFoodText('2 soya flat whites, 150g walnuts and half a banana')).toEqual([
      { name: 'soya flat whites', quantityG: null, count: 2 },
      { name: 'walnuts', quantityG: 150, count: 1 },
      { name: 'a banana', quantityG: null, count: 0.5 },
    ])
    const items = itemsFromLibraryText('2 soya flat whites + walnuts', lib)
    expect(items?.map(i => [i.name, i.quantityG])).toEqual([['Soya flat white', 500], ['Walnuts', 45]])
    expect(itemsFromLibraryText('walnuts and a croissant', lib)).toBeNull()
    expect(itemsFromLibraryText('walnuts', [])).toBeNull()
  })

  it('reads DB rows defensively', () => {
    expect(readLibraryRow({ id: 'x', name: 'A', per100: { kcal: 'bad' }, default_quantity_g: '0' })).toMatchObject({ defaultQuantityG: 100, per100: { kcal: 0 } })
    expect(readLibraryRow(null)).toBeNull()
  })
})
