import { describe, expect, it } from 'vitest'
import {
  barcodeCacheKey, hasValidCheckDigit, itemFromBarcodeProduct, mapOffBarcodeResponse, normaliseBarcode, offProductUrl,
  parseBarcode, portionOptions,
} from './barcode'
import type { OffProduct } from './openFoodFacts'

const PRODUCT: OffProduct = {
  code: '5000108030447', name: 'Oat So Simple Original', brand: 'Quaker',
  per100: { kcal: 375, proteinG: 11, carbsG: 60, fatG: 8, satFatG: 1.5, fibreG: 9 }, servingG: 27,
}

describe('barcode validation', () => {
  it('normalises and checks lengths', () => {
    expect(normaliseBarcode(' 5000108 030447 ')).toBe('5000108030447')
    expect(normaliseBarcode('12345')).toBeNull()
    expect(normaliseBarcode('abc')).toBeNull()
  })
  it('validates GS1 check digits', () => {
    expect(hasValidCheckDigit('4006381333931')).toBe(true) // EAN-13
    expect(hasValidCheckDigit('4006381333932')).toBe(false)
    expect(hasValidCheckDigit('96385074')).toBe(true) // EAN-8
    expect(hasValidCheckDigit('036000291452')).toBe(true) // UPC-A
    expect(parseBarcode('4006381333931')).toBe('4006381333931')
    expect(parseBarcode('4006381333932')).toBeNull()
  })
  it('builds the OFF URL and cache key', () => {
    expect(offProductUrl('4006381333931')).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/4006381333931\.json\?fields=/)
    expect(barcodeCacheKey('123')).toBe('off:barcode:123')
  })
})

describe('OFF barcode response', () => {
  it('maps a found product', () => {
    const p = mapOffBarcodeResponse({ status: 1, product: { product_name: 'Skyr', brands: 'Arla', nutriments: { 'energy-kcal_100g': 63, proteins_100g: 11, fat_100g: 0.2, carbohydrates_100g: 4 } } }, '4006381333931')
    expect(p).toMatchObject({ code: '4006381333931', name: 'Skyr', brand: 'Arla', per100: { kcal: 63, proteinG: 11 } })
  })
  it('null for not found or unusable', () => {
    expect(mapOffBarcodeResponse({ status: 0 }, '1')).toBeNull()
    expect(mapOffBarcodeResponse({ status: 1, product: { product_name: 'X', nutriments: {} } }, '4006381333931')).toBeNull()
    expect(mapOffBarcodeResponse(null, '1')).toBeNull()
  })
})

describe('portions + scaling', () => {
  it('offers the serving first', () => {
    const opts = portionOptions(PRODUCT)
    expect(opts[0]).toEqual({ label: '1 serving (27 g)', grams: 27 })
    expect(opts.map(o => o.grams)).toEqual([27, 54, 30, 50, 100, 150, 200])
    expect(portionOptions({ servingG: null })[0].grams).toBe(30)
  })
  it('scales per-100 g values to the portion', () => {
    const item = itemFromBarcodeProduct(PRODUCT, 54)
    expect(item).toMatchObject({ name: 'Oat So Simple Original (Quaker)', quantityG: 54, kcal: 203, proteinG: 5.9, satFatG: 0.8, fibreG: 4.9, source: 'off', offCode: PRODUCT.code, confidence: 'high' })
    expect(itemFromBarcodeProduct(PRODUCT, 0).quantityG).toBe(1)
  })
})
