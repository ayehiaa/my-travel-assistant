import { z } from 'zod'
import type { ProgrammeDefinition, Weekday } from './programmeSchema'
import { WEEKDAYS } from './programmeSchema'
import { addDays, daysBetween, programmeWeek, weekStart, weekdayOf } from './time'

/**
 * Training logic for the Health module (specs/029 §4 US5, §6.1 schedule / progression rules, phase P1b). Pure —
 * safe in client and server code. Decisions are recorded in specs/029-health-routines/plan.md (P1b section).
 */

export type TrainingSession = ProgrammeDefinition['trainingSessions'][number]
export type Exercise = TrainingSession['exercises'][number]
export type Block = ProgrammeDefinition['blocks'][number]

// ── Week & block ────────────────────────────────────────────────────────────

export interface TrainingPosition {
  phase: 'before_start' | 'active' | 'completed'
  /** Programme week (1-based), null before the start. Not clamped (week 13+ = completed). */
  week: number | null
  block: Block | null
  blockIndex: number
  /** Week is a light week of its block (e.g. B1 week 4, B2 week 8). */
  light: boolean
  /** Week is a deload week (e.g. B3 week 12). */
  deload: boolean
}

export function blockForWeek(def: ProgrammeDefinition, week: number): { block: Block | null; index: number } {
  const index = def.blocks.findIndex(b => week >= b.weeks[0] && week <= b.weeks[1])
  return { block: index >= 0 ? def.blocks[index] : null, index }
}

/** Current programme week and block for a local date. */
export function trainingPosition(def: ProgrammeDefinition, startDate: string, date: string): TrainingPosition {
  const week = programmeWeek(startDate, date)
  if (week === null) return { phase: 'before_start', week: null, block: null, blockIndex: -1, light: false, deload: false }
  if (week > def.identity.durationWeeks) return { phase: 'completed', week, block: null, blockIndex: -1, light: false, deload: false }
  const { block, index } = blockForWeek(def, week)
  return {
    phase: 'active',
    week,
    block,
    blockIndex: index,
    light: !!block?.lightWeeks.includes(week),
    deload: !!block?.deloadWeeks.includes(week),
  }
}

// ── Rep ranges ──────────────────────────────────────────────────────────────

export interface RepRange { min: number; max: number; suffix: string }

/** '8-12' → {8, 12, ''}; '12 each way' → {12, 12, 'each way'}; '10–15' → {10, 15, ''}. Null when not numeric. */
export function parseRepRange(text: string | undefined | null): RepRange | null {
  if (!text) return null
  const m = /^\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*(.*)$/.exec(text)
  if (!m) return null
  const min = Number(m[1])
  const max = m[2] ? Number(m[2]) : min
  if (!(min > 0) || max < min) return null
  return { min, max, suffix: m[3].trim() }
}

export function formatRepRange(r: RepRange): string {
  const base = r.min === r.max ? String(r.min) : `${r.min}–${r.max}`
  return r.suffix ? `${base} ${r.suffix}` : base
}

/**
 * Block 3 rep ranges distinguish compounds from isolation work. Compound = multi-joint lift (press, row, pulldown,
 * deadlift / RDL, hip thrust, push-up); everything else (raises, curls, extensions, face pulls, pull-aparts,
 * side-steps, calf raises, knee extensions, bridges, core) is isolation.
 */
const COMPOUND_RE = /\b(press|row|pulldown|pull-?down|deadlift|rdl|thrust|push-?up|pull-?up|chin-?up)\b/i

export function exerciseClass(ex: Pick<Exercise, 'name' | 'region'>): 'compound' | 'isolation' {
  if (ex.region === 'core') return 'isolation'
  return COMPOUND_RE.test(ex.name) ? 'compound' : 'isolation'
}

/** Block 3 "6-12 compounds / 12-20 isolation" → the right half for an exercise; plain ranges pass through. */
export function blockRepRangeFor(block: Block, ex: Pick<Exercise, 'name' | 'region'>): RepRange | null {
  const parts = block.repRange.split('/').map(s => s.trim())
  if (parts.length === 2) {
    const compound = parts.find(p => /compound/i.test(p)) ?? parts[0]
    const isolation = parts.find(p => /isolation/i.test(p)) ?? parts[1]
    const r = parseRepRange(exerciseClass(ex) === 'compound' ? compound : isolation)
    return r ? { min: r.min, max: r.max, suffix: '' } : null
  }
  const r = parseRepRange(block.repRange)
  return r ? { min: r.min, max: r.max, suffix: '' } : null
}

// ── Effective prescription ──────────────────────────────────────────────────

