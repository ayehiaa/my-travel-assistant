import { callClaude } from '@/lib/aiCall'
import { resolveAiKeyForUser } from '@/lib/aiKeyStore'
import { AI_KEY_REJECTED_MESSAGE } from '@/lib/aiKeyResolver'
import { checkStopReason } from '@/lib/aiResponse'
import { itemsFromLibraryText } from './foodLibrary'
import {
  FOOD_ESTIMATE_SYSTEM,
  buildFoodEstimatePrompt,
  componentKeys,
  parseFoodEstimate,
  resolveEstimate,
  toFoodItem,
  type EstimatedItem,
} from './foodEstimate'
import { applyOffProduct, pickOffMatch } from './openFoodFacts'
import { searchOpenFoodFacts } from './openFoodFactsClient'
import { referenceCandidates } from './referenceFoods'
import { withAssumptions } from './assumptions'
import { loadEntries, loadLibrary, type ActiveEnrolment, type ServerClient } from './healthServer'
import { restaurantTips } from './travel'
import { sumNutrients, type FoodItem } from './nutrition'

/**
 * The one food-estimation pipeline (specs/029 US3 + P3.1), shared by POST /api/health/food/estimate (new entry) and
 * the re-calculate action on a saved entry (POST /api/health/food/[id]). Server only.
 *
 * Order: personal library text match (no AI) → Claude with the user's own key (items, portions, reference keys,
 * assumptions) → personal library override + remembered chip choices → reference dataset numbers → Open Food Facts
 * for branded packaged items → the model's own numbers as the last fallback. The no-added-fat toggle drops
 * added-fat assumptions.
 */

export const NO_KEY_MESSAGE = 'Add your Anthropic API key in Health → Programme to estimate food with AI'

export type EstimateOutcome =
  | { ok: true; items: FoodItem[]; source: 'library' | 'ai'; costUsd: number; tips: string[] }
  | { ok: false; status: number; error: string; needsAiKey?: boolean }

export async function runFoodEstimate(params: {
  supabase: ServerClient
  userId: string
  enrolment: ActiveEnrolment
  date: string
  text: string | null
  slot: string | null
  restaurant: boolean
  noAddedFat: boolean
  /** Base64 JPEGs (already metadata-stripped). */
  images: string[]
}): Promise<EstimateOutcome> {
  const { supabase, userId, enrolment, text, images } = params
  const library = await loadLibrary(supabase, userId)

  // 1. Text only and every part is a personal food → no AI call (free, instant).
  if (text && images.length === 0) {
    const fromLibrary = itemsFromLibraryText(text, library)
    if (fromLibrary) return { ok: true, items: fromLibrary, source: 'library', costUsd: 0, tips: [] }
  }

  // 2. Claude with the user's own key (owner emails may use the app key — spec 026).
  const key = await resolveAiKeyForUser(userId).catch(() => null)
  if (!key || !key.ok) return { ok: false, status: 400, error: NO_KEY_MESSAGE, needsAiKey: true }

  const slotName = enrolment.def.mealSlots.find(s => s.key === params.slot)?.name ?? null
  let result: Awaited<ReturnType<typeof callClaude>>
  try {
    result = await callClaude({
      role: 'health_food',
      name: 'health_food',
      system: FOOD_ESTIMATE_SYSTEM,
      user: buildFoodEstimatePrompt({
        text, photoCount: images.length, slotName, def: enrolment.def, library,
        restaurant: params.restaurant, noAddedFat: params.noAddedFat, candidates: referenceCandidates(text),
      }),
      images: images.map(data => ({ mediaType: 'image/jpeg' as const, data })),
      apiKey: key.apiKey,
    })
  } catch (err) {
    const rejected = err instanceof Error && err.message === AI_KEY_REJECTED_MESSAGE
    return { ok: false, status: 502, error: rejected ? AI_KEY_REJECTED_MESSAGE : 'The AI estimate failed — try again or add the items by hand' }
  }

  const stop = checkStopReason(result.stopReason)
  const parsed = stop.ok ? parseFoodEstimate(result.text, componentKeys(enrolment.def)) : null
  if (!parsed || parsed.length === 0) {
    return { ok: false, status: 422, error: 'Could not recognise any food — add more detail or enter the items by hand' }
  }

  // 3. Library → reference → AI (pure), then Open Food Facts for up to 3 branded products (parallel, 4 s timeout each).
  let items: EstimatedItem[] = resolveEstimate(parsed, library, { noAddedFat: params.noAddedFat })
  const packaged = items.map((item, i) => ({ item, i })).filter(x => x.item.packaged && x.item.source !== 'library').slice(0, 3)
  if (packaged.length > 0) {
    const matches = await Promise.all(packaged.map(async ({ item }) => {
      const hint = item.packaged!
      const products = await searchOpenFoodFacts(`${hint.brand} ${hint.product}`.trim())
      return pickOffMatch(products, hint)
    }))
    items = items.map((item, i) => {
      const k = packaged.findIndex(p => p.i === i)
      const product = k >= 0 ? matches[k] : null
      if (!product) return item
      // Label values replace the base item; assumption chips (if any) stay on top.
      const off = applyOffProduct({ ...item, assumptions: undefined, refId: null }, product)
      return item.assumptions?.length ? withAssumptions(off, item.assumptions) : off
    })
  }

  const out = items.map(toFoodItem)
  return {
    ok: true,
    items: out,
    source: 'ai',
    costUsd: result.usage.cost_usd,
    tips: params.restaurant ? await restaurantTipsFor(supabase, userId, enrolment, params.date, out) : [],
  }
}

/** Restaurant tips (deterministic) with the sat fat left today. Best effort: rules-only tips on any error. */
async function restaurantTipsFor(supabase: ServerClient, userId: string, enrolment: ActiveEnrolment, date: string, items: FoodItem[]): Promise<string[]> {
  let left: number | null = null
  try {
    const entries = await loadEntries(supabase, userId, date, date)
    left = enrolment.targets.satFatTargetG - sumNutrients(entries.flatMap(e => e.items)).satFatG
  } catch {
    left = null
  }
  return restaurantTips(enrolment.def, items, left)
}
