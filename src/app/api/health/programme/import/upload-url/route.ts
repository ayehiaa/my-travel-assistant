import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireHealthUser } from '@/lib/health/healthServer'
import { HEALTH_PHOTO_BUCKET } from '@/lib/health/healthPhotos'
import { importPath } from '@/lib/health/programmeImport'

/**
 * A one-time signed upload URL for a programme PDF (private bucket, path imports/<uid>/<uuid>.pdf). The browser uploads
 * the file directly (no serverless body limit); POST /api/health/programme/import reads it once and deletes it.
 */
export async function POST() {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const path = importPath(auth.user.id, randomUUID())
  const { data, error } = await createAdminClient().storage.from(HEALTH_PHOTO_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    const missing = /bucket not found|not found/i.test(error?.message ?? '')
    return NextResponse.json({ error: missing ? 'The health-photos storage bucket is missing — apply supabase/apply_health_p1a.sql' : 'Could not prepare the upload' }, { status: 503 })
  }
  return NextResponse.json({ path: data.path, token: data.token })
}
