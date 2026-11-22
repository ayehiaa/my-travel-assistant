import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { HEALTH_CONSENT_VERSION } from '@/lib/health/healthHub'
import { dbErrorResponse, requireHealthUser } from '@/lib/health/healthServer'

/** Record explicit consent to process health data (specs/029 §8, UK GDPR special-category data). */

const BodySchema = z.object({
  agree:          z.literal(true),
  consentVersion: z.literal(HEALTH_CONSENT_VERSION),
}).strict()

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Please tick the consent box' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('health_consents').insert({
    user_id: user.id,
    consent_version: parsed.data.consentVersion,
    scope: 'health_data',
  })
  if (error) return dbErrorResponse(error)

  try {
    await logAudit({
      performedBy:   user.id,
      action:        'health_consent_given',
      tripId:        null,
      changedFields: { consent_version: { before: null, after: parsed.data.consentVersion } },
    })
  } catch {
    // best effort (audit CHECK may predate the health migration)
  }

  return NextResponse.json({ consented: true }, { status: 201 })
}