export interface Prescription {
  sets: number
  kind: 'reps' | 'hold'
  reps: RepRange | null
  /** Display text, e.g. '10–15', '12–20 each way', '45 s'. */
  target: string
  holdSeconds: number | null
  rir: string | null
  lastSetToFailure: boolean
  /** Fraction of normal load (light week 8 → 0.6); null = normal. */
  loadFactor: number | null
  dropSetOnFinalSet: boolean
  restSeconds: number | null
  /** Week 12: retest lifts after the deload. */
  retest: boolean
  notes: string[]
  /** Hold cap raised by a block progression (e.g. 60 s wall sit from Block 2 once the pain rule passed); null = default. */
  holdCapSeconds: number | null
}

export interface PrescriptionOptions {
  /** Pain rule passed (same condition as the pain-rule unlocks) — enables `blockProgressions`. Default false. */
  painRulePassed?: boolean
}

/**
 * Block progressions that apply in `week` (owner's document, P2): the exercise lists changes from a block onwards
 * that need the pain rule passed. Never applies before the block, outside the programme, or without the pain rule.
 */
export function activeBlockProgressions(def: ProgrammeDefinition, ex: Pick<Exercise, 'blockProgressions'>, week: number | null, painRulePassed: boolean) {
  if (week === null || week > def.identity.durationWeeks || !painRulePassed) return []
  const { index } = blockForWeek(def, week)
  if (index < 0) return []
  return (ex.blockProgressions ?? []).filter(p => {
    const from = def.blocks.findIndex(b => b.key === p.fromBlock)
    return from >= 0 && index >= from && p.requires === 'pain_rule_ok'
  })
}

/** Exercise is load-bearing (dumbbells) — drives drop sets and load progression. */
export function usesDumbbells(ex: Pick<Exercise, 'equipment'>): boolean {
  return ex.equipment.some(e => /dumbbell/i.test(e))
}

export function usesBands(ex: Pick<Exercise, 'equipment'>): boolean {
  return ex.equipment.some(e => /band/i.test(e))
}

function isHold(ex: Pick<Exercise, 'holdSeconds' | 'reps'>): boolean {
  return ex.holdSeconds !== undefined && !ex.reps
}

/**
 * The ONE exercise per session that gets the Block 3 drop set: the last non-core, rep-based, non-joint-watched
 * dumbbell exercise; if none, the last non-core rep-based exercise. Null when the session has neither.
 */
export function dropSetExerciseKey(session: TrainingSession): string | null {
  const candidates = session.exercises.filter(e => e.region !== 'core' && !isHold(e))
  const preferred = candidates.filter(e => !e.jointWatch && usesDumbbells(e))
  const pick = preferred[preferred.length - 1] ?? candidates[candidates.length - 1]
  return pick?.key ?? null
}

/**
 * Effective sets × reps for an exercise in a given week (block rules, light weeks, deload). Rules:
 * - Block 1: 3 sets of every exercise, block rep range, RIR 2–3; light week → 2 sets.
 * - Block 2: session-table sets, block rep range, last set to failure; light week → 2 sets at 60% load, no failure.
 * - Block 3: 4 sets throughout, compound/isolation ranges, drop set on the final set of one exercise per session;
 *   deload week → half the sets, no failure / drop set, retest flag.
 * Hold exercises keep their hold time (no failure / drop sets). Session blockOverrides win over block defaults.
 * Without a block (before start / after the programme) the session table applies as written.
 */
export function effectivePrescription(def: ProgrammeDefinition, session: TrainingSession, ex: Exercise, week: number | null, opts: PrescriptionOptions = {}): Prescription {
  const own = parseRepRange(ex.reps)
  const hold = isHold(ex)
  const base: Prescription = {
    sets: ex.sets ?? 3,
    kind: hold ? 'hold' : 'reps',
    reps: hold ? null : own,
    target: '',
    holdSeconds: ex.holdSeconds ?? null,
    rir: null,
    lastSetToFailure: false,
    loadFactor: null,
    dropSetOnFinalSet: false,
    restSeconds: ex.restSeconds ?? null,
    retest: false,
    notes: [],
    holdCapSeconds: null,
  }
  const block = week !== null && week <= def.identity.durationWeeks ? blockForWeek(def, week).block : null
  if (block && week !== null) {
    const light = block.lightWeeks.includes(week)
    const deload = block.deloadWeeks.includes(week)
    const technique = block.intensityTechnique ?? ''
    // Block 2 style: "set counts as in the session tables"; otherwise the block's set count applies to everything.
    const tableSets = /session table/i.test(technique)
    base.sets = tableSets ? (ex.sets ?? block.sets) : block.sets
    base.rir = hold ? null : block.rir ?? null
    if (!hold) {
      const range = blockRepRangeFor(block, ex)
      if (range) base.reps = { ...range, suffix: own?.suffix ?? '' }
    }
    const failure = /last set .*failure/i.test(technique)
    const dropSet = /drop set/i.test(technique)
    if (failure && !hold) base.lastSetToFailure = true
    if (dropSet && !hold && dropSetExerciseKey(session) === ex.key) base.dropSetOnFinalSet = true
    if (light) {
      base.sets = 2
      base.lastSetToFailure = false
      base.dropSetOnFinalSet = false
      const pct = /(\d{2})\s*%/.exec(block.notes ?? '')
      if (pct) {
        base.loadFactor = Number(pct[1]) / 100
        base.notes.push(`Light week: 2 sets at ${pct[1]}% of your normal load.`)
      } else {
        base.notes.push('Light week: 2 sets of each exercise.')
      }
    }
    if (deload) {
      base.sets = Math.max(1, Math.round(base.sets / 2))
      base.lastSetToFailure = false
      base.dropSetOnFinalSet = false
      base.retest = true
      base.notes.push('Deload: half the usual sets. Retest your lifts at the end of the week.')
    }
  }
  const override = block ? session.blockOverrides[block.key] : undefined
  if (override?.sets) base.sets = override.sets
  if (override?.reps && !hold) base.reps = parseRepRange(override.reps) ?? base.reps
  for (const p of activeBlockProgressions(def, ex, week, opts.painRulePassed === true)) {
    if (p.holdCapSeconds !== undefined && hold) base.holdCapSeconds = p.holdCapSeconds
    if (p.note) base.notes.push(p.note)
  }
  if (base.lastSetToFailure) base.notes.push('Last set to failure.')
  if (base.dropSetOnFinalSet) base.notes.push('Final set: drop set — to failure, take 30% off the weight, go again.')
  base.target = hold
    ? `${base.holdSeconds ?? 0} s`
    : base.reps ? formatRepRange(base.reps) : (ex.reps ?? '')
  return base
}

