import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { nowFor, requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { MAX_PHOTO_BYTES, removePhotos, sanitizePhoto, uploadPhoto } from '@/lib/health/healthPhotos'
import { p2DbError } from '@/lib/health/p2Server'
import { isValidDate } from '@/lib/health/time'

/**
 * Private progress photos (specs/029 US9). Metadata stripped, private bucket `health-photos` under
 * `progress/<user>/<date>/<uuid>.jpg`, signed URLs only. Not touched by the 30-day food-photo cleanup.
 */

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }
  const date = String(form.get('date') ?? '')
  if (!isValidDate(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  const file = form.get('photo')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Add a photo' }, { status: 400 })
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'The photo must be under 8 MB' }, { status: 400 })

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  if (date > nowFor(enrol.enrolment).date) return NextResponse.json({ error: 'Cannot add a future date' }, { status: 400 })

  let jpeg: Uint8Array
  try { jpeg = await sanitizePhoto(new Uint8Array(await file.arrayBuffer())) }
  catch { return NextResponse.json({ error: 'Could not read the photo — use JPEG, PNG or WebP' }, { status: 400 }) }

  const path = `progress/${user.id}/${date}/${randomUUID()}.jpg`
  const uploaded = await uploadPhoto(path, jpeg)
  if (!uploaded.ok) return NextResponse.json({ error: uploaded.reason }, { status: 503 })
  const { error } = await supabase.from('health_progress_photos').insert({ user_id: user.id, local_date: date, path })
  if (error) {
    await removePhotos([path])
    return p2DbError(error)
  }
  return NextResponse.json({ saved: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const supabase = await createClient()
  const { data, error } = await supabase.from('health_progress_photos').delete().eq('id', id).eq('user_id', auth.user.id).select('path')
  if (error) return p2DbError(error)
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const paths = data.map(r => String(r.path)).filter(p => p.startsWith(`progress/${auth.user.id}/`))
  await removePhotos(paths)
  return NextResponse.json({ deleted: true })
}
