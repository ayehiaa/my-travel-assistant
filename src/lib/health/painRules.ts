import { z } from 'zod'
import type { ProgrammeDefinition } from './programmeSchema'
import type { Exercise } from './training'
import { addDays } from './time'

/**
 * Joint / pain rules (specs/029 US6, §6.1 safety). Pure. Driven by the programme's `painRules` and
 * `movementRestrictions`; the wording of red-flag actions is the programme's fixed text, never AI.
 *
 * Per pain-check session:
 *  - red flag recorded (e.g. locking, giving way, new swelling)                 → 'red_flag'
 *  - during-session pain > threshold, next-morning pain > threshold, swelling,
 *    or pain worse next morning than during the session ("next-day soreness")  → 'reduce'
 *  - next-morning check still missing (when the programme asks for one)          → 'pending'
 *  - otherwise (≤ threshold and settled next morning)                             → 'ok'
 */

export type PainRules = NonNullable<ProgrammeDefinition['painRules']>

export interface JointCheck {
  id?: string
  workoutId?: string
  /** Date of the session. */
  date: string
  sessionKey: string
  duringPain: number | null
  nextMorningPain: number | null
  swelling: boolean
  redFlags: string[]
  physioCleared: boolean
  clearedOn: string | null
}

export type CheckOutcome = 'ok' | 'pending' | 'reduce' | 'red_flag'

export function evaluateJointCheck(rules: PainRules, c: JointCheck): CheckOutcome {
  if (c.redFlags.length > 0) return 'red_flag'
  const t = rules.okThreshold
  if (c.duringPain !== null && c.duringPain > t) return 'reduce'
  if (c.swelling) return 'reduce'
  if (c.nextMorningPain !== null) {
    if (c.nextMorningPain > t) return 'reduce'
    if (c.duringPain !== null && c.nextMorningPain > c.duringPain) return 'reduce'
    return 'ok'
  }
  return rules.nextDayCheck ? 'pending' : 'ok'
}

export interface JointStatus {
  level: 'ok' | 'reduce' | 'stop'
  message: string | null
  /** Red-flag check awaiting clearance (for the "my physio has cleared me" button). */
  uncleared: JointCheck | null
  /** Check that set the current level. */
  basis: JointCheck | null
}

const byDate = (a: JointCheck, b: JointCheck) => a.date.localeCompare(b.date)

/**
 * Status for the NEXT session: any red flag without recorded clearance → 'stop' (joint-watched exercises disabled);
 * the latest check → 'reduce' when it failed the rule; otherwise 'ok'. A cleared red flag counts as 'reduce' for the
 * very next session only when it is still the latest check (conservative restart).
 */
export function jointStatus(rules: PainRules | undefined, checks: readonly JointCheck[]): JointStatus {
  if (!rules || checks.length === 0) return { level: 'ok', message: null, uncleared: null, basis: null }
  const sorted = [...checks].sort(byDate)
  const uncleared = [...sorted].reverse().find(c => c.redFlags.length > 0 && !c.physioCleared) ?? null
  if (uncleared) return { level: 'stop', message: rules.redFlagAction, uncleared, basis: uncleared }
  const latest = sorted[sorted.length - 1]
  const outcome = evaluateJointCheck(rules, latest)
  if (outcome === 'reduce' || outcome === 'red_flag') return { level: 'reduce', message: rules.reduceAction, uncleared: null, basis: latest }
  return { level: 'ok', message: null, uncleared: null, basis: latest }
}

/** Pain rule passed for the last `n` pain-check sessions (each ≤ threshold AND settled next morning). */
export function painRulePassed(rules: PainRules | undefined, checks: readonly JointCheck[], n = 2): boolean {
  if (!rules) return false
  const sorted = [...checks].sort(byDate)
  if (sorted.length < n) return false
  return sorted.slice(-n).every(c => evaluateJointCheck(rules, c) === 'ok')
}

