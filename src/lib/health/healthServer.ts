import { NextResponse } from 'next/server'
import { getAuthUser, type AuthUser } from '@/lib/auth'
import { hasFeature } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { isMissingSchemaError } from '@/lib/invitationRoles'
import { parseProgrammeDefinition, type ProgrammeDefinition } from './programmeSchema'
import { readEffectiveTargets, ProfileSchema, type EffectiveTargets, type Profile } from './targets'
import { FoodItemSchema, type FoodItem } from './nutrition'
import { normalizeFoodName, per100FromItem, readLibraryRow, type LibraryFood } from './foodLibrary'
import { assumptionPrefsOf, baseNutrients } from './assumptions'
import { joinItemMeta, splitItemMeta } from './itemMeta'
import { evaluateRules, type RuleContext, type RuleFinding } from './rules'
import { sleepSummary, type SleepNight, type WeighIn } from './checkin'
import { addDays, localDate, localTime, weekStart } from './time'
import { HEALTH_MIGRATION_MESSAGE } from './healthHub'
import { upgradeSeedDefinition } from './seedProgramme'
import { resolveTimezone } from './travel'
import { recommendSession, type WorkoutSummary } from './training'
import { jointStatus, rowToJointCheck } from './painRules'

/**
 * Server-only Health data access (specs/029). Uses the user's own session client, so the owner-only RLS policies
 * apply on top of the API checks. Every loader tolerates a missing migration (→ 'migration_needed', never a crash).
 */

export type ServerClient = Awaited<ReturnType<typeof createClient>>

// ── API guard ───────────────────────────────────────────────────────────────

/** Auth first, then the Health add-on (members only — assistants never get Health). */
export async function requireHealthUser(): Promise<{ ok: true; user: AuthUser } | { ok: false; response: NextResponse }> {
  const user = await getAuthUser()
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasFeature(user.access, 'health')) {
    return { ok: false, response: NextResponse.json({ error: 'Health is not enabled for this account' }, { status: 403 }) }
  }
  return { ok: true, user }
}

