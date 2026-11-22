import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireHealthUser } from '@/lib/health/healthServer'
import { deleteHealthData } from '@/lib/health/dataRightsServer'
import { DELETE_CONFIRMATION, DeleteRequestSchema, isDeleteConfirmed } from '@/lib/health/dataRights'
import { auditHealth } from '@/lib/health/p3Server'

/**
 * "Delete all my health data" (spec §2 / §8): typed confirmation "DELETE HEALTH DATA" → every health row and photo
 * of this user is removed (consent included — Health starts again from the consent screen). The audit entry records
 * only that it happened and the counts, never any content.
 */

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = DeleteRequestSchema.safeParse(raw)
  if (!parsed.success || !isDeleteConfirmed(parsed.data.confirm)) {
    return NextResponse.json({ error: `Type ${DELETE_CONFIRMATION} to confirm` }, { status: 400 })
  }

  const supabase = await createClient()
  const result = await deleteHealthData(supabase, auth.user.id)
  await auditHealth(auth.user.id, 'health_data_deleted', {
    deleted: { before: null, after: result.ok ? `${result.rows} rows, ${result.objects} files` : 'partial — retry needed' },
  })
  if (!result.ok) return NextResponse.json({ error: 'Some data could not be deleted — please try again', partial: true }, { status: 500 })
  return NextResponse.json({ deleted: true, rows: result.rows, files: result.objects })
}
