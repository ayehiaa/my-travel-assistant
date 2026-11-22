import type { FoodItem } from './nutrition'
import { normalizeFoodName, type Per100 } from './foodLibrary'

/**
 * Open Food Facts (public, ODbL) — packaged-food nutrition per 100 g (specs/029 §12.4). Pure mapping helpers;
 * the network + cache live in openFoodFactsClient.ts (server only).
 */

export const OFF_BASE_URL = 'https://world.openfoodfacts.org'
/** Generic app identification as OFF asks for — no personal data. */
export const OFF_USER_AGENT = 'SojournHealthDiary/1.0 (personal nutrition diary)'
export const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_quantity'

export interface OffProduct {
  code: string
  name: string
  brand: string | null
  per100: Omit<Per100, 'components'>
  servingG: number | null
}

function n(v: unknown): number | null {
  const x = typeof v === 'string' ? Number(v) : v
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null
}

const r1 = (v: number) => Math.round(v * 10) / 10

/** One OFF product JSON → our shape. Null when it lacks a code, a name or usable energy + macros. */
export function mapOffProduct(raw: unknown): OffProduct | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const code = typeof p.code === 'string' && /^[0-9]{4,20}$/.test(p.code) ? p.code : null
  const name = [p.product_name_en, p.product_name].find(v => typeof v === 'string' && v.trim()) as string | undefined
  const nut = (p.nutriments && typeof p.nutriments === 'object' ? p.nutriments : {}) as Record<string, unknown>
  if (!code || !name) return null
  let kcal = n(nut['energy-kcal_100g'])
  if (kcal === null) {
    const kj = n(nut['energy-kj_100g']) ?? n(nut['energy_100g'])
    kcal = kj === null ? null : kj / 4.184
  }
  const protein = n(nut['proteins_100g'])
  const fat = n(nut['fat_100g'])
  const carbs = n(nut['carbohydrates_100g'])
  if (kcal === null || kcal > 950 || protein === null || fat === null || carbs === null) return null
  const sat = n(nut['saturated-fat_100g'])
  const brand = typeof p.brands === 'string' && p.brands.trim() ? p.brands.split(',')[0].trim() : null
  return {
    code,
    name: name.trim().slice(0, 120),
    brand,
    per100: {
      kcal: Math.round(kcal),
      proteinG: r1(protein),
      carbsG: r1(carbs),
      fatG: r1(fat),
      satFatG: r1(Math.min(sat ?? 0, fat)),
      fibreG: r1(n(nut['fiber_100g']) ?? 0),
    },
    servingG: n(p.serving_quantity),
  }
}

/** Products from a search response ({ products: [...] }), unusable ones skipped. */
export function mapOffSearch(raw: unknown, limit = 8): OffProduct[] {
  const products = raw && typeof raw === 'object' && Array.isArray((raw as { products?: unknown }).products)
    ? (raw as { products: unknown[] }).products
    : []
  return products.map(mapOffProduct).filter((p): p is OffProduct => p !== null).slice(0, limit)
}

export function offSearchUrl(query: string, pageSize = 10): string {
  const q = new URLSearchParams({
    search_terms: query.slice(0, 100),
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(pageSize),
    fields: OFF_FIELDS,
  })
  return `${OFF_BASE_URL}/cgi/search.pl?${q.toString()}`
}

export function offCacheKey(query: string): string {
  return `off:search:${normalizeFoodName(query)}`
}

/**
 * Apply OFF macros to an estimated item at its quantity, keeping the item's programme components (OFF has no
 * stanol / beta-glucan data). Confidence becomes high: the values are the label's.
 */
export function applyOffProduct<T extends FoodItem>(item: T, product: OffProduct): T {
  const q = item.quantityG > 0 ? item.quantityG : product.servingG ?? 100
  const f = q / 100
  return {
    ...item,
    name: product.brand ? `${product.name} (${product.brand})` : product.name,
    quantityG: Math.round(q),
    kcal: Math.round(product.per100.kcal * f),
    proteinG: r1(product.per100.proteinG * f),
    carbsG: r1(product.per100.carbsG * f),
    fatG: r1(product.per100.fatG * f),
    satFatG: r1(product.per100.satFatG * f),
    fibreG: r1(product.per100.fibreG * f),
    confidence: 'high',
    source: 'off',
    offCode: product.code,
  }
}

/** Best product for a "brand + product" hint: every hint token must appear in the product name/brand. */
export function pickOffMatch(products: OffProduct[], hint: { brand: string; product: string }): OffProduct | null {
  const want = normalizeFoodName(`${hint.brand} ${hint.product}`).split(' ').filter(t => t.length > 2)
  if (want.length === 0) return null
  for (const p of products) {
    const have = normalizeFoodName(`${p.brand ?? ''} ${p.name}`)
    if (want.every(t => have.includes(t))) return p
  }
  return null
}
