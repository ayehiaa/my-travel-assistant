import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireHealthUser } from '@/lib/health/healthServer'
import { collectHealthData } from '@/lib/health/dataRightsServer'
import { exportFileName } from '@/lib/health/dataRights'
import { auditHealth } from '@/lib/health/p3Server'

/**
 * "Export my health data" (spec §2 / §8): one JSON file with every health row the user owns and 24-hour signed links
 * to their photos (food + progress). Audited without content.
 */

export const maxDuration = 60

export async function GET() {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const supabase = await createClient()
  const result = await collectHealthData(supabase, auth.user.id)
  if (!result.ok) return NextResponse.json({ error: 'Could not export your data — try again' }, { status: 500 })

  await auditHealth(auth.user.id, 'health_data_exported', { export: { before: null, after: 'full data (JSON)' } })
  return new NextResponse(JSON.stringify(result.doc, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(result.doc.exportedAt.slice(0, 10))}"`,
      'Cache-Control': 'no-store',
    },
  })
}
