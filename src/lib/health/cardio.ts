import { z } from 'zod'
import type { ProgrammeDefinition } from './programmeSchema'
import { isValidDate, weekStart, addDays } from './time'

/**
 * Cardio and daily steps (specs/029 US7, phase P2). Pure. Decisions in plan.md (P2 section).
 * - Type comes from the programme's allowed list; avoid-list types need an explicit confirmation before saving.
 * - Average HR is optional and flagged when outside the programme's zone bpm range.
 * - Weekly minutes vs sessions × minutes (seed 4 × 30 = 120).
 * - Steps are entered by hand (owner decision §12.2), compared with the programme range (seed 8,000–10,000).
 * - Intervals (seed "6 × 1 min / 2 min") unlock from the configured week only when the pain rule passes AND
 *   recovery is OK (no red flags and ≥2 of the last 3 pain-check sessions OK — painRules.recoveryOk).
 */

export const INTERVALS_KEY = 'intervals'
export const INTERVALS_PRESCRIPTION = '6 × 1 min hard / 2 min easy, on the bike (saddle high)'

export const CardioInputSchema = z.object({
  date:         z.string().refine(isValidDate, { message: 'Invalid date' }),
  type:         z.string().trim().min(1).max(80),
  minutes:      z.number().int().min(1).max(300),
  avgHr:        z.number().int().min(40).max(220).nullable().optional(),
  intervals:    z.boolean().default(false),
  /** Set by the client after the user confirmed an avoid-list type. */
  confirmAvoid: z.boolean().default(false),
  notes:        z.string().trim().max(500).nullable().optional(),
}).strict()
export type CardioInput = z.infer<typeof CardioInputSchema>

export const StepsInputSchema = z.object({
  date:  z.string().refine(isValidDate, { message: 'Invalid date' }),
  steps: z.number().int().min(0).max(100000),
}).strict()

export type CardioTypeClass = 'allowed' | 'avoid' | 'other'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Cardio types the logger offers: the programme's allowed list (or its types), never the avoid list. */
export function cardioTypeOptions(def: ProgrammeDefinition): string[] {
  const c = def.cardio
  if (!c) return ['Walk', 'Bike']
  return c.allowed.length > 0 ? [...c.allowed] : [...c.types]
}

export function classifyCardioType(def: ProgrammeDefinition, type: string): CardioTypeClass {
  const t = norm(type)
  const c = def.cardio
  if (!c) return 'other'
  if (c.avoid.some(a => norm(a) === t)) return 'avoid'
  if ([...c.allowed, ...c.types].some(a => norm(a) === t)) return 'allowed'
  return 'other'
}

export type HrFlag = 'below' | 'in_zone' | 'above'

export function hrZoneFlag(def: ProgrammeDefinition, avgHr: number | null | undefined): HrFlag | null {
  const z = def.cardio?.intensity
  if (avgHr === null || avgHr === undefined || !z || (z.bpmMin === undefined && z.bpmMax === undefined)) return null
  if (z.bpmMin !== undefined && avgHr < z.bpmMin) return 'below'
  if (z.bpmMax !== undefined && avgHr > z.bpmMax) return 'above'
  return 'in_zone'
}

export function hrFlagMessage(def: ProgrammeDefinition, flag: HrFlag | null): string | null {
  const z = def.cardio?.intensity
  if (!flag || flag === 'in_zone' || !z) return null
  const range = `${z.bpmMin ?? '?'}–${z.bpmMax ?? '?'} bpm`
  return flag === 'above'
    ? `Average heart rate above ${z.zone} (${range}) — slow down so you can still talk in full sentences.`
    : `Average heart rate below ${z.zone} (${range}) — pick up the pace a little.`
}

export interface CardioSession {
  id?: string
  date: string
  type: string
  minutes: number
  avgHr: number | null
  intervals: boolean
}

export interface WeeklyCardio {
  weekStart: string
  minutes: number
  sessions: number
  targetMinutes: number | null
  targetSessions: number | null
  met: boolean
}

