import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { targetsForSwitch } from '@/lib/health/programmeEdit'
import { daysBetween, isValidDate, localDate } from '@/lib/health/time'
import { P3MigrationNeeded, P3_MIGRATION_MESSAGE, auditHealth, loadProgrammeDefinition, switchEnrolment } from '@/lib/health/p3Server'

/**
 * Switch to another of the user's programmes (specs/029 US1): ends the current enrolment (kept as history) and starts
 * the chosen programme with the same profile; targets are computed fresh (no carried-over overrides / adjustments).
 */

const BodySchema = z.object({
  programmeId: z.string().uuid(),
  startDate: z.string().refine(isValidDate, { message: 'Invalid start date' }),
}).strict()

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const { programmeId, startDate } = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const current = enrol.enrolment
  if (current.programmeId === programmeId) return NextResponse.json({ error: 'That programme is already active' }, { status: 409 })
  if (!current.profile) return NextResponse.json({ error: 'Your profile could not be read — contact the admin' }, { status: 409 })

  let target
  try {
    target = await loadProgrammeDefinition(supabase, user.id, programmeId)
  } catch (err) {
    if (err instanceof P3MigrationNeeded) return NextResponse.json({ error: P3_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  if (!target) return NextResponse.json({ error: 'Programme not found' }, { status: 404 })

  const offset = daysBetween(localDate(new Date(), current.homeTimezone), startDate)
  if (offset < -7 * target.def.identity.durationWeeks || offset > 60) {
    return NextResponse.json({ error: 'Start date must be within the programme length in the past or 60 days ahead' }, { status: 400 })
  }

  const switched = await switchEnrolment(supabase, user.id, current, {
    programmeId,
    startDate,
    timezone: current.homeTimezone,
    profile: current.profile,
    targets: targetsForSwitch(target.def, current.profile),
  })
  if (!switched.ok) return NextResponse.json({ error: 'Could not switch programme — nothing was changed' }, { status: 500 })
  await auditHealth(user.id, 'health_programme_activated', {
    programme: { before: current.programmeName, after: target.def.identity.name },
    start_date: { before: current.startDate, after: startDate },
  })
  return NextResponse.json({ enrolmentId: switched.id })
}
