import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMissingSchemaError } from '@/lib/invitationRoles'
import { nowFor, requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { addDays } from '@/lib/health/time'
import { validateWorkoutAgainstProgramme, WorkoutInputSchema } from '@/lib/health/training'
import { loadTrainingContext, TRAINING_MIGRATION_MESSAGE } from '@/lib/health/trainingServer'
import { SyncInputSchema, applySetOps, groupQueue, setsToExercises, type StoredSet } from '@/lib/health/offlineQueue'
import { writeWorkout, type SetSyncMeta } from '@/lib/health/workoutWrite'

/**
 * Offline set sync (specs/029 §9, phase P3). The session player queues set changes (and a finish) while offline and
 * posts them here when back online. Per date + session: stored sets are merged with the queued ops — LAST WRITE WINS
 * PER SET INDEX (an op replaces a stored set only if it is not older); a queued finish applies unless the session was
 * saved after it. Replays are idempotent (client ids). Response `acked` = client ids the device can drop (applied,
 * superseded or permanently rejected); groups that failed for a temporary reason are not acked and retry later.
 */

const MAX_BACKDATE_DAYS = 60
const MAX_GROUPS = 20

type GroupResult = { date: string; sessionKey: string; status: 'saved' | 'rejected' | 'failed'; error?: string; applied?: number; superseded?: number }

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = SyncInputSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid sync request' }, { status: 400 })

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol
  const tctx = await loadTrainingContext(supabase, user.id, enrolment)
  if (tctx.status === 'migration_needed') return NextResponse.json({ error: TRAINING_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
  if (tctx.status === 'error') return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  const { ctx } = tctx

  const today = nowFor(enrolment).date
  const nowMs = Date.now()
  const acked: string[] = []
  const results: GroupResult[] = []

  for (const g of groupQueue(parsed.data.ops).slice(0, MAX_GROUPS)) {
    const reject = (error: string) => { acked.push(...g.clientIds); results.push({ date: g.date, sessionKey: g.sessionKey, status: 'rejected', error }) }
    if (g.date > today) { reject('Future date'); continue }
    if (g.date < addDays(today, -MAX_BACKDATE_DAYS)) { reject(`Older than ${MAX_BACKDATE_DAYS} days`); continue }

    // Stored workout + sets (+ the per-set sync columns when the P3 migration is applied).
    const w = await supabase
      .from('health_workouts')
      .select('id, status, skip_reason, travel_mode, duration_minutes, notes, skipped_exercises, updated_at')
      .eq('user_id', user.id).eq('local_date', g.date).eq('session_key', g.sessionKey)
      .maybeSingle()
    if (w.error) { results.push({ date: g.date, sessionKey: g.sessionKey, status: 'failed' }); continue }
    const workoutAt = w.data ? Date.parse(String(w.data.updated_at)) : 0
    let stored: StoredSet[] = []
    let duringPain: number | null = null
    if (w.data) {
      let s = await supabase.from('health_workout_sets')
        .select('exercise_key, set_index, load_kg, reps, hold_seconds, rir, to_failure, is_drop_set, client_id, client_updated_at')
        .eq('workout_id', w.data.id).eq('user_id', user.id)
      if (s.error && isMissingSchemaError(s.error)) {
        s = await supabase.from('health_workout_sets')
          .select('exercise_key, set_index, load_kg, reps, hold_seconds, rir, to_failure, is_drop_set')
          .eq('workout_id', w.data.id).eq('user_id', user.id) as typeof s
      }
      if (s.error) { results.push({ date: g.date, sessionKey: g.sessionKey, status: 'failed' }); continue }
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
      stored = (s.data ?? []).map(r => {
        const row = r as Record<string, unknown>
        return {
          exerciseKey: String(row.exercise_key),
          setIndex: Number(row.set_index),
          loadKg: num(row.load_kg),
          reps: num(row.reps),
          holdSeconds: num(row.hold_seconds),
          rir: num(row.rir),
          toFailure: row.to_failure === true,
          isDropSet: row.is_drop_set === true,
          clientId: (row.client_id as string | null | undefined) ?? null,
          writtenAt: row.client_updated_at ? Date.parse(String(row.client_updated_at)) : workoutAt,
        }
      })
      const jc = await supabase.from('health_joint_checks').select('during_pain').eq('workout_id', w.data.id).eq('user_id', user.id).maybeSingle()
      duringPain = jc.data?.during_pain === null || jc.data?.during_pain === undefined ? null : Number(jc.data.during_pain)
    }

    const merged = applySetOps(stored, g.sets, nowMs)
    const finish = g.finish && (!w.data || Math.min(g.finish.at, nowMs) >= workoutAt) ? g.finish : null
    const exercises = setsToExercises(merged.sets)
    const hasSets = exercises.some(e => e.sets.length > 0)
    let status = finish?.status ?? (w.data?.status as 'done' | 'partial' | 'skipped' | undefined) ?? 'partial'
    if (status === 'done' && !hasSets) status = 'partial'
    if (status === 'skipped' && hasSets && !finish) status = 'partial'

    const input = WorkoutInputSchema.safeParse({
      date: g.date,
      sessionKey: g.sessionKey,
      status,
      skipReason: status === 'skipped' ? (finish?.skipReason ?? (w.data?.skip_reason as string | null) ?? 'Skipped') : null,
      travelMode: finish ? finish.travelMode : w.data?.travel_mode === true,
      durationMinutes: finish ? finish.durationMinutes ?? null : (w.data?.duration_minutes as number | null) ?? null,
      notes: finish ? finish.notes ?? null : (w.data?.notes as string | null) ?? null,
      exercises: status === 'skipped' ? [] : exercises,
      skippedExercises: finish ? finish.skippedExercises : Array.isArray(w.data?.skipped_exercises) ? w.data.skipped_exercises : [],
      duringPain: finish ? finish.duringPain ?? null : duringPain,
    })
    if (!input.success) { reject(input.error.issues[0]?.message ?? 'Invalid session'); continue }
    const invalid = validateWorkoutAgainstProgramme(enrolment.def, input.data, {
      availableUnlocks: ctx.unlocks.filter(u => u.available).map(u => u.key),
      jointStopped: ctx.joint.level === 'stop',
    })
    if (invalid) { reject(invalid); continue }

    const meta = new Map<string, SetSyncMeta>(merged.sets.map(s => [`${s.exerciseKey}|${s.setIndex}|${s.isDropSet ? 'd' : 'w'}`, { clientId: s.clientId, writtenAt: s.writtenAt || nowMs }]))
    const written = await writeWorkout(supabase, user.id, enrolment, input.data, meta)
    if (!written.ok) { results.push({ date: g.date, sessionKey: g.sessionKey, status: 'failed' }); continue }
    acked.push(...g.clientIds)
    results.push({ date: g.date, sessionKey: g.sessionKey, status: 'saved', applied: merged.applied.length, superseded: merged.superseded.length })
  }

  return NextResponse.json({ acked, results })
}