// ── Excluded movements, travel variants, unlocks ────────────────────────────

function stem(word: string): string {
  return word.toLowerCase().replace(/[^a-z\s-]/g, '').replace(/s\b/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
}

/** True when an exercise name matches an excluded movement (singular/plural, hyphen-insensitive). */
export function isExcludedMovement(name: string, excluded: readonly string[]): boolean {
  const n = ` ${stem(name)} `
  return excluded.some(x => {
    const s = stem(x)
    return s.length > 0 && n.includes(` ${s}`)
  })
}

/** Name to show in travel mode (same sets/reps/RIR). Excluded substitutes are never offered. */
export function displayName(ex: Exercise, travel: boolean, excluded: readonly string[] = []): string {
  if (travel && ex.travelSubstitute && !isExcludedMovement(ex.travelSubstitute.name, excluded)) return ex.travelSubstitute.name
  return ex.name
}

export function youtubeSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form`)}`
}

/** Key for a conditional unlock / professional approval: 'Step-ups' → 'step_ups'. */
export function unlockKey(movement: string): string {
  return movement.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'unlock'
}

/**
 * Concrete exercises for the seed programme's conditional unlocks (the programme lists only the movement). Fixed,
 * conservative prescriptions that do NOT follow block set/rep changes: sit-to-stand from a high seat 3 × 8–10;
 * low step-up (10–15 cm) 3 × 8–10 per side. Both are joint-watched and added at the end of the session that does
 * lower-body work with a pain check (Session B in the seed).
 */
export const UNLOCK_EXERCISES: Record<string, Exercise> = {
  sit_to_stand: {
    key: 'sit_to_stand', name: 'Sit-to-stand (from a high seat)', sets: 3, reps: '8-10', restSeconds: 60, region: 'lower',
    jointWatch: true, perSide: false, equipment: [], blockProgressions: [],
    notes: 'High chair or bench so the knee bends no further than a right angle. Stand up tall, sit down slowly.',
    videoUrl: youtubeSearchUrl('Sit to stand from high chair'),
  },
  step_ups: {
    key: 'step_ups', name: 'Low step-up (10–15 cm step)', sets: 3, reps: '8-10', restSeconds: 60, region: 'lower',
    jointWatch: true, perSide: true, equipment: [], blockProgressions: [],
    notes: 'Low step only (10–15 cm). Step up and come down slowly with control. Only with your physiotherapist\'s agreement.',
    videoUrl: youtubeSearchUrl('Low step up'),
  },
}

export interface UnlockStatus {
  key: string
  movement: string
  requires: 'pain_rule_ok' | 'professional_approval'
  fromBlock: string | null
  fromBlockName: string | null
  available: boolean
  /** Why it is locked (or what made it available). */
  reason: string
  exercise: Exercise | null
  notes: string | null
}

/**
 * Conditional unlocks for the current block: pain-rule unlocks need the pain rule passed for the last two pain-check
 * sessions; professional-approval unlocks need a recorded approval. Both need the block to have started and no red
 * flag outstanding. Excluded movements are never unlocked.
 */
