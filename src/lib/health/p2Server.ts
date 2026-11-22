import { NextResponse } from 'next/server'
import { isMissingSchemaError } from '@/lib/invitationRoles'
import type { ActiveEnrolment, ServerClient } from './healthServer'
import { readHealthSettings, type HealthSettings, DEFAULT_HEALTH_SETTINGS } from './healthSettings'
import { rowToCardio, type CardioSession } from './cardio'
import { rowToPanel, type LipidPanel, type WaistMeasurement } from './measurements'
import type { StoredAdjustment } from './adjustment'
import { readEffectiveTargets } from './targets'
import { rowsToTrips, tripRanges, type TripRange } from './travel'
import type { WeeklyReview } from './weeklyReview'

/**
 * Server-only loaders for Health phase P2 (cardio, steps, adjustments, measurements, labs, milestones, weekly
 * reviews, settings, trips). Session client → owner-only RLS applies. A missing P2 table throws P2MigrationNeeded so
 * each card can show "needs a database update" instead of crashing; settings fall back to defaults.
 */

export const P2_MIGRATION_MESSAGE = 'This needs a database update — apply supabase/apply_health_p2.sql'

export class P2MigrationNeeded extends Error {
  constructor() { super(P2_MIGRATION_MESSAGE) }
}

function fail(error: { code?: string; message?: string }): never {
  if (isMissingSchemaError(error)) throw new P2MigrationNeeded()
  throw new Error('Could not load health data')
}