/** Minutes and sessions in the ISO week of `date` vs the programme target (sessions × minutes). */
export function weeklyCardio(def: ProgrammeDefinition, sessions: readonly CardioSession[], date: string): WeeklyCardio {
  const monday = weekStart(date)
  const sunday = addDays(monday, 6)
  const inWeek = sessions.filter(s => s.date >= monday && s.date <= sunday)
  const minutes = inWeek.reduce((t, s) => t + s.minutes, 0)
  const per = def.cardio?.minutes
  const n = def.cardio?.sessionsPerWeek
  const targetMinutes = per !== undefined && n !== undefined ? per * n : null
  return {
    weekStart: monday,
    minutes,
    sessions: inWeek.length,
    targetMinutes,
    targetSessions: n ?? null,
    met: targetMinutes !== null ? minutes >= targetMinutes : false,
  }
}

export type StepsStatus = 'below' | 'in_range' | 'above'

export function stepsStatus(def: ProgrammeDefinition, steps: number | null): StepsStatus | null {
  const m = def.dailyMovement
  if (steps === null || !m) return null
  if (steps < m.stepsMin) return 'below'
  if (m.stepsMax !== undefined && steps > m.stepsMax) return 'above'
  return 'in_range'
}

export function stepsTargetLabel(def: ProgrammeDefinition): string | null {
  const m = def.dailyMovement
  if (!m) return null
  const f = (n: number) => n.toLocaleString('en-GB')
  return m.stepsMax !== undefined ? `${f(m.stepsMin)}–${f(m.stepsMax)}` : `${f(m.stepsMin)}+`
}

export interface IntervalsUnlock {
  available: boolean
  fromWeek: number | null
  reason: string
  prescription: string
}

/**
 * Optional intervals: from the configured week (seed: 5) only if the pain rule passes and recovery is OK.
 * No unlockable in the programme → not available.
 */
export function intervalsUnlock(
  def: ProgrammeDefinition,
  ctx: { week: number | null; painRulePassed: boolean; recoveryOk: boolean },
): IntervalsUnlock {
  const u = def.cardio?.unlockables.find(x => /interval/i.test(x.name)) ?? null
  const base = { fromWeek: u?.fromWeek ?? null, prescription: INTERVALS_PRESCRIPTION }
  if (!u) return { ...base, available: false, reason: 'Your programme has no intervals option.' }
  if (u.fromWeek !== undefined && (ctx.week === null || ctx.week < u.fromWeek)) {
    return { ...base, available: false, reason: `Intervals unlock from week ${u.fromWeek}.` }
  }
  if (!ctx.painRulePassed) return { ...base, available: false, reason: 'Unlocks once the pain rule has passed for your last two pain-check sessions.' }
  if (!ctx.recoveryOk) return { ...base, available: false, reason: 'Unlocks when recovery is OK: no red flags and at least 2 of your last 3 pain-check sessions OK.' }
  return { ...base, available: true, reason: u.condition ?? 'Recovery OK and joints quiet — one interval session may replace a Zone 2 session.' }
}

/** Validate a cardio input against the programme. Returns an error message or a warning requiring confirmation. */
export function checkCardioInput(
  def: ProgrammeDefinition,
  input: Pick<CardioInput, 'type' | 'intervals' | 'confirmAvoid'>,
  unlock: IntervalsUnlock,
): { ok: true } | { ok: false; status: 400 | 409; error: string; needsConfirmation?: boolean } {
  if (input.intervals && !unlock.available) return { ok: false, status: 400, error: unlock.reason }
  if (classifyCardioType(def, input.type) === 'avoid' && !input.confirmAvoid) {
    return { ok: false, status: 409, needsConfirmation: true, error: `${input.type} is on your programme's avoid list — save it anyway?` }
  }
  return { ok: true }
}

export function rowToCardio(r: Record<string, unknown>): CardioSession {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    id: String(r.id),
    date: String(r.local_date),
    type: String(r.cardio_type),
    minutes: Number(r.minutes) || 0,
    avgHr: n(r.avg_hr),
    intervals: r.intervals === true,
  }
}