export function unlockStatuses(
  def: ProgrammeDefinition,
  ctx: { blockIndex: number; painRulePassed: boolean; approvals: readonly string[]; jointStopped: boolean },
): UnlockStatus[] {
  const excluded = def.movementRestrictions?.excluded ?? []
  return (def.movementRestrictions?.conditionalUnlocks ?? []).map(u => {
    const key = unlockKey(u.movement)
    const fromIdx = u.fromBlock ? def.blocks.findIndex(b => b.key === u.fromBlock) : 0
    const fromBlock = u.fromBlock ? def.blocks.find(b => b.key === u.fromBlock) ?? null : null
    const exercise = UNLOCK_EXERCISES[key] ?? null
    const status: UnlockStatus = {
      key, movement: u.movement, requires: u.requires, fromBlock: u.fromBlock ?? null, fromBlockName: fromBlock?.name ?? null,
      available: false, reason: '', exercise, notes: u.notes ?? null,
    }
    if (isExcludedMovement(u.movement, excluded) || (exercise && isExcludedMovement(exercise.name, excluded))) {
      return { ...status, reason: 'Excluded by your movement restrictions.' }
    }
    if (ctx.blockIndex < fromIdx || ctx.blockIndex < 0) {
      return { ...status, reason: `Available from ${fromBlock?.name ?? 'a later block'}.` }
    }
    if (ctx.jointStopped) return { ...status, reason: 'Locked until your physiotherapist clears the red flag.' }
    if (u.requires === 'pain_rule_ok' && !ctx.painRulePassed) {
      return { ...status, reason: 'Unlocks after two pain-check sessions in a row with pain ≤ the threshold and settled the next morning.' }
    }
    if (u.requires === 'professional_approval' && !ctx.approvals.includes(key)) {
      return { ...status, reason: 'Needs your physiotherapist\'s approval — tick "approved by my physio" once agreed.' }
    }
    if (!exercise) return { ...status, reason: 'No exercise definition for this movement yet.' }
    return { ...status, available: true, reason: u.requires === 'pain_rule_ok' ? 'Pain rule passed — unlocked.' : 'Approved by your physiotherapist.' }
  })
}

/** The session that hosts unlocked lower-body movements: the first pain-checked session with joint-watched lower work. */
export function unlockHostSession(def: ProgrammeDefinition): string | null {
  const s = def.trainingSessions.find(t => t.painCheck && t.exercises.some(e => e.region === 'lower' && e.jointWatch))
  return s?.key ?? null
}

// ── Logged sets & progression ───────────────────────────────────────────────

export const RIR_VALUES = [0, 1, 2, 3, 4] as const

export const LoggedSetSchema = z.object({
  setIndex:    z.number().int().min(0).max(19),
  loadKg:      z.number().min(0).max(500).nullable().default(null),
  reps:        z.number().int().min(0).max(200).nullable().default(null),
  holdSeconds: z.number().int().min(0).max(1800).nullable().default(null),
  rir:         z.number().int().min(0).max(5).nullable().default(null),
  toFailure:   z.boolean().default(false),
  isDropSet:   z.boolean().default(false),
})
export type LoggedSet = z.infer<typeof LoggedSetSchema>

/** One past performance of an exercise (oldest → newest in history arrays). */
export interface ExercisePerformance {
  date: string
  sets: LoggedSet[]
}

export type ProgressionKind = 'add_load' | 'add_time' | 'band' | 'bodyweight' | 'add_set' | 'at_cap' | 'keep' | 'suppressed' | 'none'

export interface ProgressionSuggestion {
  kind: ProgressionKind
  message: string
  nextLoadKg?: number
  nextHoldSeconds?: number
  nextSets?: number
}

/** Hold progression: +15 s per step up to the cap. Joint-watched holds never go past the programme's own hold time. */
export const HOLD_STEP_SECONDS = 15
export const HOLD_CAP_SECONDS = 90

export function holdCap(ex: Pick<Exercise, 'jointWatch' | 'holdSeconds'>, rx?: Pick<Prescription, 'holdCapSeconds'> | null): number {
  if (rx?.holdCapSeconds) return rx.holdCapSeconds
  return ex.jointWatch ? (ex.holdSeconds ?? HOLD_CAP_SECONDS) : Math.max(HOLD_CAP_SECONDS, ex.holdSeconds ?? 0)
}

const working = (sets: readonly LoggedSet[]) => sets.filter(s => !s.isDropSet)
const topLoad = (sets: readonly LoggedSet[]) => Math.max(0, ...working(sets).map(s => s.loadKg ?? 0))

/** Score for stall detection: top load first, then total reps (or seconds) at that load. */
export function performanceScore(sets: readonly LoggedSet[]): { load: number; volume: number } {
  const w = working(sets)
  const load = topLoad(w)
  const atTop = w.filter(s => (s.loadKg ?? 0) === load)
  const volume = atTop.reduce((t, s) => t + (s.reps ?? 0) + (s.holdSeconds ?? 0), 0)
  return { load, volume }
}