export function p2DbError(error: { code?: string; message?: string } | null): NextResponse {
  return isMissingSchemaError(error)
    ? NextResponse.json({ error: P2_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
    : NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null)

// ── Settings ────────────────────────────────────────────────────────────────

export async function loadHealthSettings(supabase: ServerClient, userId: string): Promise<{ settings: HealthSettings; available: boolean }> {
  try {
    const { data, error } = await supabase.from('health_settings').select('*').eq('user_id', userId).maybeSingle()
    if (error) return { settings: DEFAULT_HEALTH_SETTINGS, available: !isMissingSchemaError(error) }
    return { settings: readHealthSettings(data as Record<string, unknown> | null), available: true }
  } catch {
    return { settings: DEFAULT_HEALTH_SETTINGS, available: false }
  }
}

// ── Activity ────────────────────────────────────────────────────────────────

export async function loadCardio(supabase: ServerClient, userId: string, from: string, to: string): Promise<CardioSession[]> {
  const { data, error } = await supabase.from('health_cardio_sessions')
    .select('id, local_date, cardio_type, minutes, avg_hr, intervals')
    .eq('user_id', userId).gte('local_date', from).lte('local_date', to).order('local_date', { ascending: true })
  if (error) fail(error)
  return (data ?? []).map(r => rowToCardio(r as Record<string, unknown>))
}

export async function loadSteps(supabase: ServerClient, userId: string, from: string, to: string): Promise<Array<{ date: string; steps: number }>> {
  const { data, error } = await supabase.from('health_steps').select('local_date, steps')
    .eq('user_id', userId).gte('local_date', from).lte('local_date', to).order('local_date', { ascending: true })
  if (error) fail(error)
  return (data ?? []).map(r => ({ date: String(r.local_date), steps: Number(r.steps) || 0 }))
}

// ── Measurements, labs, photos, milestones ──────────────────────────────────

export async function loadWaist(supabase: ServerClient, userId: string): Promise<Array<WaistMeasurement & { id: string }>> {
  const { data, error } = await supabase.from('health_measurements').select('id, local_date, value')
    .eq('user_id', userId).eq('kind', 'waist').order('local_date', { ascending: true }).limit(400)
  if (error) fail(error)
  return (data ?? []).map(r => ({ id: String(r.id), date: String(r.local_date), cm: Number(r.value) }))
}

export async function loadLabs(supabase: ServerClient, userId: string): Promise<LipidPanel[]> {
  const { data, error } = await supabase.from('health_lab_results').select('id, taken_on, total_mmol, ldl_mmol, hdl_mmol, tg_mmol')
    .eq('user_id', userId).order('taken_on', { ascending: true }).limit(100)
  if (error) fail(error)
  return (data ?? []).map(r => rowToPanel(r as Record<string, unknown>))
}

export async function loadProgressPhotos(supabase: ServerClient, userId: string): Promise<Array<{ id: string; date: string; path: string }>> {
  const { data, error } = await supabase.from('health_progress_photos').select('id, local_date, path')
    .eq('user_id', userId).order('local_date', { ascending: false }).limit(60)
  if (error) fail(error)
  return (data ?? []).map(r => ({ id: String(r.id), date: String(r.local_date), path: String(r.path) }))
}

export async function loadMilestoneKeys(supabase: ServerClient, userId: string, enrolmentId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('health_milestone_checks').select('task_key')
    .eq('user_id', userId).eq('enrolment_id', enrolmentId)
  if (error) fail(error)
  return new Set((data ?? []).map(r => String(r.task_key)))
}

// ── Adjustments ─────────────────────────────────────────────────────────────

export async function loadAdjustments(supabase: ServerClient, userId: string, enrolmentId: string): Promise<StoredAdjustment[]> {
  const { data, error } = await supabase.from('health_adjustments')
    .select('id, period_end, status, kcal_change, loss_kg, reasoning, decided_at, targets_before, targets_after')
    .eq('user_id', userId).eq('enrolment_id', enrolmentId).order('period_end', { ascending: false })
  if (error) fail(error)
  return (data ?? []).map(r => ({
    id: String(r.id),
    periodEnd: String(r.period_end),
    status: r.status === 'accepted' ? 'accepted' : 'declined',
    kcalChange: Number(r.kcal_change) || 0,
    lossKg: n(r.loss_kg),
    reasoning: String(r.reasoning ?? ''),
    decidedAt: String(r.decided_at),
    before: readEffectiveTargets(r.targets_before),
    after: readEffectiveTargets(r.targets_after),
  }))
}

// ── Weekly reviews ──────────────────────────────────────────────────────────

export async function loadWeeklyReviews(supabase: ServerClient, userId: string, limit = 12): Promise<WeeklyReview[]> {
  const { data, error } = await supabase.from('health_weekly_reviews').select('week_start, data')
    .eq('user_id', userId).order('week_start', { ascending: false }).limit(limit)
  if (error) fail(error)
  return (data ?? []).map(r => r.data as WeeklyReview).filter(r => r && typeof r === 'object' && Array.isArray(r.focus))
}

/** Store a review (best effort — never fails the page). */
export async function storeWeeklyReview(supabase: ServerClient, userId: string, review: WeeklyReview): Promise<void> {
  try {
    await supabase.from('health_weekly_reviews').upsert(
      { user_id: userId, week_start: review.weekStart, data: review, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,week_start' },
    )
  } catch {
    // best effort
  }
}

// ── Trips (existing Trips module) ───────────────────────────────────────────

/**
 * The user's OWN trips (trips.owner_id = user — a Health user is a member; assistants never get Health) with legs,
 * as local-date ranges in the home timezone. Best effort: [] on any error.
 */
export async function loadTripRanges(supabase: ServerClient, userId: string, enrolment: Pick<ActiveEnrolment, 'homeTimezone'>): Promise<TripRange[]> {
  try {
    const { data, error } = await supabase.from('trips')
      .select('id, trip_type, legs:trip_legs(departure_at, arrival_at, from_airport, to_airport)')
      .eq('owner_id', userId)
      .limit(200)
    if (error || !data) return []
    return tripRanges(rowsToTrips(data as unknown[]), enrolment.homeTimezone)
  } catch {
    return []
  }
}

export async function loadDayTimezones(supabase: ServerClient, userId: string, from: string, to: string): Promise<Array<{ date: string; timezone: string }>> {
  try {
    const { data, error } = await supabase.from('health_day_timezones').select('local_date, timezone')
      .eq('user_id', userId).gte('local_date', from).lte('local_date', to).order('local_date', { ascending: true })
    if (error || !data) return []
    return data.map(r => ({ date: String(r.local_date), timezone: String(r.timezone) }))
  } catch {
    return []
  }
}
