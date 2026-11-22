import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dbErrorResponse, ensureDailyLog, nowFor, requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { isValidDate, addDays } from '@/lib/health/time'
import { displayName, findExercise, trainingPosition, validateWorkoutAgainstProgramme, WorkoutInputSchema } from '@/lib/health/training'
import { loadTrainingContext, trainingDbError, TRAINING_MIGRATION_MESSAGE } from '@/lib/health/trainingServer'

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

  const session = def.trainingSessions.find(s => s.key === input.sessionKey)!
  const position = trainingPosition(def, enrolment.startDate, input.date)
  const excluded = def.movementRestrictions?.excluded ?? []

  const log = await ensureDailyLog(supabase, user.id, input.date)
  if ('error' in log) return dbErrorResponse(log.error)

  const now = new Date().toISOString()
  const { data: workout, error } = await supabase
    .from('health_workouts')
    .upsert({
      user_id:           user.id,
      daily_log_id:      log.id,
      enrolment_id:      enrolment.id,
      local_date:        input.date,
      session_key:       input.sessionKey,
      block_key:         position.block?.key ?? null,
      programme_week:    position.phase === 'active' ? position.week : null,
      status:            input.status,
      skip_reason:       input.status === 'skipped' ? input.skipReason ?? null : null,
      travel_mode:       input.travelMode,
      duration_minutes:  input.durationMinutes ?? null,
      notes:             input.notes ?? null,
      skipped_exercises: input.status === 'skipped' ? [] : input.skippedExercises,
      updated_at:        now,
    }, { onConflict: 'user_id,local_date,session_key' })
    .select('id')
    .single()
  if (error || !workout) return trainingDbError(error)
  const workoutId = workout.id as string

  // Replace the sets.
  const del = await supabase.from('health_workout_sets').delete().eq('workout_id', workoutId).eq('user_id', user.id)
  if (del.error) return trainingDbError(del.error)
  if (input.status !== 'skipped') {
    const rows = input.exercises.flatMap(e => {
      const ex = findExercise(def, input.sessionKey, e.exerciseKey)
      const shown = ex ? displayName(ex, input.travelMode, excluded) : null
      const substitution = ex && shown !== ex.name ? shown : null
      return e.sets
        .filter(s => s.reps !== null || s.holdSeconds !== null || s.loadKg !== null)
        .map(s => ({
          workout_id: workoutId,
          user_id: user.id,
          exercise_key: e.exerciseKey,
          set_index: s.setIndex,
          load_kg: s.loadKg,
          reps: s.reps,
          hold_seconds: s.holdSeconds,
          rir: s.toFailure ? null : s.rir,
          to_failure: s.toFailure,
          is_drop_set: s.isDropSet,
          substitution_name: substitution,
        }))
    })
    if (rows.length > 0) {
      const ins = await supabase.from('health_workout_sets').insert(rows)
      if (ins.error) return trainingDbError(ins.error)
    }
  }

  // Joint check for pain-check sessions (keeps any next-morning answer already given).
  if (session.painCheck && def.painRules) {
    if (input.status === 'skipped') {
      await supabase.from('health_joint_checks').delete().eq('workout_id', workoutId).eq('user_id', user.id)
    } else {
      const jc = await supabase.from('health_joint_checks').upsert({
        user_id: user.id,
        workout_id: workoutId,
        local_date: input.date,
        session_key: input.sessionKey,
        during_pain: input.duringPain ?? null,
        updated_at: now,
      }, { onConflict: 'workout_id' })
      if (jc.error) return trainingDbError(jc.error)
    }
  }

  return NextResponse.json({ saved: true, id: workoutId })
}