export function migrationResponse(): NextResponse {
  return NextResponse.json({ error: HEALTH_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
}

export function dbErrorResponse(error: { code?: string; message?: string } | null): NextResponse {
  return isMissingSchemaError(error) ? migrationResponse() : NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// ── Enrolment state ─────────────────────────────────────────────────────────

export interface ActiveEnrolment {
  id: string
  programmeId: string
  programmeName: string
  templateKey: string | null
  startDate: string
  /** Timezone for day boundaries NOW: the per-day override (travel) when one applies, else the enrolment timezone. */
  timezone: string
  /** The enrolment's own timezone (default for every day without an override). */
  homeTimezone: string
  profile: Profile | null
  overrides: Record<string, unknown>
  targets: EffectiveTargets
  def: ProgrammeDefinition
  createdAt: string
}

export type HealthState =
  | { status: 'migration_needed' }
  | { status: 'error' }
  | { status: 'needs_consent' }
  | { status: 'needs_enrolment' }
  | { status: 'active'; enrolment: ActiveEnrolment }
  | { status: 'invalid_programme' }

export async function loadHealthState(supabase: ServerClient, userId: string): Promise<HealthState> {
  const consent = await supabase
    .from('health_consents')
    .select('id')
    .eq('user_id', userId)
    .is('withdrawn_at', null)
    .limit(1)
  if (consent.error) return isMissingSchemaError(consent.error) ? { status: 'migration_needed' } : { status: 'error' }
  if (!consent.data || consent.data.length === 0) return { status: 'needs_consent' }

  const { data, error } = await supabase
    .from('health_enrolments')
    .select('*, health_programmes(id, name, template_key, definition)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) return isMissingSchemaError(error) ? { status: 'migration_needed' } : { status: 'error' }
  if (!data) return { status: 'needs_enrolment' }

  const prog = (data as Record<string, unknown>).health_programmes as Record<string, unknown> | null
  const parsedDef = parseProgrammeDefinition(prog?.definition)
  const def = parsedDef ? upgradeSeedDefinition(parsedDef, (prog?.template_key as string | null) ?? null) : null
  const targets = readEffectiveTargets(data.effective_targets)
  if (!def || !targets) return { status: 'invalid_programme' }
  const profile = ProfileSchema.safeParse(data.profile)
  const homeTimezone = (data.timezone as string) || 'Europe/London'
  const timezone = await effectiveTimezone(supabase, userId, homeTimezone)
  return {
    status: 'active',
    enrolment: {
      id: data.id as string,
      programmeId: data.programme_id as string,
      programmeName: (prog?.name as string) ?? def.identity.name,
      templateKey: (prog?.template_key as string | null) ?? null,
      startDate: data.start_date as string,
      timezone,
      homeTimezone,
      profile: profile.success ? profile.data : null,
      overrides: (data.overrides as Record<string, unknown>) ?? {},
      targets,
      def,
      createdAt: data.created_at as string,
    },
  }
}

/**
 * Day-boundary timezone now: a per-day override (P2 travel mode, table health_day_timezones) for the home date ±1
 * when it applies, else the home timezone. Best effort — a missing P2 table means "no overrides".
 */
export async function effectiveTimezone(supabase: ServerClient, userId: string, homeTz: string, now = new Date()): Promise<string> {
  try {
    const home = localDate(now, homeTz)
    const { data, error } = await supabase
      .from('health_day_timezones')
      .select('local_date, timezone')
      .eq('user_id', userId)
      .gte('local_date', addDays(home, -1))
      .lte('local_date', addDays(home, 1))
    if (error || !data) return homeTz
    return resolveTimezone(now, homeTz, data.map(r => ({ date: String(r.local_date), timezone: String(r.timezone) })))
  } catch {
    return homeTz
  }
}

/** Today's local date and time for an enrolment. */
export function nowFor(enrolment: Pick<ActiveEnrolment, 'timezone'>, at = new Date()): { date: string; time: string } {
  return { date: localDate(at, enrolment.timezone), time: localTime(at, enrolment.timezone) }
}

// ── Rows ↔ domain ───────────────────────────────────────────────────────────

export interface StoredItem extends FoodItem { id: string }

export interface StoredEntry {
  id: string
  date: string
  time: string
  slot: string | null
  text: string | null
  restaurant: boolean
  /** P3.1 "cooked/served without butter or oil" (stored in the entry's ai_usage jsonb — no migration). */
  noAddedFat: boolean
  photoPaths: string[]
  items: StoredItem[]
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

export function rowToItem(row: Record<string, unknown>): StoredItem | null {
  const { components, meta } = splitItemMeta(row.components)
  const parsed = FoodItemSchema.safeParse({
    name: row.name,
    quantityG: num(row.quantity_g),
    kcal: num(row.kcal),
    proteinG: num(row.protein_g),
    carbsG: num(row.carbs_g),
    fatG: num(row.fat_g),
    satFatG: num(row.sat_fat_g),
    fibreG: num(row.fibre_g),
    components,
    confidence: row.confidence,
    isTreat: row.is_treat === true,
    source: meta.source ?? row.source,
    libraryId: row.library_id ?? null,
    offCode: row.off_code ?? null,
    ...(meta.assumptions.length ? { assumptions: meta.assumptions } : {}),
    ...(meta.refId ? { refId: meta.refId } : {}),
  })
  return parsed.success ? { ...parsed.data, id: String(row.id) } : null
}

export function itemToRow(item: FoodItem, entryId: string, userId: string, position: number): Record<string, unknown> {
  return {
    entry_id: entryId,
    user_id: userId,
    position,
    name: item.name,
    quantity_g: item.quantityG,
    kcal: item.kcal,
    protein_g: item.proteinG,
    carbs_g: item.carbsG,
    fat_g: item.fatG,
    sat_fat_g: item.satFatG,
    fibre_g: item.fibreG,
    components: joinItemMeta(item),
    confidence: item.confidence,
    is_treat: item.isTreat,
    // The DB CHECK predates the 'reference' source: store 'ai' there and the real source in components._meta.
    source: item.source === 'reference' ? 'ai' : item.source,
    library_id: item.libraryId ?? null,
    off_code: item.offCode ?? null,
  }
}

function rowToEntry(row: Record<string, unknown>): StoredEntry {
  const usage = row.ai_usage && typeof row.ai_usage === 'object' ? (row.ai_usage as Record<string, unknown>) : null
  const items = Array.isArray(row.health_food_items)
    ? (row.health_food_items as Record<string, unknown>[])
        .sort((a, b) => num(a.position) - num(b.position))
        .map(rowToItem)
        .filter((i): i is StoredItem => i !== null)
    : []
  return {
    id: String(row.id),
    date: String(row.local_date),
    time: String(row.local_time),
    slot: (row.slot as string | null) ?? null,
    text: (row.input_text as string | null) ?? null,
    restaurant: row.restaurant === true,
    noAddedFat: usage?.noAddedFat === true,
    photoPaths: Array.isArray(row.photo_paths) ? (row.photo_paths as string[]) : [],
    items,
  }
}

// ── Loaders ─────────────────────────────────────────────────────────────────

export async function loadEntries(supabase: ServerClient, userId: string, from: string, to: string): Promise<StoredEntry[]> {
  const { data, error } = await supabase
    .from('health_food_entries')
    .select('id, local_date, local_time, slot, input_text, restaurant, photo_paths, ai_usage, health_food_items(*)')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: true })
    .order('local_time', { ascending: true })
  if (error) throw new Error(isMissingSchemaError(error) ? HEALTH_MIGRATION_MESSAGE : 'Could not load food entries')
  return (data ?? []).map(r => rowToEntry(r as Record<string, unknown>))
}

export interface StoredCheckin {
  date: string
  weightKg: number | null
  bedTime: string | null
  wakeTime: string | null
  supplementsTaken: string[]
}

export async function loadCheckins(supabase: ServerClient, userId: string, from: string, to: string): Promise<StoredCheckin[]> {
  const { data, error } = await supabase
    .from('health_checkins')
    .select('local_date, weight_kg, bed_time, wake_time, supplements_taken')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: true })
  if (error) throw new Error(isMissingSchemaError(error) ? HEALTH_MIGRATION_MESSAGE : 'Could not load check-ins')
  return (data ?? []).map(r => ({
    date: String(r.local_date),
    weightKg: r.weight_kg === null || r.weight_kg === undefined ? null : num(r.weight_kg),
    bedTime: (r.bed_time as string | null) ?? null,
    wakeTime: (r.wake_time as string | null) ?? null,
    supplementsTaken: Array.isArray(r.supplements_taken) ? (r.supplements_taken as string[]) : [],
  }))
}

export function weighInsOf(checkins: StoredCheckin[]): WeighIn[] {
  return checkins.filter(c => c.weightKg !== null).map(c => ({ date: c.date, weightKg: c.weightKg as number }))
}

export function sleepNightsOf(checkins: StoredCheckin[]): SleepNight[] {
  return checkins.map(c => ({ date: c.date, bedTime: c.bedTime, wakeTime: c.wakeTime }))
}

export async function loadLibrary(supabase: ServerClient, userId: string, limit = 200): Promise<LibraryFood[]> {
  const { data, error } = await supabase
    .from('health_food_library')
    .select('id, name, normalized_name, default_quantity_g, per100, is_treat')
    .eq('user_id', userId)
    .order('uses_count', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data ?? []).map(readLibraryRow).filter((f): f is LibraryFood => f !== null)
}

/** Daily log row for a local date (created on first use). */
export async function ensureDailyLog(supabase: ServerClient, userId: string, date: string): Promise<{ id: string } | { error: { code?: string; message?: string } }> {
  const { data, error } = await supabase
    .from('health_daily_logs')
    .upsert({ user_id: userId, local_date: date }, { onConflict: 'user_id,local_date' })
    .select('id')
    .single()
  if (error || !data) return { error: error ?? { message: 'no row' } }
  return { id: data.id as string }
}

// ── Rules ───────────────────────────────────────────────────────────────────

export interface DayEvaluation {
  findings: RuleFinding[]
  entries: StoredEntry[]
  weekEntries: StoredEntry[]
  checkins: StoredCheckin[]
}

/** Bedtime for the last-meal rule: programme target, else the typical bedtime of the last 7 check-ins. */
export function plannedBedtime(def: ProgrammeDefinition, checkins: StoredCheckin[], date: string): string | null {
  return def.sleep?.targetBedtime ?? sleepSummary(sleepNightsOf(checkins), date, def).typicalBedTime
}

/**
 * Training signals for the rules engine (P1b). Best effort: undefined when the P1b tables are missing or a query
 * fails, so the food rules never depend on training data.
 */
export async function loadTrainingSignals(supabase: ServerClient, userId: string, def: ProgrammeDefinition, date: string): Promise<RuleContext['training']> {
  try {
    const monday = weekStart(date)
    const [w, j] = await Promise.all([
      supabase.from('health_workouts').select('local_date, session_key, status').eq('user_id', userId)
        .gte('local_date', addDays(monday, -1)).lte('local_date', addDays(monday, 6)),
      supabase.from('health_joint_checks')
        .select('id, workout_id, local_date, session_key, during_pain, next_morning_pain, swelling, red_flags, physio_cleared, cleared_on')
        .eq('user_id', userId).order('local_date', { ascending: false }).limit(20),
    ])
    if (w.error || j.error) return undefined
    const workouts: WorkoutSummary[] = (w.data ?? []).map(r => ({ date: String(r.local_date), sessionKey: String(r.session_key), status: r.status as WorkoutSummary['status'] }))
    const rec = recommendSession(def, date, workouts)
    const joint = jointStatus(def.painRules, (j.data ?? []).map(r => rowToJointCheck(r as Record<string, unknown>)))
    const session = def.trainingSessions.find(s => s.key === rec.sessionKey)
    return {
      sessionToday: rec.sessionKey !== null,
      trainedToday: workouts.some(x => x.date === date && x.status !== 'skipped'),
      jointWatchedToday: !!session?.exercises.some(e => e.jointWatch),
      joint: { level: joint.level, message: joint.message },
    }
  } catch {
    return undefined
  }
}

/** Evaluate all P1a rules for a date. `now` = local time for today, '23:59' for a past day. */
export async function evaluateDay(
  supabase: ServerClient,
  userId: string,
  enrolment: ActiveEnrolment,
  date: string,
  now: string,
): Promise<DayEvaluation> {
  const monday = weekStart(date)
  const [weekEntries, checkins, training] = await Promise.all([
    loadEntries(supabase, userId, monday, date),
    loadCheckins(supabase, userId, addDays(date, -7), date),
    // Training rules only matter for today (a past day's coffee timing is moot).
    date === nowFor(enrolment).date ? loadTrainingSignals(supabase, userId, enrolment.def, date) : Promise.resolve(undefined),
  ])
  const entries = weekEntries.filter(e => e.date === date)
  const weekComponents: Record<string, number> = {}
  for (const e of weekEntries) for (const i of e.items) for (const [k, v] of Object.entries(i.components)) weekComponents[k] = (weekComponents[k] ?? 0) + v
  const findings = evaluateRules({
    def: enrolment.def,
    targets: enrolment.targets,
    now,
    date,
    entries: entries.map(e => ({ time: e.time, slot: e.slot, items: e.items })),
    weekComponents,
    bedtime: plannedBedtime(enrolment.def, checkins, date),
    training,
  })
  return { findings, entries, weekEntries, checkins }
}

/** Store fired rules for the day (best effort — never fails the write that triggered it). */
export async function storeRuleEvents(supabase: ServerClient, userId: string, date: string, findings: RuleFinding[]): Promise<void> {
  if (findings.length === 0) return
  const now = new Date().toISOString()
  try {
    await supabase.from('health_rule_events').upsert(
      findings.map(f => ({
        user_id: userId,
        local_date: date,
        rule_key: f.key,
        rule_type: f.type,
        rec_group: f.group,
        priority: f.priority,
        message: f.message,
        data: f.data ?? null,
        last_fired_at: now,
      })),
      { onConflict: 'user_id,local_date,rule_key' },
    )
  } catch {
    // best effort
  }
}

/** Re-evaluate and store rule events after a write. Best effort. */
export async function refreshRuleEvents(supabase: ServerClient, userId: string, enrolment: ActiveEnrolment, date: string): Promise<void> {
  try {
    const today = nowFor(enrolment)
    const now = date === today.date ? today.time : '23:59'
    const { findings } = await evaluateDay(supabase, userId, enrolment, date, now)
    await storeRuleEvents(supabase, userId, date, findings)
  } catch {
    // best effort
  }
}

/** Load the active enrolment for an API write, mapping each non-active state to a response. */
export async function requireEnrolment(supabase: ServerClient, userId: string): Promise<{ ok: true; enrolment: ActiveEnrolment } | { ok: false; response: NextResponse }> {
  const state = await loadHealthState(supabase, userId)
  if (state.status === 'active') return { ok: true, enrolment: state.enrolment }
  if (state.status === 'migration_needed') return { ok: false, response: migrationResponse() }
  if (state.status === 'needs_consent') return { ok: false, response: NextResponse.json({ error: 'Please give consent first' }, { status: 409 }) }
  if (state.status === 'needs_enrolment') return { ok: false, response: NextResponse.json({ error: 'Start a programme first' }, { status: 409 }) }
  return { ok: false, response: NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
}

// ── Food library writes ─────────────────────────────────────────────────────

/**
 * Remember items in the personal library (per-100 g values + the logged portion as default) and bump use counts of
 * library items that were logged. Best effort — never fails the food log.
 */
export async function rememberFoods(supabase: ServerClient, userId: string, items: FoodItem[], rememberIdx: number[]): Promise<void> {
  try {
    const now = new Date().toISOString()
    const toRemember = [...new Set(rememberIdx)].map(i => items[i]).filter((i): i is FoodItem => !!i)
    for (const item of toRemember) {
      // P3.1: the library keeps the BASE food (as described) + the chip choices, e.g. "no butter on this toast".
      const per100 = per100FromItem(baseNutrients(item))
      if (!per100) continue
      const prefs = assumptionPrefsOf(item)
      const normalized = normalizeFoodName(item.name)
      if (!normalized) continue
      const { data: existing } = await supabase
        .from('health_food_library')
        .select('id, uses_count')
        .eq('user_id', userId)
        .eq('normalized_name', normalized)
        .maybeSingle()
      const row = {
        name: item.name,
        default_quantity_g: item.quantityG,
        per100: Object.keys(prefs).length ? { ...per100, assumptionPrefs: prefs } : per100,
        is_treat: item.isTreat,
        last_used_at: now,
        updated_at: now,
      }
      if (existing) {
        await supabase.from('health_food_library').update({ ...row, uses_count: Number(existing.uses_count ?? 0) + 1 }).eq('id', existing.id)
      } else {
        await supabase.from('health_food_library').insert({ ...row, user_id: userId, normalized_name: normalized, uses_count: 1 })
      }
    }
    const used = [...new Set(items.map(i => i.libraryId).filter((id): id is string => !!id))]
    for (const id of used) {
      const { data } = await supabase.from('health_food_library').select('uses_count').eq('id', id).eq('user_id', userId).maybeSingle()
      if (data) await supabase.from('health_food_library').update({ uses_count: Number(data.uses_count ?? 0) + 1, last_used_at: now }).eq('id', id)
    }
  } catch {
    // best effort
  }
}
