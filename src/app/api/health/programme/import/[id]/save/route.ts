import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { loadHealthState, migrationResponse, requireHealthUser } from '@/lib/health/healthServer'
import { assembleDraft, sectionMeta } from '@/lib/health/programmeImport'
import { targetsForSwitch } from '@/lib/health/programmeEdit'
import { ProfileSchema } from '@/lib/health/targets'
import { daysBetween, isValidDate, localDate } from '@/lib/health/time'
import {
  P3MigrationNeeded, P3_MIGRATION_MESSAGE, auditHealth, insertProgramme, loadImportDraft, p3DbError, switchEnrolment,
} from '@/lib/health/p3Server'

/**
 * Save a reviewed import as a user-owned programme (version 1 of a new lineage) and optionally enrol in it.
 * Requires every section confirmed and the whole definition valid. Enrolling ends the current enrolment (kept as
 * history, status completed) and starts the new one with the same profile; targets are computed fresh.
 */

const BodySchema = z.object({
  activate: z.boolean().default(false),
  startDate: z.string().refine(isValidDate, { message: 'Invalid start date' }).optional(),
  profile: ProfileSchema.optional(),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let raw: unknown
  try { raw = await request.json() }
  catch { raw = {} }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const body = parsed.data

  const supabase = await createClient()
  const state = await loadHealthState(supabase, user.id)
  if (state.status === 'migration_needed') return migrationResponse()
  if (state.status === 'needs_consent') return NextResponse.json({ error: 'Please give consent first' }, { status: 409 })
  if (state.status === 'error') return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  const current = state.status === 'active' ? state.enrolment : null

  let draft
  try {
    draft = await loadImportDraft(supabase, user.id, id)
  } catch (err) {
    if (err instanceof P3MigrationNeeded) return NextResponse.json({ error: P3_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (draft.status !== 'draft') return NextResponse.json({ error: 'This import is already saved or discarded' }, { status: 409 })

  const assembled = assembleDraft(draft.sections, draft.confirmed)
  if (!assembled.ok) {
    const first = assembled.unconfirmed[0]
    const error = first
      ? `Review and confirm every section first (next: ${sectionMeta(first).label})`
      : `Fix the programme first: ${assembled.errors[0]?.message ?? 'invalid'}`
    return NextResponse.json({ error, unconfirmed: assembled.unconfirmed, errors: assembled.errors }, { status: 400 })
  }
  const def = assembled.definition

  // Enrolment inputs are checked BEFORE anything is written.
  const profile = body.profile ?? current?.profile ?? null
  let startDate: string | null = null
  if (body.activate) {
    if (!profile) return NextResponse.json({ error: 'Your profile is needed to personalise targets', needsProfile: true }, { status: 400 })
    startDate = body.startDate ?? localDate(new Date(), profile.timezone)
    const offset = daysBetween(localDate(new Date(), profile.timezone), startDate)
    if (offset < -7 * def.identity.durationWeeks || offset > 60) {
      return NextResponse.json({ error: 'Start date must be within the programme length in the past or 60 days ahead' }, { status: 400 })
    }
  }

  const inserted = await insertProgramme(supabase, user.id, { def, source: 'import', versionNo: 1, changeSummary: ['Imported'] })
  if (!inserted.ok) return p3DbError(inserted.error)

  const upd = await supabase
    .from('health_programme_imports')
    .update({ status: 'saved', programme_id: inserted.id, updated_at: new Date().toISOString() })
    .eq('id', draft.id)
    .eq('user_id', user.id)
  if (upd.error) return p3DbError(upd.error)
  await auditHealth(user.id, 'health_programme_imported', { programme: { before: null, after: def.identity.name } })

  if (!body.activate || !profile || !startDate) return NextResponse.json({ programmeId: inserted.id, activated: false }, { status: 201 })

  const switched = await switchEnrolment(supabase, user.id, current, {
    programmeId: inserted.id,
    startDate,
    timezone: current?.homeTimezone ?? profile.timezone,
    profile,
    targets: targetsForSwitch(def, profile),
  })
  if (!switched.ok) return NextResponse.json({ error: 'Saved, but could not start the programme — try "Switch" from the Programme tab', programmeId: inserted.id }, { status: 500 })
  await auditHealth(user.id, 'health_programme_activated', {
    programme: { before: current?.programmeName ?? null, after: def.identity.name },
    start_date: { before: current?.startDate ?? null, after: startDate },
  })
  return NextResponse.json({ programmeId: inserted.id, enrolmentId: switched.id, activated: true }, { status: 201 })
}
