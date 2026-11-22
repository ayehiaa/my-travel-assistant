import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { nowFor, requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { isValidDate, addDays } from '@/lib/health/time'
import { validateWorkoutAgainstProgramme, WorkoutInputSchema } from '@/lib/health/training'
import { loadTrainingContext, TRAINING_MIGRATION_MESSAGE } from '@/lib/health/trainingServer'
import { writeWorkout } from '@/lib/health/workoutWrite'

/**
 * Save a training session (specs/029 US5/US6): done / partial with sets, or skipped with a reason. One workout per
 * user + date + session (re-saving replaces its sets). Pain-check sessions also create/update the joint check.
 * Not audited (spec §8 — like food and check-ins, workouts are personal logs, not account changes).
 */

const MAX_BACKDATE_DAYS = 60

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = WorkoutInputSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid workout' }, { status: 400 })
  const input = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol
  const { def } = enrolment

  const today = nowFor(enrolment).date
  if (!isValidDate(input.date) || input.date > today) return NextResponse.json({ error: 'Cannot log a session for a future date' }, { status: 400 })
  if (input.date < addDays(today, -MAX_BACKDATE_DAYS)) return NextResponse.json({ error: `Sessions can be logged up to ${MAX_BACKDATE_DAYS} days back` }, { status: 400 })

  const tctx = await loadTrainingContext(supabase, user.id, enrolment)
  if (tctx.status === 'migration_needed') return NextResponse.json({ error: TRAINING_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
  if (tctx.status === 'error') return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  const { ctx } = tctx

  const invalid = validateWorkoutAgainstProgramme(def, input, {
    availableUnlocks: ctx.unlocks.filter(u => u.available).map(u => u.key),
    jointStopped: ctx.joint.level === 'stop',
  })
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const written = await writeWorkout(supabase, user.id, enrolment, input)
  if (!written.ok) return written.response
  const workoutId = written.id

  return NextResponse.json({ saved: true, id: workoutId })
}
