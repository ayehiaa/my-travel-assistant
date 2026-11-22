import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FoodEntryInputSchema } from '@/lib/health/nutrition'
import { zonedInstant } from '@/lib/health/time'
import { isOwnPhotoPath } from '@/lib/health/healthPhotos'
import {
  dbErrorResponse,
  ensureDailyLog,
  itemToRow,
  nowFor,
  refreshRuleEvents,
  rememberFoods,
  requireEnrolment,
  requireHealthUser,
} from '@/lib/health/healthServer'

/**
 * Save a food entry with its (user-confirmed) items (specs/029 US3). Food details are never written to the audit
 * log (spec §8). Rules are re-evaluated after the write and fired ones stored (best effort).
 */

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = FoodEntryInputSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid food entry' }, { status: 400 })
  }
  const input = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol

  if (input.date > nowFor(enrolment).date) return NextResponse.json({ error: 'Cannot log food for a future date' }, { status: 400 })
  if (input.slot && !enrolment.def.mealSlots.some(s => s.key === input.slot)) {
    return NextResponse.json({ error: 'Unknown meal slot' }, { status: 400 })
  }
  if (!input.photoPaths.every(p => isOwnPhotoPath(p, user.id))) {
    return NextResponse.json({ error: 'Invalid photo reference' }, { status: 400 })
  }

  const log = await ensureDailyLog(supabase, user.id, input.date)
  if ('error' in log) return dbErrorResponse(log.error)

  const { data: entry, error: entryError } = await supabase
    .from('health_food_entries')
    .insert({
      user_id:      user.id,
      daily_log_id: log.id,
      local_date:   input.date,
      local_time:   input.time,
      eaten_at:     zonedInstant(input.date, input.time, enrolment.timezone).toISOString(),
      slot:         input.slot,
      input_text:   input.text ?? null,
      restaurant:   input.restaurant,
      photo_paths:  input.photoPaths,
    })
    .select('id')
    .single()
  if (entryError || !entry) return dbErrorResponse(entryError)

  const { error: itemsError } = await supabase
    .from('health_food_items')
    .insert(input.items.map((item, i) => itemToRow(item, entry.id as string, user.id, i)))
  if (itemsError) {
    await supabase.from('health_food_entries').delete().eq('id', entry.id)
    return dbErrorResponse(itemsError)
  }

  await rememberFoods(supabase, user.id, input.items, input.remember)
  await refreshRuleEvents(supabase, user.id, enrolment, input.date)

  return NextResponse.json({ id: entry.id }, { status: 201 })
}
