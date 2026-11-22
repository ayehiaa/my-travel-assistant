import { z } from 'zod'
import { HhMmSchema, type ProgrammeDefinition } from './programmeSchema'
import { addDays, daysBetween, hhmmToMinutes, isValidDate, minutesToHhmm } from './time'

/**
 * Morning check-in maths (specs/029 US2). Pure.
 * Weight is shown as a 7-day average (daily weight is mostly water); sleep duration crosses midnight.
 */

export const CheckinInputSchema = z.object({
  date:       z.string().refine(isValidDate, { message: 'Invalid date' }),
  weightKg:   z.number().min(30).max(350).nullable().optional(),
  bedTime:    HhMmSchema.nullable().optional(),
  wakeTime:   HhMmSchema.nullable().optional(),
  supplementsTaken: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)).max(20).default([]),
}).strict()
export type CheckinInput = z.infer<typeof CheckinInputSchema>

export interface WeighIn { date: string; weightKg: number }

/** Minimum weigh-ins in a 7-day window for an average to be shown. */
export const MIN_WEIGH_INS_FOR_AVERAGE = 3

const round2 = (v: number) => Math.round(v * 100) / 100

/** Average of the weigh-ins in the 7 days ending on `endDate` (inclusive). Null when fewer than 3. */
export function sevenDayAverage(weighIns: WeighIn[], endDate: string): { avg: number; count: number } | null {
  const start = addDays(endDate, -6)
  const inWindow = weighIns.filter(w => w.date >= start && w.date <= endDate && Number.isFinite(w.weightKg))
  if (inWindow.length < MIN_WEIGH_INS_FOR_AVERAGE) return null
  const avg = inWindow.reduce((s, w) => s + w.weightKg, 0) / inWindow.length
  return { avg: round2(avg), count: inWindow.length }
}

/** One 7-day-average point per day from `from` to `to` (null where there is not enough data). */
export function sevenDayAverageSeries(weighIns: WeighIn[], from: string, to: string): Array<{ date: string; avg: number | null }> {
  const out: Array<{ date: string; avg: number | null }> = []
  const n = daysBetween(from, to)
  for (let i = 0; i <= n; i++) {
    const date = addDays(from, i)
    out.push({ date, avg: sevenDayAverage(weighIns, date)?.avg ?? null })
  }
  return out
}

export type TrendDirection = 'down' | 'up' | 'flat'

export interface WeightTrend {
  /** Current 7-day average. */
  average: number | null
  /** Most recent single weigh-in (shown small). */
  latest: WeighIn | null
  /** 7-day average now minus 7 days ago (kg); negative = loss. */
  weeklyChangeKg: number | null
  /** Same as a % of the earlier average. */
  weeklyChangePct: number | null
  direction: TrendDirection | null
  /** Rate of loss per week (positive = losing). */
  lossPerWeekKg: number | null
}

/** Trend for the Today card and Progress tab. ±0.1 kg counts as flat. */
export function weightTrend(weighIns: WeighIn[], today: string): WeightTrend {
  const sorted = [...weighIns].filter(w => w.date <= today).sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1] ?? null
  const now = sevenDayAverage(sorted, today)
  const before = sevenDayAverage(sorted, addDays(today, -7))
  if (!now || !before) {
    return { average: now?.avg ?? null, latest, weeklyChangeKg: null, weeklyChangePct: null, direction: null, lossPerWeekKg: null }
  }
  const change = round2(now.avg - before.avg)
  return {
    average: now.avg,
    latest,
    weeklyChangeKg: change,
    weeklyChangePct: round2((change / before.avg) * 100),
    direction: Math.abs(change) < 0.1 ? 'flat' : change < 0 ? 'down' : 'up',
    lossPerWeekKg: round2(-change),
  }
}

