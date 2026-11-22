import { NextResponse } from 'next/server'
import { isMissingSchemaError } from '@/lib/invitationRoles'
import type { ActiveEnrolment, ServerClient } from './healthServer'
import { nowFor } from './healthServer'
import { addDays, weekStart } from './time'
import {
  effectivePrescription, findExercise, recommendSession, trainingPosition, unlockStatuses,
  type ExercisePerformance, type LoggedSet, type SessionRecommendation, type TrainingPosition, type UnlockStatus,
  type WorkoutStatus, type WorkoutSummary,
} from './training'
import { jointStatus, painRulePassed, rowToJointCheck, type JointCheck, type JointStatus } from './painRules'

/**
 * Server-only loaders for training (specs/029 phase P1b). Session client → owner-only RLS applies. Every loader
 * tolerates the P1b migration not being applied ('migration_needed', never a crash).
 */

export const TRAINING_MIGRATION_MESSAGE = 'Training needs a database update — apply supabase/apply_health_p1b.sql'

export class TrainingMigrationNeeded extends Error {
  constructor() { super(TRAINING_MIGRATION_MESSAGE) }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function fail(error: { code?: string; message?: string }): never {
  if (isMissingSchemaError(error)) throw new TrainingMigrationNeeded()
  throw new Error('Could not load training data')
}

export interface StoredWorkout extends WorkoutSummary {
  id: string
  programmeWeek: number | null
  blockKey: string | null
  skipReason: string | null
  travelMode: boolean
  durationMinutes: number | null
  notes: string | null
}

function rowToWorkout(r: Record<string, unknown>): StoredWorkout {
  return {
    id: String(r.id),
    date: String(r.local_date),
    sessionKey: String(r.session_key),
    status: r.status as WorkoutStatus,
    programmeWeek: num(r.programme_week),
    blockKey: (r.block_key as string | null) ?? null,
    skipReason: (r.skip_reason as string | null) ?? null,
    travelMode: r.travel_mode === true,
    durationMinutes: num(r.duration_minutes),
    notes: (r.notes as string | null) ?? null,
  }
}

export async function loadWorkouts(supabase: ServerClient, userId: string, from: string, to: string): Promise<StoredWorkout[]> {
  const { data, error } = await supabase
    .from('health_workouts')
    .select('id, local_date, session_key, status, programme_week, block_key, skip_reason, travel_mode, duration_minutes, notes')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: true })
  if (error) fail(error)
  return (data ?? []).map(r => rowToWorkout(r as Record<string, unknown>))
}

