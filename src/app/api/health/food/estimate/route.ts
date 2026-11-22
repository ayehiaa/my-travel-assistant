import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/aiCall'
import { resolveAiKeyForUser } from '@/lib/aiKeyStore'
import { AI_KEY_REJECTED_MESSAGE } from '@/lib/aiKeyResolver'
import { checkStopReason } from '@/lib/aiResponse'
import { HhMmSchema } from '@/lib/health/programmeSchema'
import { isValidDate } from '@/lib/health/time'
import { itemsFromLibraryText } from '@/lib/health/foodLibrary'
import {
  FOOD_ESTIMATE_SYSTEM,
  MAX_PHOTOS,
  applyLibrary,
  buildFoodEstimatePrompt,
  componentKeys,
  parseFoodEstimate,
  toFoodItem,
  type EstimatedItem,
} from '@/lib/health/foodEstimate'
import { applyOffProduct, pickOffMatch } from '@/lib/health/openFoodFacts'
import { searchOpenFoodFacts } from '@/lib/health/openFoodFactsClient'
import { MAX_PHOTO_BYTES, photoPath, sanitizePhoto, uploadPhoto } from '@/lib/health/healthPhotos'
import { loadLibrary, nowFor, requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'

/**
 * Estimate a meal from text and/or 1–4 photos (specs/029 US3). Nothing is saved as an entry here: the client shows
 * the editable items and saves them with POST /api/health/food. Photos are stripped of metadata and stored in the
 * private bucket now so the saved entry can reference them.
 *
 * Order: personal library (no AI when every part of the text matches) → Claude with the user's own key →
 * library overrides → Open Food Facts for branded packaged products.
 */

export const maxDuration = 60

const NO_KEY_MESSAGE = 'Add your Anthropic API key in Health → Programme to estimate food with AI'

const FieldsSchema = z.object({
  text: z.string().trim().max(1000).optional().transform(v => (v ? v : null)),
  slot: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional().transform(v => v ?? null),
  date: z.string().refine(isValidDate, { message: 'Invalid date' }),
  time: HhMmSchema,
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
  })
  if (!fields.success) return NextResponse.json({ error: fields.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const { text, slot, date } = fields.data

  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  if (!text && files.length === 0) return NextResponse.json({ error: 'Describe the food or add a photo' }, { status: 400 })
  if (files.length > MAX_PHOTOS) return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos` }, { status: 400 })
  if (files.some(f => f.size > MAX_PHOTO_BYTES)) return NextResponse.json({ error: 'Each photo must be under 8 MB' }, { status: 400 })

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol
  if (date > nowFor(enrolment).date) return NextResponse.json({ error: 'Cannot log food for a future date' }, { status: 400 })

  const library = await loadLibrary(supabase, user.id)

  // 1. Text only and every part is a personal food → no AI call (free, instant).
  if (text && files.length === 0) {
    const fromLibrary = itemsFromLibraryText(text, library)
    if (fromLibrary) return NextResponse.json({ items: fromLibrary, photoPaths: [], source: 'library', costUsd: 0 })
  }

  // 2. Claude with the user's own key (owner emails may use the app key — spec 026).
  const key = await resolveAiKeyForUser(user.id).catch(() => null)
  if (!key || !key.ok) return NextResponse.json({ error: NO_KEY_MESSAGE, needsAiKey: true }, { status: 400 })

  // 3. Photos: metadata stripped, stored privately, sent as base64 image blocks.
  const photoPaths: string[] = []
  const images: Array<{ mediaType: 'image/jpeg'; data: string }> = []
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
    images.push({ mediaType: 'image/jpeg', data: Buffer.from(jpeg).toString('base64') })
  }

  const slotName = enrolment.def.mealSlots.find(s => s.key === slot)?.name ?? null
  let result: Awaited<ReturnType<typeof callClaude>>
  try {
    result = await callClaude({
      role: 'health_food',
      name: 'health_food',
      system: FOOD_ESTIMATE_SYSTEM,
      user: buildFoodEstimatePrompt({ text, photoCount: images.length, slotName, def: enrolment.def, library }),
      images,
      apiKey: key.apiKey,
    })
  } catch (err) {
    const rejected = err instanceof Error && err.message === AI_KEY_REJECTED_MESSAGE
    return NextResponse.json(
      { error: rejected ? AI_KEY_REJECTED_MESSAGE : 'The AI estimate failed — try again or add the items by hand', photoPaths },
      { status: 502 },
    )
  }

  const stop = checkStopReason(result.stopReason)
  const parsed = stop.ok ? parseFoodEstimate(result.text, componentKeys(enrolment.def)) : null
  if (!parsed || parsed.length === 0) {
    return NextResponse.json(
      { error: 'Could not recognise any food — add more detail or enter the items by hand', photoPaths },
      { status: 422 },
    )
  }

  // 4. Library overrides, then Open Food Facts for up to 3 branded products (in parallel, 4 s timeout each).
  let items: EstimatedItem[] = applyLibrary(parsed, library)
  const packaged = items.map((item, i) => ({ item, i })).filter(x => x.item.packaged && x.item.source === 'ai').slice(0, 3)
  if (packaged.length > 0) {
    const matches = await Promise.all(packaged.map(async ({ item }) => {
      const hint = item.packaged!
      const products = await searchOpenFoodFacts(`${hint.brand} ${hint.product}`.trim())
      return pickOffMatch(products, hint)
    }))
    items = items.map((item, i) => {
      const k = packaged.findIndex(p => p.i === i)
      const product = k >= 0 ? matches[k] : null
      return product ? applyOffProduct(item, product) : item
    })
  }

  return NextResponse.json({
    items: items.map(toFoodItem),
    photoPaths,
    source: 'ai',
    costUsd: result.usage.cost_usd,
  })
}