/** Water-weight note (e.g. creatine) shown during the first N weeks after the programme start. */
export function waterWeightNote(def: ProgrammeDefinition, startDate: string, today: string): string | null {
  const days = daysBetween(startDate, today)
  if (days < 0) return null
  for (const s of def.supplements) {
    if (s.waterWeightWeeks && days < s.waterWeightWeeks * 7) {
      const caveat = s.caveats[0] ? ` (${s.caveats[0].toLowerCase()})` : ''
      return `${s.name} holds extra water in the first ${s.waterWeightWeeks} weeks${caveat}, so the scale may not move yet. ` +
        'Use your waist measurement as the main progress metric for now.'
    }
  }
  return null
}

// ── Sleep ───────────────────────────────────────────────────────────────────

/** Minutes asleep from bed → wake (wake ≤ bed means the next morning). Null for invalid times. */
export function sleepDurationMinutes(bedTime: string | null | undefined, wakeTime: string | null | undefined): number | null {
  const bed = bedTime ? hhmmToMinutes(bedTime) : null
  const wake = wakeTime ? hhmmToMinutes(wakeTime) : null
  if (bed === null || wake === null) return null
  const d = wake > bed ? wake - bed : wake + 1440 - bed
  return d === 1440 ? null : d
}

/** Bedtimes around midnight on one scale: times before noon count as "after midnight" (+24 h). */
function bedScale(minutes: number): number {
  return minutes < 720 ? minutes + 1440 : minutes
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface SleepNight { date: string; bedTime: string | null; wakeTime: string | null }

export interface SleepSummary {
  /** Last night's duration (the check-in for `today`). */
  lastNightMinutes: number | null
  averageMinutes: number | null
  /** Typical bed / wake time (median of the window). */
  typicalBedTime: string | null
  typicalWakeTime: string | null
  /** Nights whose bed AND wake time are within ±window of the typical times. */
  consistentNights: number
  nights: number
  windowMinutes: number
  /** Within the programme's duration range (null when unknown). */
  durationOk: boolean | null
}

/** Sleep for the last 7 check-ins up to `today` (consistency vs the programme's ±window, default 30 min). */
export function sleepSummary(nights: SleepNight[], today: string, def?: ProgrammeDefinition | null): SleepSummary {
  const windowMinutes = def?.sleep?.consistencyMinutes ?? 30
  const start = addDays(today, -6)
  const recent = nights
    .filter(n => n.date >= start && n.date <= today)
    .map(n => ({ ...n, bed: n.bedTime ? hhmmToMinutes(n.bedTime) : null, wake: n.wakeTime ? hhmmToMinutes(n.wakeTime) : null }))
    .filter((n): n is typeof n & { bed: number; wake: number } => n.bed !== null && n.wake !== null)

  const last = nights.find(n => n.date === today)
  const lastNightMinutes = last ? sleepDurationMinutes(last.bedTime, last.wakeTime) : null

  if (recent.length === 0) {
    return { lastNightMinutes, averageMinutes: null, typicalBedTime: null, typicalWakeTime: null, consistentNights: 0, nights: 0, windowMinutes, durationOk: null }
  }
  const durations = recent.map(n => sleepDurationMinutes(n.bedTime, n.wakeTime)).filter((d): d is number => d !== null)
  const averageMinutes = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null
  const bedMedian = median(recent.map(n => bedScale(n.bed)))
  const wakeMedian = median(recent.map(n => n.wake))
  const consistentNights = recent.filter(n =>
    Math.abs(bedScale(n.bed) - bedMedian) <= windowMinutes && Math.abs(n.wake - wakeMedian) <= windowMinutes,
  ).length
  const range = def?.sleep?.durationHours
  const durationOk = range && averageMinutes !== null
    ? averageMinutes >= range[0] * 60 && averageMinutes <= range[1] * 60
    : null
  return {
    lastNightMinutes,
    averageMinutes,
    typicalBedTime: minutesToHhmm(bedMedian),
    typicalWakeTime: minutesToHhmm(wakeMedian),
    consistentNights,
    nights: recent.length,
    windowMinutes,
    durationOk,
  }
}

/** "7 h 20 min" */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
