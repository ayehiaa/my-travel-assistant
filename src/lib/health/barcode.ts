import { OFF_BASE_URL, OFF_FIELDS, applyOffProduct, mapOffProduct, type OffProduct } from './openFoodFacts'
import type { FoodItem } from './nutrition'

/**
 * Barcode scanning (phase P3): barcode validation, Open Food Facts product-by-barcode URL / mapping, and portion
 * scaling of the per-100 g label values. Pure — the camera (BarcodeDetector) runs in the browser, the lookup on the
 * server through the shared OFF cache.
 */

/** Digits only; EAN-8, UPC-A (12), EAN-13 and GTIN-14 lengths. */
export function normaliseBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '')
  if (!/^\d+$/.test(digits)) return null
  return [8, 12, 13, 14].includes(digits.length) ? digits : null
}

/** GS1 check digit (EAN-8/13, UPC-A, GTIN-14). */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  let sum = 0
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1) })
  return (10 - (sum % 10)) % 10 === check
}

/** A scanned / typed barcode we will look up, or null with nothing sent anywhere. */
export function parseBarcode(raw: string): string | null {
  const code = normaliseBarcode(raw)
  return code && hasValidCheckDigit(code) ? code : null
}

export function offProductUrl(code: string): string {
  return `${OFF_BASE_URL}/api/v2/product/${code}.json?fields=${encodeURIComponent(OFF_FIELDS)}`
}

export function barcodeCacheKey(code: string): string {
  return `off:barcode:${code}`
}

/** OFF product-by-barcode response ({ status: 1, product }) → our product, or null (not found / unusable). */
export function mapOffBarcodeResponse(raw: unknown, code: string): OffProduct | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { status?: unknown; product?: unknown }
  if (r.status !== 1 && r.status !== '1' && r.status !== 'success') return null
  if (!r.product || typeof r.product !== 'object') return null
  return mapOffProduct({ code, ...(r.product as Record<string, unknown>) })
}

export interface PortionOption { label: string; grams: number }

/** Portion choices: the label's serving (when known), 100 g, and a few common multiples. */
export function portionOptions(product: Pick<OffProduct, 'servingG'>): PortionOption[] {
  const out: PortionOption[] = []
  if (product.servingG && product.servingG > 0 && product.servingG <= 2000) {
    const s = Math.round(product.servingG)
    out.push({ label: `1 serving (${s} g)`, grams: s })
    out.push({ label: `2 servings (${s * 2} g)`, grams: s * 2 })
  }
  for (const g of [30, 50, 100, 150, 200]) if (!out.some(o => o.grams === g)) out.push({ label: `${g} g`, grams: g })
  return out
}

const BLANK: FoodItem = {
  name: '', quantityG: 100, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, satFatG: 0, fibreG: 0,
  components: {}, confidence: 'high', isTreat: false, source: 'off', libraryId: null, offCode: null,
}

/** The logged item for a product at a portion: per-100 g label values × grams / 100 (label confidence). */
export function itemFromBarcodeProduct(product: OffProduct, grams: number): FoodItem {
  const g = Math.max(1, Math.min(2000, Math.round(grams)))
  return applyOffProduct({ ...BLANK, quantityG: g }, product)
}
