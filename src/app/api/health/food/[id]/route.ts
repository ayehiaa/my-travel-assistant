import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { FoodEntryPatchSchema } from '@/lib/health/nutrition'
import { zonedInstant } from '@/lib/health/time'
import { removePhotos } from '@/lib/health/healthPhotos'
import {
  dbErrorResponse,
  itemToRow,
  refreshRuleEvents,
  rememberFoods,
  requireEnrolment,
  requireHealthUser,
} from '@/lib/health/healthServer'

/** Edit (items / slot / time) or delete one food entry (specs/029 US3: photos are deleted with the entry). */

const ParamsSchema = z.object({ id: z.string().uuid() })

async function loadOwnEntry(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, id: string) {
  return supabase
    .from('health_food_entries')
    .select('id, local_date, local_time, photo_paths')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  const p = ParamsSchema.safeParse(await params)
  if (!p.success) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = FoodEntryPatchSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid update' }, { status: 400 })
  const patch = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol

  const { data: entry, error } = await loadOwnEntry(supabase, user.id, p.data.id)
  if (error) return dbErrorResponse(error)
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (patch.slot && !enrolment.def.mealSlots.some(s => s.key === patch.slot)) {
    return NextResponse.json({ error: 'Unknown meal slot' }, { status: 400 })
  }

  const date = String(entry.local_date)
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.slot !== undefined) update.slot = patch.slot
  if (patch.time !== undefined) {
    update.local_time = patch.time
    update.eaten_at = zonedInstant(date, patch.time, enrolment.timezone).toISOString()
  }
  const { error: updError } = await supabase.from('health_food_entries').update(update).eq('id', entry.id).eq('user_id', user.id)
  if (updError) return dbErrorResponse(updError)

  if (patch.items) {
    // Replace the items: insert the new set first, then delete the old rows, so a failure never leaves the entry empty.
    const { data: oldItems } = await supabase.from('health_food_items').select('id').eq('entry_id', entry.id)
    const { error: insError } = await supabase
      .from('health_food_items')
      .insert(patch.items.map((item, i) => itemToRow(item, entry.id as string, user.id, i)))
    if (insError) return dbErrorResponse(insError)
    const oldIds = (oldItems ?? []).map(r => r.id as string)
    if (oldIds.length > 0) await supabase.from('health_food_items').delete().in('id', oldIds)
    await rememberFoods(supabase, user.id, patch.items, patch.remember)
  }

  await refreshRuleEvents(supabase, user.id, enrolment, date)
  return NextResponse.json({ saved: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  const p = ParamsSchema.safeParse(await params)
  if (!p.success) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })

  const supabase = await createClient()
  const { data: entry, error } = await loadOwnEntry(supabase, user.id, p.data.id)
  if (error) return dbErrorResponse(error)
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error: delError } = await supabase.from('health_food_entries').delete().eq('id', entry.id).eq('user_id', user.id)
  if (delError) return dbErrorResponse(delError)

  const paths = Array.isArray(entry.photo_paths) ? (entry.photo_paths as string[]).filter(path => path.startsWith(`${user.id}/`)) : []
  await removePhotos(paths)

  // Fired rules for the day are recomputed from what is left.
  const enrol = await requireEnrolment(supabase, user.id)
  if (enrol.ok) {
    await supabase.from('health_rule_events').delete().eq('user_id', user.id).eq('local_date', entry.local_date)
    await refreshRuleEvents(supabase, user.id, enrol.enrolment, String(entry.local_date))
  }
  return NextResponse.json({ deleted: true })
}