/** Recent joint checks (newest 20) plus any uncleared red flag regardless of age. */
export async function loadJointChecks(supabase: ServerClient, userId: string): Promise<JointCheck[]> {
  const cols = 'id, workout_id, local_date, session_key, during_pain, next_morning_pain, swelling, red_flags, physio_cleared, cleared_on'
  const [recent, flags] = await Promise.all([
    supabase.from('health_joint_checks').select(cols).eq('user_id', userId).order('local_date', { ascending: false }).limit(20),
    supabase.from('health_joint_checks').select(cols).eq('user_id', userId).eq('physio_cleared', false).neq('red_flags', '{}').limit(20),
  ])
  if (recent.error) fail(recent.error)
  if (flags.error) fail(flags.error)
  const byId = new Map<string, JointCheck>()
  for (const r of [...(recent.data ?? []), ...(flags.data ?? [])]) {
    const c = rowToJointCheck(r as Record<string, unknown>)
    byId.set(c.id as string, c)
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export async function loadApprovals(supabase: ServerClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('health_professional_approvals').select('unlock_key').eq('user_id', userId)
  if (error) fail(error)
  return (data ?? []).map(r => String(r.unlock_key))
}

export interface HistoryEntry extends ExercisePerformance {
  workoutId: string
  week: number | null
  status: WorkoutStatus
  substitution: string | null
}

/** Past performances per exercise key (oldest → newest), from done / partial workouts. */
export async function loadExerciseHistory(
  supabase: ServerClient,
  userId: string,
  exerciseKeys: readonly string[],
  opts: { before?: string; limitRows?: number } = {},
): Promise<Record<string, HistoryEntry[]>> {
  if (exerciseKeys.length === 0) return {}
  let q = supabase
    .from('health_workout_sets')
    .select('workout_id, exercise_key, set_index, load_kg, reps, hold_seconds, rir, to_failure, is_drop_set, substitution_name, health_workouts!inner(local_date, status, programme_week)')
    .eq('user_id', userId)
    .in('exercise_key', [...exerciseKeys])
    .order('created_at', { ascending: false })
    .limit(opts.limitRows ?? 1500)
  if (opts.before) q = q.lt('health_workouts.local_date', opts.before)
  const { data, error } = await q
  if (error) fail(error)
  const grouped = new Map<string, HistoryEntry>()
  for (const raw of data ?? []) {
    const r = raw as Record<string, unknown>
    const w = (Array.isArray(r.health_workouts) ? r.health_workouts[0] : r.health_workouts) as Record<string, unknown> | null
    if (!w || w.status === 'skipped') continue
    const key = `${r.exercise_key}|${r.workout_id}`
    let entry = grouped.get(key)
    if (!entry) {
      entry = {
        workoutId: String(r.workout_id),
        date: String(w.local_date),
        week: num(w.programme_week),
        status: w.status as WorkoutStatus,
        substitution: (r.substitution_name as string | null) ?? null,
        sets: [],
      }
      grouped.set(key, entry)
    }
    const set: LoggedSet = {
      setIndex: num(r.set_index) ?? 0,
      loadKg: num(r.load_kg),
      reps: num(r.reps),
      holdSeconds: num(r.hold_seconds),
      rir: num(r.rir),
      toFailure: r.to_failure === true,
      isDropSet: r.is_drop_set === true,
    }
    entry.sets.push(set)
  }
  const out: Record<string, HistoryEntry[]> = {}
  for (const [key, entry] of grouped) {
    const exKey = key.split('|')[0]
    entry.sets.sort((a, b) => a.setIndex - b.setIndex || Number(a.isDropSet) - Number(b.isDropSet))
    ;(out[exKey] ??= []).push(entry)
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.date.localeCompare(b.date))
  return out
}

// ── Training context (shared by the Training tab, Today and the API) ──────────

export interface TrainingContext {
  today: string
  now: string
  position: TrainingPosition
  weekWorkouts: StoredWorkout[]
  recommendation: SessionRecommendation
  checks: JointCheck[]
  joint: JointStatus
  painPassed: boolean
  approvals: string[]
  unlocks: UnlockStatus[]
}

export type TrainingContextResult = { status: 'ok'; ctx: TrainingContext } | { status: 'migration_needed' } | { status: 'error' }

export async function loadTrainingContext(supabase: ServerClient, userId: string, enrolment: ActiveEnrolment): Promise<TrainingContextResult> {
  const { date: today, time: now } = nowFor(enrolment)
  const def = enrolment.def
  try {
    const monday = weekStart(today)
    const [weekWorkouts, checks, approvals] = await Promise.all([
      loadWorkouts(supabase, userId, addDays(monday, -1), addDays(monday, 6)),
      loadJointChecks(supabase, userId),
      loadApprovals(supabase, userId),
    ])
    const position = trainingPosition(def, enrolment.startDate, today)
    const joint = jointStatus(def.painRules, checks)
    const painPassed = painRulePassed(def.painRules, checks)
    const unlocks = unlockStatuses(def, { blockIndex: position.blockIndex, painRulePassed: painPassed, approvals, jointStopped: joint.level === 'stop' })
    return {
      status: 'ok',
      ctx: {
        today, now, position, weekWorkouts, checks, joint, painPassed, approvals, unlocks,
        recommendation: recommendSession(def, today, weekWorkouts),
      },
    }
  } catch (err) {
    return err instanceof TrainingMigrationNeeded ? { status: 'migration_needed' } : { status: 'error' }
  }
}

/** Prescription lookup for a stored performance (uses the week it was done in). */
export function prescriptionFor(enrolment: ActiveEnrolment, sessionKey: string, exerciseKey: string, week: number | null) {
  const def = enrolment.def
  const session = def.trainingSessions.find(s => s.key === sessionKey)
  const ex = findExercise(def, sessionKey, exerciseKey)
  if (!session || !ex) return null
  if (!session.exercises.some(e => e.key === exerciseKey)) {
    // Unlocked movements keep their own fixed prescription.
    return effectivePrescription(def, session, ex, null)
  }
  return effectivePrescription(def, session, ex, week)
}

/** API error for a training write: missing P1b tables → 503 with the P1b script name; anything else → 500. */
export function trainingDbError(error: { code?: string; message?: string } | null): NextResponse {
  return isMissingSchemaError(error)
    ? NextResponse.json({ error: TRAINING_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
    : NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