function improved(next: readonly LoggedSet[], prev: readonly LoggedSet[]): boolean {
  const a = performanceScore(next)
  const b = performanceScore(prev)
  return a.load > b.load || (a.load === b.load && a.volume > b.volume)
}

/** Stalled two sessions running: neither of the last two sessions beat the one before it. Needs ≥3 sessions. */
export function isStalled(history: readonly ExercisePerformance[]): boolean {
  if (history.length < 3) return false
  const [a, b, c] = history.slice(-3)
  return !improved(b.sets, a.sets) && !improved(c.sets, b.sets)
}

const roundLoad = (kg: number) => Math.round(kg * 2) / 2

/**
 * Next-time suggestion after a performance (the last entry of `history`). Rules (§6.1 progression):
 * - top of the rep range on every prescribed set with RIR (or failure) recorded → +2 kg upper / +4 kg lower per
 *   dumbbell; band exercises → shorter band / step further / thicker band; unloaded → slow the tempo;
 * - holds: every set at or above the target → +15 s up to the cap;
 * - stalled two sessions running → keep the weight, add one set;
 * - light / deload weeks and joint-suppressed exercises get no progression.
 */
export function progressionSuggestion(
  def: ProgrammeDefinition,
  ex: Exercise,
  rx: Prescription,
  history: readonly ExercisePerformance[],
  opts: { suppressedReason?: string | null; lightOrDeload?: boolean; holdCapSeconds?: number | null } = {},
): ProgressionSuggestion {
  const last = history[history.length - 1]
  if (!last || working(last.sets).length === 0) return { kind: 'none', message: 'Log your sets to get a suggestion for next time.' }
  if (opts.suppressedReason) return { kind: 'suppressed', message: opts.suppressedReason }
  if (opts.lightOrDeload) return { kind: 'keep', message: 'Lighter week — no progression. Back to your normal load next week.' }

  const sets = working(last.sets)
  const enoughSets = sets.length >= rx.sets
  const load = topLoad(sets)

  if (rx.kind === 'hold') {
    const target = rx.holdSeconds ?? ex.holdSeconds ?? 0
    const minHold = Math.min(...sets.map(s => s.holdSeconds ?? 0))
    // An explicit cap (from today's prescription, even null) wins over the cap of the week the hold was done in.
    const cap = holdCap(ex, { holdCapSeconds: opts.holdCapSeconds !== undefined ? opts.holdCapSeconds : rx.holdCapSeconds })
    if (enoughSets && minHold >= target && target > 0) {
      if (minHold >= cap) return { kind: 'at_cap', message: `At the ${cap} s cap — keep the hold${ex.jointWatch ? ' (range limit unchanged)' : ''}.` }
      const next = Math.min(minHold + HOLD_STEP_SECONDS, cap)
      return { kind: 'add_time', message: `Every hold reached ${minHold} s — try ${next} s next time.`, nextHoldSeconds: next }
    }
    if (isStalled(history)) return { kind: 'add_set', message: `Stalled two sessions — keep the hold and add a set (${rx.sets + 1} sets).`, nextSets: rx.sets + 1 }
    return { kind: 'keep', message: `Build up to ${target} s on every set.` }
  }

  const range = rx.reps
  const allTop = !!range && enoughSets && sets.every(s => (s.reps ?? 0) >= range.max && (s.rir !== null || s.toFailure))
  if (allTop) {
    if (load > 0) {
      const inc = def.progression?.loadIncrementKg
      const step = ex.region === 'lower' ? (inc?.lower ?? 4) : (inc?.upper ?? 2)
      const next = roundLoad(load + step)
      return { kind: 'add_load', message: `Top of the range on every set — go to ${next} kg per dumbbell next time (+${step} kg).`, nextLoadKg: next }
    }
    if (usesBands(ex)) return { kind: 'band', message: 'Top of the range on every set — next time use a shorter band, step further from the anchor, or a thicker band.' }
    return { kind: 'bodyweight', message: 'Top of the range on every set — make it harder: slow the lowering to 3 s or pause at the hardest point.' }
  }
  if (isStalled(history)) {
    return {
      kind: 'add_set',
      message: `Stalled two sessions — keep ${load > 0 ? `${load} kg` : 'the same difficulty'} and add a set (${rx.sets + 1} sets).`,
      nextSets: rx.sets + 1,
      nextLoadKg: load > 0 ? load : undefined,
    }
  }
  if (range && sets.some(s => s.rir === null && !s.toFailure)) {
    return { kind: 'keep', message: 'Record RIR on every set so the app can tell when to add load.' }
  }
  return { kind: 'keep', message: range ? `Keep the load and aim for ${range.max} reps on every set.` : 'Keep going at this load.' }
}

// ── Schedule ────────────────────────────────────────────────────────────────

