import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/aiCall'
import { resolveAiKeyForUser } from '@/lib/aiKeyStore'
import { AI_KEY_REJECTED_MESSAGE } from '@/lib/aiKeyResolver'
import { checkStopReason } from '@/lib/aiResponse'
import { extractJsonObject } from '@/lib/health/foodEstimate'
import { requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import {
  INGREDIENT_SPLIT_SYSTEM, buildIngredientPrompt, buildShoppingList, normalisePart, parseIngredientSplit, planWeek,
} from '@/lib/health/mealPlan'
import { weekStart } from '@/lib/health/time'
import { P3MigrationNeeded, P3_MIGRATION_MESSAGE, loadIngredientCache, loadMealPlan, p3DbError } from '@/lib/health/p3Server'

/**
 * AI fallback for the shopping list (specs/029 US13): meal-plan parts the built-in dictionary does not know are split
 * into ingredients with the user's own key, once, and cached per user (health_ingredient_cache).
 */

export const maxDuration = 60
const MAX_PARTS = 30

const BodySchema = z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict()

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success || weekStart(parsed.data.week) !== parsed.data.week) return NextResponse.json({ error: 'week must be a Monday' }, { status: 400 })
  const { week } = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, auth.user.id)
  if (!enrol.ok) return enrol.response

  let plan
  try {
    plan = await loadMealPlan(supabase, auth.user.id, week)
  } catch (err) {
    if (err instanceof P3MigrationNeeded) return NextResponse.json({ error: P3_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  const cache = await loadIngredientCache(supabase, auth.user.id)
  const list = buildShoppingList(planWeek(enrol.enrolment.def, week, plan.choices), cache)
  const parts = list.unresolved.slice(0, MAX_PARTS)
  if (parts.length === 0) return NextResponse.json({ resolved: 0 })

  const key = await resolveAiKeyForUser(auth.user.id).catch(() => null)
  if (!key || !key.ok) return NextResponse.json({ error: 'Add your Anthropic API key in Health → Programme to split these meals with AI', needsAiKey: true }, { status: 400 })

  let result: Awaited<ReturnType<typeof callClaude>>
  try {
    result = await callClaude({ role: 'health_ingredients', name: 'health_ingredients', system: INGREDIENT_SPLIT_SYSTEM, user: buildIngredientPrompt(parts), apiKey: key.apiKey })
  } catch (err) {
    const rejected = err instanceof Error && err.message === AI_KEY_REJECTED_MESSAGE
    return NextResponse.json({ error: rejected ? AI_KEY_REJECTED_MESSAGE : 'The AI split failed — try again later' }, { status: 502 })
  }
  if (!checkStopReason(result.stopReason).ok) return NextResponse.json({ error: 'The AI could not split these meals' }, { status: 422 })
  const split = parseIngredientSplit(extractJsonObject(result.text), parts)
  // Parts the model skipped stay on the list as written (under Other) — cached so we never pay twice for them.
  const rows = parts
    .map(p => ({ part: p, k: normalisePart(p) }))
    .filter(x => x.k.length > 0)
    .map(x => ({
      user_id: auth.user.id,
      part_key: x.k.slice(0, 200),
      ingredients: split[x.k] ?? [{ key: `other_${x.k.replace(/ /g, '_')}`.slice(0, 80), name: x.part.slice(0, 80), aisle: 'Other', quantity: 0, unit: 'portion' }],
    }))
  const { error } = await supabase.from('health_ingredient_cache').upsert(rows, { onConflict: 'user_id,part_key' })
  if (error) return p3DbError(error)
  return NextResponse.json({ resolved: rows.length, costUsd: result.usage.cost_usd })
}
