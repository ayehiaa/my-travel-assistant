import { describe, it, expect } from 'vitest'
import { applyOffProduct, mapOffProduct, mapOffSearch, offCacheKey, offSearchUrl, pickOffMatch, OFF_USER_AGENT } from './openFoodFacts'

const raw = {
  code: '5411188112709', product_name: 'Soya Original', brands: 'Alpro, Danone', serving_quantity: 250,
  nutriments: { 'energy-kcal_100g': 39, proteins_100g: 3.3, carbohydrates_100g: 2.5, fat_100g: 1.8, 'saturated-fat_100g': 0.3, fiber_100g: 0.6 },
}

describe('Open Food Facts mapping', () => {
  it('maps a product and rejects incomplete ones', () => {
    expect(mapOffProduct(raw)).toEqual({
      code: '5411188112709', name: 'Soya Original', brand: 'Alpro', servingG: 250,
      per100: { kcal: 39, proteinG: 3.3, carbsG: 2.5, fatG: 1.8, satFatG: 0.3, fibreG: 0.6 },
    })
    expect(mapOffProduct({ ...raw, nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } })?.per100.kcal).toBe(100)
    expect(mapOffProduct({ ...raw, nutriments: {} })).toBeNull()
    expect(mapOffProduct({ ...raw, code: 'abc' })).toBeNull()
    expect(mapOffSearch({ products: [raw, { code: '1' }] })).toHaveLength(1)
    expect(mapOffSearch(null)).toEqual([])
  })

  it('applies label values at the item quantity, keeping components', () => {
    const p = mapOffProduct(raw)!
    const item = { name: 'soya milk', quantityG: 200, kcal: 1, proteinG: 1, carbsG: 1, fatG: 1, satFatG: 1, fibreG: 1,
      components: { soy_protein: 6.6 }, confidence: 'low' as const, isTreat: false, source: 'ai' as const, libraryId: null, offCode: null }
    expect(applyOffProduct(item, p)).toMatchObject({ name: 'Soya Original (Alpro)', kcal: 78, proteinG: 6.6, source: 'off', confidence: 'high', offCode: p.code, components: { soy_protein: 6.6 } })
  })

  it('picks a product only when every hint word matches', () => {
    const p = mapOffProduct(raw)!
    expect(pickOffMatch([p], { brand: 'Alpro', product: 'Soya original' })).toBe(p)
    expect(pickOffMatch([p], { brand: 'Oatly', product: 'Barista' })).toBeNull()
  })

  it('builds a generic request', () => {
    expect(offSearchUrl('alpro soya')).toContain('search_terms=alpro+soya')
    expect(OFF_USER_AGENT).not.toMatch(/@/)
    expect(offCacheKey(' Alpro  Soya! ')).toBe('off:search:alpro soya')
  })
})