export type WorkoutStatus = 'done' | 'partial' | 'skipped'
export const WORKOUT_STATUSES = ['done', 'partial', 'skipped'] as const
const LIFTED: ReadonlySet<WorkoutStatus> = new Set(['done', 'partial'])

export interface WorkoutSummary {
  id?: string
  date: string
  sessionKey: string
  status: WorkoutStatus
}

export type ScheduleKind = 'session' | 'cardio' | 'rest' | 'walk'

export interface ScheduleDay {
  date: string
  day: Weekday
  kind: ScheduleKind
  sessionKey: string | null
  label: string
  /** Workouts logged that day (any session). */
  workouts: WorkoutSummary[]
  /**
   * Planned session: done / partial / skipped / moved (done on another day this week) / missed (date passed, not
   * done this week) / today / upcoming.
   */
  status: WorkoutStatus | 'moved' | 'missed' | 'today' | 'upcoming' | null
}

/** Lifting sessions in schedule order (A → B → C). */
export function sessionOrder(def: ProgrammeDefinition): string[] {
  const fromSchedule = (def.weeklySchedule?.days ?? [])
    .filter(d => d.kind === 'session' && d.session)
    .sort((a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day))
    .map(d => d.session as string)
  const order = [...new Set(fromSchedule)]
  for (const s of def.trainingSessions) if (!order.includes(s.key)) order.push(s.key)
  return order
}

export function plannedForDate(def: ProgrammeDefinition, date: string) {
  return def.weeklySchedule?.days.find(d => d.day === weekdayOf(date)) ?? null
}

/** The ISO week (Mon–Sun) around `today` with plan + logged status per day. */
export function weekSchedule(def: ProgrammeDefinition, today: string, workouts: readonly WorkoutSummary[]): ScheduleDay[] {
  const monday = weekStart(today)
  return WEEKDAYS.map((day, i) => {
    const date = addDays(monday, i)
    const plan = def.weeklySchedule?.days.find(d => d.day === day) ?? null
    const logged = workouts.filter(w => w.date === date)
    const sessionKey = plan?.kind === 'session' ? plan.session ?? null : null
    let status: ScheduleDay['status'] = null
    if (sessionKey) {
      const own = logged.find(w => w.sessionKey === sessionKey) ?? logged[0]
      const doneElsewhere = workouts.some(w => w.sessionKey === sessionKey && w.date !== date && LIFTED.has(w.status)
        && w.date >= monday && w.date <= addDays(monday, 6))
      if (own) status = own.status
      else if (doneElsewhere) status = 'moved'
      else status = date < today ? 'missed' : date === today ? 'today' : 'upcoming'
    } else if (logged.length > 0) {
      status = logged[0].status
    }
    return { date, day, kind: plan?.kind ?? 'rest', sessionKey, label: plan?.label ?? 'Rest', workouts: logged, status }
  })
}

/** Spacing rule: at least one day between lifting sessions. Returns a warning for training on `date`, or null. */
export function spacingWarning(workouts: readonly WorkoutSummary[], date: string): string | null {
  const lifts = workouts.filter(w => LIFTED.has(w.status))
  if (lifts.some(w => w.date === addDays(date, -1))) return 'You lifted yesterday — the plan keeps at least one day between lifting sessions. Rest today if you can.'
  if (lifts.some(w => w.date === addDays(date, 1))) return 'You have a session logged for tomorrow — keep at least one day between lifting sessions.'
  return null
}

export interface SessionRecommendation {
  /** Session to do today, or null (rest / cardio day, all done, or already trained today). */
  sessionKey: string | null
  /** Planned for today by the weekly schedule. */
  plannedKey: string | null
  reason: string
  warnings: string[]
  /** Sessions still to do this week, in the order they should be done. */
  remaining: string[]
  shortWeek: boolean
  missed: string[]
}

/**
 * Which session to do today (§6.1 schedule rules): keep A → B → C order; missed sessions roll forward; when fewer
 * spaced training days remain than sessions, the week is "cut short" and the programme's priority applies (C first).
 */
