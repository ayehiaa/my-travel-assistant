import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { HhMmSchema } from '@/lib/health/programmeSchema'
import { isValidDate } from '@/lib/health/time'
import { MAX_PHOTOS } from '@/lib/health/foodEstimate'
import { NO_KEY_MESSAGE, runFoodEstimate } from '@/lib/health/foodEstimateServer'
import { resolveAiKeyForUser } from '@/lib/aiKeyStore'
import { MAX_PHOTO_BYTES, photoPath, sanitizePhoto, uploadPhoto } from '@/lib/health/healthPhotos'
import { nowFor, requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'

/**
 * Estimate a meal from text and/or 1–4 photos (specs/029 US3, P3.1). Nothing is saved as an entry here: the client
 * shows the editable items (with assumption chips) and saves them with POST /api/health/food. Photos are stripped
 * of metadata and stored in the private bucket now so the saved entry can reference them.
 *
 * The pipeline (library → reference data → Open Food Facts → AI) lives in runFoodEstimate, shared with the
 * re-calculate action on saved entries.
 */

export const maxDuration = 60

const FieldsSchema = z.object({
  text: z.string().trim().max(1000).optional().transform(v => (v ? v : null)),
  slot: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional().transform(v => v ?? null),
  date: z.string().refine(isValidDate, { message: 'Invalid date' }),
  time: HhMmSchema,
  restaurant: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  noAddedFat: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
})

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let form: FormData
  try { form = await request.formData() }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

  const fields = FieldsSchema.safeParse({
    text: form.get('text') ?? undefined,
    slot: form.get('slot') || undefined,
    date: form.get('date'),
    time: form.get('time'),
    restaurant: form.get('restaurant') ?? undefined,
    noAddedFat: form.get('noAddedFat') ?? undefined,
  })
  if (!fields.success) return NextResponse.json({ error: fields.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const { text, slot, date, restaurant, noAddedFat } = fields.data

  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  if (!text && files.length === 0) return NextResponse.json({ error: 'Describe the food or add a photo' }, { status: 400 })
  if (files.length > MAX_PHOTOS) return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos` }, { status: 400 })
  if (files.some(f => f.size > MAX_PHOTO_BYTES)) return NextResponse.json({ error: 'Each photo must be under 8 MB' }, { status: 400 })

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol
  if (date > nowFor(enrolment).date) return NextResponse.json({ error: 'Cannot log food for a future date' }, { status: 400 })

  // Photos always need the AI: check the key before storing anything (no orphaned uploads).
  if (files.length > 0) {
    const key = await resolveAiKeyForUser(user.id).catch(() => null)
    if (!key || !key.ok) return NextResponse.json({ error: NO_KEY_MESSAGE, needsAiKey: true }, { status: 400 })
  }

  // Photos: metadata stripped, stored privately, sent as base64 image blocks.
  const photoPaths: string[] = []
  const images: string[] = []
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
    photoPaths.push(path)
    images.push(Buffer.from(jpeg).toString('base64'))
  }

  const outcome = await runFoodEstimate({ supabase, userId: user.id, enrolment, date, text, slot, restaurant, noAddedFat, images })
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error, needsAiKey: outcome.needsAiKey, photoPaths }, { status: outcome.status })
  }
  return NextResponse.json({ items: outcome.items, photoPaths, source: outcome.source, costUsd: outcome.costUsd, tips: outcome.tips })
}
