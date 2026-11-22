import { NextResponse } from 'next/server'
import { isMissingSchemaError } from '@/lib/invitationRoles'
import { dbErrorResponse, ensureDailyLog, type ActiveEnrolment, type ServerClient } from './healthServer'
import { displayName, findExercise, trainingPosition, type WorkoutInput } from './training'
import { trainingDbError } from './trainingServer'

/**
 * Server only. Write one training session (shared by POST /api/health/workouts and the offline sync): upsert the
 * workout by user + date + session, replace its sets, and create/update the joint check of pain-check sessions
 * (keeping any next-morning answer). Callers validate the input against the programme first.
 */

export interface SetSyncMeta { clientId: string | null; writtenAt: number }

export async function writeWorkout(
  supabase: ServerClient,
  userId: string,
  enrolment: ActiveEnrolment,
  input: WorkoutInput,
  /** Offline sync: per set (exercise|index|d/w) client id + time, stored in the P3 columns when they exist. */
  syncMeta?: Map<string, SetSyncMeta>,
): Promise<{ ok: true; id: string } | { ok: false; response: NextResponse }> {
  const { def } = enrolment
  const session = def.trainingSessions.find(s => s.key === input.sessionKey)!
  const position = trainingPosition(def, enrolment.startDate, input.date)
  const excluded = def.movementRestrictions?.excluded ?? []

  const log = await ensureDailyLog(supabase, userId, input.date)
  if ('error' in log) return { ok: false, response: dbErrorResponse(log.error) }

  const now = new Date().toISOString()
  const { data: workout, error } = await supabase
    .from('health_workouts')
    .upsert({
      user_id:           userId,
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
  if (error || !workout) return { ok: false, response: trainingDbError(error) }
  const workoutId = workout.id as string

  // Replace the sets.
  const del = await supabase.from('health_workout_sets').delete().eq('workout_id', workoutId).eq('user_id', userId)
  if (del.error) return { ok: false, response: trainingDbError(del.error) }
  if (input.status !== 'skipped') {
    const rows = input.exercises.flatMap(e => {
      const ex = findExercise(def, input.sessionKey, e.exerciseKey)
      const shown = ex ? displayName(ex, input.travelMode, excluded) : null
      const substitution = ex && shown !== ex.name ? shown : null
      return e.sets
        .filter(s => s.reps !== null || s.holdSeconds !== null || s.loadKg !== null)
        .map(s => {
          const row: Record<string, unknown> = {
            workout_id: workoutId,
            user_id: userId,
            exercise_key: e.exerciseKey,
            set_index: s.setIndex,
            load_kg: s.loadKg,
            reps: s.reps,
            hold_seconds: s.holdSeconds,
            rir: s.toFailure ? null : s.rir,
            to_failure: s.toFailure,
            is_drop_set: s.isDropSet,
            substitution_name: substitution,
          }
          const meta = syncMeta?.get(`${e.exerciseKey}|${s.setIndex}|${s.isDropSet ? 'd' : 'w'}`)
          if (meta) {
            row.client_id = meta.clientId
            row.client_updated_at = new Date(meta.writtenAt).toISOString()
          }
          return row
        })
    })
    if (rows.length > 0) {
      let ins = await supabase.from('health_workout_sets').insert(rows)
      // P3 sync columns missing (migration not applied): store the sets without them.
      if (ins.error && syncMeta && isMissingSchemaError(ins.error)) {
        ins = await supabase.from('health_workout_sets').insert(rows.map(({ client_id: _c, client_updated_at: _u, ...rest }) => { void _c; void _u; return rest }))
      }
      if (ins.error) return { ok: false, response: trainingDbError(ins.error) }
    }
  }

  // Joint check for pain-check sessions (keeps any next-morning answer already given).
  if (session.painCheck && def.painRules) {
    if (input.status === 'skipped') {
      await supabase.from('health_joint_checks').delete().eq('workout_id', workoutId).eq('user_id', userId)
    } else {
      const jc = await supabase.from('health_joint_checks').upsert({
        user_id: userId,
        workout_id: workoutId,
        local_date: input.date,
        session_key: input.sessionKey,
        during_pain: input.duringPain ?? null,
        updated_at: now,
      }, { onConflict: 'workout_id' })
      if (jc.error) return { ok: false, response: trainingDbError(jc.error) }
    }
  }

  return { ok: true, id: workoutId }
}