export function recommendSession(def: ProgrammeDefinition, today: string, weekWorkouts: readonly WorkoutSummary[]): SessionRecommendation {
  const order = sessionOrder(def)
  const monday = weekStart(today)
  const inWeek = weekWorkouts.filter(w => w.date >= monday && w.date <= addDays(monday, 6))
  const doneKeys = new Set(inWeek.filter(w => LIFTED.has(w.status)).map(w => w.sessionKey))
  const plan = plannedForDate(def, today)
  const plannedKey = plan?.kind === 'session' ? plan.session ?? null : null
  const remainingInOrder = order.filter(k => !doneKeys.has(k))
  const schedule = weekSchedule(def, today, inWeek)
  const missed = schedule.filter(d => d.status === 'missed' && d.sessionKey && !doneKeys.has(d.sessionKey)).map(d => d.sessionKey as string)

  const base = { plannedKey, warnings: [] as string[], missed }
  if (remainingInOrder.length === 0) {
    return { ...base, sessionKey: null, reason: 'All sessions done this week — well done.', remaining: [], shortWeek: false }
  }
  if (inWeek.some(w => w.date === today && LIFTED.has(w.status))) {
    return { ...base, sessionKey: null, reason: 'You have trained today.', remaining: remainingInOrder, shortWeek: false }
  }

  // Spaced lifting days left this week, counting today: today, today+2, …, up to Sunday.
  const daysLeft = daysBetween(today, addDays(monday, 6)) + 1
  const liftedYesterday = inWeek.some(w => w.date === addDays(today, -1) && LIFTED.has(w.status))
  const slots = liftedYesterday ? Math.floor(daysLeft / 2) : Math.ceil(daysLeft / 2)
  const shortWeek = remainingInOrder.length > slots
  let remaining = remainingInOrder
  if (shortWeek) {
    const priority = def.weeklySchedule?.shortWeekPriority ?? []
    const ranked = [...priority.filter(k => remainingInOrder.includes(k)), ...remainingInOrder.filter(k => !priority.includes(k))]
    remaining = ranked.slice(0, Math.max(slots, 0))
  }

  const spacing = spacingWarning(inWeek, today)
  const isTrainingDay = plannedKey !== null || missed.length > 0 || shortWeek
  if (!isTrainingDay || remaining.length === 0) {
    return { ...base, sessionKey: null, reason: plan ? plan.label : 'Rest day.', remaining, shortWeek }
  }
  if (spacing && plannedKey === null) {
    return { ...base, sessionKey: null, reason: 'Rest today — you lifted yesterday. Catch up tomorrow.', remaining, shortWeek }
  }

  const sessionKey = remaining[0]
  const name = (k: string) => def.trainingSessions.find(s => s.key === k)?.name ?? k.toUpperCase()
  let reason: string
  if (shortWeek) reason = `Week cut short — ${remaining.length === 1 ? 'one session fits' : `${remaining.length} sessions fit`}: do ${remaining.map(name).join(', then ')}.`
  else if (plannedKey && sessionKey === plannedKey) reason = `${name(sessionKey)} is planned for today.`
  else if (plannedKey) reason = `Keep the A → B → C order: ${name(sessionKey)} before ${name(plannedKey)}.`
  else reason = `${name(sessionKey)} was missed — catch up today (no lift yesterday).`
  const warnings = spacing ? [spacing] : []
  if (missed.length > 0 && !shortWeek) warnings.push(`Missed this week: ${missed.map(name).join(', ')}. Sessions roll forward in order.`)
  return { ...base, sessionKey, reason, warnings, remaining, shortWeek }
}

/** Warning when the user starts a session out of A → B → C order this week. */
export function orderWarning(def: ProgrammeDefinition, sessionKey: string, weekWorkouts: readonly WorkoutSummary[]): string | null {
  const order = sessionOrder(def)
  const done = new Set(weekWorkouts.filter(w => LIFTED.has(w.status)).map(w => w.sessionKey))
  const before = order.slice(0, order.indexOf(sessionKey)).filter(k => !done.has(k))
  if (before.length === 0) return null
  const name = (k: string) => def.trainingSessions.find(s => s.key === k)?.name ?? k
  return `Out of order — ${before.map(name).join(' and ')} not done yet this week (A → B → C).`
}

// ── Pre-training coffee (timing rule) ───────────────────────────────────────

/**
 * Pre-training coffee recommendation on a training day that is not yet done: before the caffeine cut-off →
 * "black coffee ~45 min before if you train before the cut-off"; at/after the cut-off → "skip the pre-training coffee".
 * Null on non-training days, when already trained, or without a cut-off.
 */
export function preTrainingCoffee(cutoff: string | null, now: string, trainingToday: boolean, trainedToday: boolean): { key: string; message: string } | null {
  if (!cutoff || !trainingToday || trainedToday) return null
  if (now < cutoff) {
    return {
      key: 'timing.pre_training_coffee',
      message: `Training today: if you train before ${cutoff}, a black coffee about 45 min before helps. Training this evening? Skip the pre-training coffee.`,
    }
  }
  return {
    key: 'timing.pre_training_coffee',
    message: `Evening training: skip the pre-training coffee — it's past your ${cutoff} caffeine cut-off.`,
  }
}

// ── Workout input (API boundary) ────────────────────────────────────────────

const KeyRe = /^[a-z][a-z0-9_]{0,39}$/

