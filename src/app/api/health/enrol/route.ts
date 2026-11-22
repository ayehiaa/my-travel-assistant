import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { findTemplate } from '@/lib/health/seedProgramme'
import { ProfileSchema, TargetOverridesSchema, computeTargets } from '@/lib/health/targets'
import { daysBetween, isValidDate, localDate } from '@/lib/health/time'
import { dbErrorResponse, loadHealthState, migrationResponse, requireHealthUser } from '@/lib/health/healthServer'

/**
 * Start a programme from a template (specs/029 US1): profile → targets computed server-side (the client preview
 * uses the same pure function) → start date → active. One active enrolment per user.
 */

const BodySchema = z.object({
  templateKey: z.string().min(1).max(60),
  profile:     ProfileSchema,
  overrides:   TargetOverridesSchema.default({}),
  startDate:   z.string().refine(isValidDate, { message: 'Invalid start date' }),
}).strict()

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const { templateKey, profile, overrides, startDate } = parsed.data

  const template = findTemplate(templateKey)
  if (!template) return NextResponse.json({ error: 'Unknown programme template' }, { status: 400 })

  const today = localDate(new Date(), profile.timezone)
  const offset = daysBetween(today, startDate)
  if (offset < -7 * template.definition.identity.durationWeeks || offset > 60) {
    return NextResponse.json({ error: 'Start date must be within the programme length in the past or 60 days ahead' }, { status: 400 })
  }

  const supabase = await createClient()
  const state = await loadHealthState(supabase, user.id)
  if (state.status === 'migration_needed') return migrationResponse()
  if (state.status === 'needs_consent') return NextResponse.json({ error: 'Please give consent first' }, { status: 409 })
  if (state.status === 'active') return NextResponse.json({ error: 'A programme is already active' }, { status: 409 })

  const { targets } = computeTargets(template.definition, profile, overrides)

  const { data: programme, error: progError } = await supabase
    .from('health_programmes')
    .insert({
      user_id:      user.id,
      template_key: template.key,
      name:         template.definition.identity.name,
      version:      template.definition.identity.version,
      definition:   template.definition,
    })
    .select('id')
    .single()
  if (progError || !programme) return dbErrorResponse(progError)

  const { data: enrolment, error: enrolError } = await supabase
    .from('health_enrolments')
    .insert({
      user_id:           user.id,
      programme_id:      programme.id,
      start_date:        startDate,
      timezone:          profile.timezone,
      profile,
      overrides,
      effective_targets: targets,
      status:            'active',
    })
    .select('id')
    .single()
  if (enrolError || !enrolment) {
    // Unique violation = a concurrent activation won; clean up the orphan programme copy.
    await supabase.from('health_programmes').delete().eq('id', programme.id)
    if (enrolError?.code === '23505') return NextResponse.json({ error: 'A programme is already active' }, { status: 409 })
    return dbErrorResponse(enrolError)
  }

  try {
    // No profile or health values in the audit log — only what was activated and when.
    await logAudit({
      performedBy:   user.id,
      action:        'health_programme_activated',
      tripId:        null,
      changedFields: {
        programme:  { before: null, after: template.definition.identity.name },
        start_date: { before: null, after: startDate },
      },
    })
  } catch {
    // best effort
  }

  return NextResponse.json({ enrolmentId: enrolment.id, targets }, { status: 201 })
}