/**
 * Recovery OK (P2 — intervals unlock): no red flag among the last `n` pain-check sessions and none uncleared, and at
 * least `need` of the last `n` sessions passed the pain rule. Fewer than `need` sessions → false.
 */
export function recoveryOk(rules: PainRules | undefined, checks: readonly JointCheck[], n = 3, need = 2): boolean {
  if (!rules) return true
  if (checks.some(c => c.redFlags.length > 0 && !c.physioCleared)) return false
  const recent = [...checks].sort(byDate).slice(-n)
  if (recent.some(c => c.redFlags.length > 0)) return false
  return recent.filter(c => evaluateJointCheck(rules, c) === 'ok').length >= need
}

export interface ExerciseSafety {
  disabled: boolean
  warning: string | null
  /** Progression suggestions are suppressed for this exercise. */
  suppressProgression: boolean
}

/** What the player shows for one exercise given the joint status. Only joint-watched exercises are affected. */
export function exerciseSafety(ex: Pick<Exercise, 'jointWatch'>, status: JointStatus): ExerciseSafety {
  if (!ex.jointWatch || status.level === 'ok') return { disabled: false, warning: null, suppressProgression: false }
  if (status.level === 'stop') {
    return { disabled: true, warning: status.message ?? 'Stop and see your physiotherapist.', suppressProgression: true }
  }
  return { disabled: false, warning: status.message ?? 'Shorten the range or reduce the load.', suppressProgression: true }
}

/** How many days after a pain-check session the next-morning prompt is shown on Today. */
export const NEXT_MORNING_PROMPT_DAYS = 2

/**
 * The pain-check session awaiting its next-morning check (shown on Today): the latest check from a session before
 * today, within the prompt window, without a next-morning answer. Null when nothing is due.
 */
export function nextMorningDue(rules: PainRules | undefined, checks: readonly JointCheck[], today: string): JointCheck | null {
  if (!rules?.nextDayCheck) return null
  const due = [...checks]
    .sort(byDate)
    .reverse()
    .find(c => c.date < today && c.date >= addDays(today, -NEXT_MORNING_PROMPT_DAYS))
  if (!due || due.nextMorningPain !== null || due.redFlags.length > 0) return null
  return due
}

function rowNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** health_joint_checks row → JointCheck. */
export function rowToJointCheck(r: Record<string, unknown>): JointCheck {
  return {
    id: String(r.id),
    workoutId: String(r.workout_id),
    date: String(r.local_date),
    sessionKey: String(r.session_key),
    duringPain: rowNum(r.during_pain),
    nextMorningPain: rowNum(r.next_morning_pain),
    swelling: r.swelling === true,
    redFlags: Array.isArray(r.red_flags) ? (r.red_flags as string[]) : [],
    physioCleared: r.physio_cleared === true,
    clearedOn: (r.cleared_on as string | null) ?? null,
  }
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export const PainScoreSchema = z.number().int().min(0).max(10)

export const NextMorningInputSchema = z.object({
  action:          z.literal('next_morning'),
  checkId:         z.string().uuid(),
  nextMorningPain: PainScoreSchema,
  swelling:        z.boolean(),
  redFlags:        z.array(z.string().trim().min(1).max(200)).max(20).default([]),
})

export const ClearanceInputSchema = z.object({
  action:  z.literal('clearance'),
  checkId: z.string().uuid(),
})

export const JointCheckInputSchema = z.discriminatedUnion('action', [NextMorningInputSchema, ClearanceInputSchema])

/** Keep only red flags the programme defines (no free text stored). */
export function knownRedFlags(rules: PainRules | undefined, flags: readonly string[]): string[] {
  const allowed = new Set(rules?.redFlags ?? [])
  return [...new Set(flags)].filter(f => allowed.has(f))
}

export function outcomeLabel(o: CheckOutcome): string {
  return o === 'ok' ? 'OK' : o === 'pending' ? 'Next-morning check due' : o === 'reduce' ? 'Reduce range / load' : 'Red flag — stop'
}