export const WorkoutInputSchema = z.object({
  date:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  sessionKey:      z.string().regex(KeyRe),
  status:          z.enum(WORKOUT_STATUSES),
  skipReason:      z.string().trim().min(1).max(300).nullable().optional(),
  travelMode:      z.boolean().default(false),
  durationMinutes: z.number().int().min(0).max(600).nullable().optional(),
  notes:           z.string().trim().max(1000).nullable().optional(),
  exercises:       z.array(z.object({
    exerciseKey: z.string().regex(KeyRe),
    sets:        z.array(LoggedSetSchema).max(20),
  })).max(40).default([]),
  skippedExercises: z.array(z.object({ exerciseKey: z.string().regex(KeyRe), reason: z.string().trim().max(200).default('') })).max(40).default([]),
  /** During-session joint pain 0–10 (pain-check sessions). */
  duringPain:      z.number().int().min(0).max(10).nullable().optional(),
}).strict().superRefine((w, ctx) => {
  if (w.status === 'skipped' && !w.skipReason) ctx.addIssue({ code: 'custom', path: ['skipReason'], message: 'Give a reason for skipping' })
  if (w.status === 'done' && !w.exercises.some(e => e.sets.length > 0)) {
    ctx.addIssue({ code: 'custom', path: ['exercises'], message: 'Log at least one set, or mark the session partial / skipped' })
  }
})
export type WorkoutInput = z.infer<typeof WorkoutInputSchema>

/**
 * Server-side checks against the programme: the session exists, every exercise belongs to it (or is an unlocked
 * movement hosted by it), and no sets are logged for exercises that are disabled by an open red flag.
 * Returns an error message or null.
 */
export function validateWorkoutAgainstProgramme(
  def: ProgrammeDefinition,
  input: Pick<WorkoutInput, 'sessionKey' | 'exercises' | 'status'>,
  ctx: { availableUnlocks: readonly string[]; jointStopped: boolean },
): string | null {
  const session = def.trainingSessions.find(s => s.key === input.sessionKey)
  if (!session) return 'Unknown session'
  if (input.status === 'skipped') return null
  const hosted = unlockHostSession(def) === session.key ? ctx.availableUnlocks : []
  for (const e of input.exercises) {
    const ex = session.exercises.find(x => x.key === e.exerciseKey) ?? (hosted.includes(e.exerciseKey) ? UNLOCK_EXERCISES[e.exerciseKey] : undefined)
    if (!ex) return `Exercise ${e.exerciseKey} is not part of ${session.name}`
    if (ctx.jointStopped && ex.jointWatch && e.sets.length > 0) {
      return 'Joint-watched exercises are paused until your physiotherapist clears the red flag'
    }
    const seen = new Set<string>()
    for (const s of e.sets) {
      const k = `${s.setIndex}:${s.isDropSet}`
      if (seen.has(k)) return `Duplicate set ${s.setIndex + 1} for ${ex.name}`
      seen.add(k)
    }
  }
  return null
}

/** Find an exercise in a session, including unlocked movements it hosts. */
export function findExercise(def: ProgrammeDefinition, sessionKey: string, exerciseKey: string): Exercise | null {
  const session = def.trainingSessions.find(s => s.key === sessionKey)
  return session?.exercises.find(e => e.key === exerciseKey) ?? UNLOCK_EXERCISES[exerciseKey] ?? null
}

// ── Player / history helpers ────────────────────────────────────────────────

/** Drop-set weight: 30% off, rounded to 0.5 kg. */
export function dropSetLoad(kg: number): number {
  return roundLoad(kg * 0.7)
}

/** Starting load for today: the progression suggestion, else last time's top load; scaled in a light week. */
export function suggestedStartLoad(lastSets: readonly LoggedSet[] | null, suggestion: ProgressionSuggestion | null, loadFactor: number | null): number | null {
  const base = suggestion?.nextLoadKg ?? (lastSets && topLoad(lastSets) > 0 ? topLoad(lastSets) : null)
  if (base === null) return null
  return loadFactor ? roundLoad(base * loadFactor) : base
}

export function formatLoggedSet(s: LoggedSet): string {
  const parts: string[] = []
  if (s.loadKg !== null && s.loadKg > 0) parts.push(`${s.loadKg} kg`)
  if (s.reps !== null) parts.push(`${parts.length ? '× ' : ''}${s.reps}`)
  if (s.holdSeconds !== null) parts.push(`${s.holdSeconds} s`)
  let out = parts.join(' ') || '—'
  if (s.toFailure) out += ' · failure'
  else if (s.rir !== null) out += ` · RIR ${s.rir}`
  if (s.isDropSet) out = `drop: ${out}`
  return out
}

/** Chart series: top working-set load per session (holds → longest hold). */
export function topSetSeries(history: readonly ExercisePerformance[]): Array<{ date: string; value: number | null }> {
  return history.map(h => {
    const w = working(h.sets)
    const load = topLoad(w)
    if (load > 0) return { date: h.date, value: load }
    const hold = Math.max(0, ...w.map(s => s.holdSeconds ?? 0))
    return { date: h.date, value: hold > 0 ? hold : null }
  })
}
