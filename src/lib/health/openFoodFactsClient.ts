import { createAdminClient } from '@/lib/supabase/admin'
import { OFF_USER_AGENT, mapOffSearch, offCacheKey, offSearchUrl, type OffProduct } from './openFoodFacts'

/**
 * Server only. Open Food Facts search with a shared cache (health_nutrition_cache, public product data — no personal
 * data is sent or stored: only the search words). OFF limits search to ~10 requests/minute, so results are cached
 * for 30 days and every failure (timeout, rate limit, missing cache table) degrades to "no database match".
 */

const CACHE_DAYS = 30
const TIMEOUT_MS = 4000

export async function searchOpenFoodFacts(query: string): Promise<OffProduct[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const key = offCacheKey(q)
  const admin = createAdminClient()

  try {
    const { data } = await admin.from('health_nutrition_cache').select('payload, fetched_at').eq('cache_key', key).maybeSingle()
    if (data && Date.now() - Date.parse(String(data.fetched_at)) < CACHE_DAYS * 86_400_000) {
      return mapOffSearch(data.payload)
    }
  } catch {
    // cache unavailable — fall through to the network
  }

  let raw: unknown
  try {
    const res = await fetch(offSearchUrl(q), {
      headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) return []
    raw = await res.json()
  } catch {
    return []
  }

  const products = mapOffSearch(raw)
  try {
    // Store only the mapped fields (small, stable) under the products key mapOffSearch reads.
    await admin.from('health_nutrition_cache').upsert({
      cache_key: key,
      source: 'openfoodfacts',
      payload: { products: products.map(p => ({ code: p.code, product_name: p.name, brands: p.brand ?? '', serving_quantity: p.servingG, nutriments: {
        'energy-kcal_100g': p.per100.kcal, proteins_100g: p.per100.proteinG, carbohydrates_100g: p.per100.carbsG,
        fat_100g: p.per100.fatG, 'saturated-fat_100g': p.per100.satFatG, fiber_100g: p.per100.fibreG,
      } })) },
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'cache_key' })
  } catch {
    // best effort
  }
  return products
}
