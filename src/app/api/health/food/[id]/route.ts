import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { resolveAiKeyForUser } from '@/lib/aiKeyStore'
import { FoodEntryPatchSchema } from '@/lib/health/nutrition'
import { zonedInstant } from '@/lib/health/time'
import { MAX_PHOTOS } from '@/lib/health/foodEstimate'
import { NO_KEY_MESSAGE, runFoodEstimate } from '@/lib/health/foodEstimateServer'
import { entryColumnUpdates, planPhotoChange, planRecalcPhotos } from '@/lib/health/foodEntryEdit'
import {
  MAX_PHOTO_BYTES, downloadPhotosBase64, isOwnPhotoPath, photoPath, removePhotos, sanitizePhoto, uploadPhoto,
} from '@/lib/health/healthPhotos'
import {
  dbErrorResponse,
  itemToRow,
  refreshRuleEvents,
  rememberFoods,
  requireEnrolment,
  requireHealthUser,
} from '@/lib/health/healthServer'

/**
 * One saved food entry (specs/029 US3, P3.1):
 *  - PATCH  edit items / slot / time and (P3.1) description, eating-out flag, no-added-fat toggle, photo list
 *  - POST   re-calculate (P3.1): re-run the full estimation pipeline on edited inputs and return the new items for
 *           review — nothing is saved until the client PATCHes them (Cancel keeps the old version)
 *  - DELETE the entry (photos are deleted with it)
 */

export const maxDuration = 60

const ParamsSchema = z.object({ id: z.string().uuid() })

async function loadOwnEntry(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, id: string) {
  return supabase
    .from('health_food_entries')
    .select('id, local_date, local_time, photo_paths, ai_usage')
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
  const existingPhotos = Array.isArray(entry.photo_paths) ? (entry.photo_paths as string[]) : []
  const photos = planPhotoChange(existingPhotos, patch.photoPaths, path => existingPhotos.includes(path) || isOwnPhotoPath(path, user.id))
  if (!photos.ok) return NextResponse.json({ error: photos.error }, { status: 400 })
  const aiUsage = entry.ai_usage && typeof entry.ai_usage === 'object' ? (entry.ai_usage as Record<string, unknown>) : null
  const update = entryColumnUpdates(patch, { photoPaths: existingPhotos, aiUsage }, new Date().toISOString(), photos.photoPaths)
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

  // Photos removed in the edit go only after the entry no longer references them.
  await removePhotos(photos.removed.filter(path => path.startsWith(`${user.id}/`)))
  await refreshRuleEvents(supabase, user.id, enrolment, date)
  return NextResponse.json({ saved: true })
}

const RecalcSchema = z.object({
  text: z.string().trim().max(1000).optional().transform(v => (v ? v : null)),
  slot: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional().transform(v => v ?? null),
  restaurant: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  noAddedFat: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  keepPhotos: z.string().max(2000).optional().transform((v, ctx) => {
    if (!v) return [] as string[]
    try {
      const arr: unknown = JSON.parse(v)
      if (Array.isArray(arr) && arr.length <= MAX_PHOTOS && arr.every(p => typeof p === 'string')) return arr as string[]
    } catch { /* fall through */ }
    ctx.addIssue({ code: 'custom', message: 'Invalid photo list' })
    return z.NEVER
  }),
})

/** Re-calculate a saved entry from edited text / photos / toggles. Returns items for review; saves nothing. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  const p = ParamsSchema.safeParse(await params)
  if (!p.success) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })

  let form: FormData
  try { form = await request.formData() }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }
  const fields = RecalcSchema.safeParse({
    text: form.get('text') ?? undefined,
    slot: form.get('slot') || undefined,
    restaurant: form.get('restaurant') ?? undefined,
    noAddedFat: form.get('noAddedFat') ?? undefined,
    keepPhotos: form.get('keepPhotos') ?? undefined,
  })
  if (!fields.success) return NextResponse.json({ error: fields.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const { text, slot, restaurant, noAddedFat, keepPhotos } = fields.data

  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.some(f => f.size > MAX_PHOTO_BYTES)) return NextResponse.json({ error: 'Each photo must be under 8 MB' }, { status: 400 })

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol

  const { data: entry, error } = await loadOwnEntry(supabase, user.id, p.data.id)
  if (error) return dbErrorResponse(error)
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (slot && !enrolment.def.mealSlots.some(s => s.key === slot)) return NextResponse.json({ error: 'Unknown meal slot' }, { status: 400 })

  const existing = Array.isArray(entry.photo_paths) ? (entry.photo_paths as string[]) : []
  const plan = planRecalcPhotos(existing, keepPhotos, files.length)
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 })
  if (!text && plan.keep.length === 0 && files.length === 0) return NextResponse.json({ error: 'Describe the food or add a photo' }, { status: 400 })

  // Same key rule as the original estimate — and checked before anything is uploaded.
  if (plan.keep.length + files.length > 0) {
    const key = await resolveAiKeyForUser(user.id).catch(() => null)
    if (!key || !key.ok) return NextResponse.json({ error: NO_KEY_MESSAGE, needsAiKey: true }, { status: 400 })
  }

  const date = String(entry.local_date)
  const images = await downloadPhotosBase64(plan.keep, user.id)
  const newPaths: string[] = []
  for (const file of files) {
    let jpeg: Uint8Array
    try {
      jpeg = await sanitizePhoto(new Uint8Array(await file.arrayBuffer()))
    } catch {
      return NextResponse.json({ error: 'Could not read one of the photos — use JPEG, PNG or WebP' }, { status: 400 })
    }
    const path = photoPath(user.id, date)
    const uploaded = await uploadPhoto(path, jpeg)
    if (!uploaded.ok) return NextResponse.json({ error: uploaded.reason }, { status: 503 })
    newPaths.push(path)
    images.push(Buffer.from(jpeg).toString('base64'))
  }

  const outcome = await runFoodEstimate({ supabase, userId: user.id, enrolment, date, text, slot, restaurant, noAddedFat, images })
  const photoPaths = [...plan.keep, ...newPaths]
  if (!outcome.ok) {
    await removePhotos(newPaths)
    return NextResponse.json({ error: outcome.error, needsAiKey: outcome.needsAiKey }, { status: outcome.status })
  }
  return NextResponse.json({ items: outcome.items, photoPaths, source: outcome.source, costUsd: outcome.costUsd, tips: outcome.tips })
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
