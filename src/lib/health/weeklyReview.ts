import type { ProgrammeDefinition } from './programmeSchema'
import type { EffectiveTargets } from './targets'
import type { WeighIn, SleepNight } from './checkin'
import { sevenDayAverage, sleepSummary } from './checkin'
import { sumComponents, sumNutrients, type NutrientLike } from './nutrition'
import type { CardioSession } from './cardio'
import { weeklyCardio } from './cardio'
import type { WaistMeasurement } from './measurements'
import { addDays, daysBetween, starterWeekRangeLabel, weekWindow } from './time'
import { weeklyComponentTarget } from './nutrition'
import { sessionsForWeek } from './training'

/**
 * Weekly review (specs/029 US10, phase P2). Pure: stats for one ISO week (Mon–Sun) + top-3 focus points from
 * deterministic templates. With `startDate`, a starter week (P3.2) is reviewed from the start date to Sunday:
 * planned sessions = scheduled in that window, cardio + weekly component targets pro-rated. Stored per week (health_weekly_reviews.data) and listed on Progress.
 */

export interface ReviewDayFood { date: string; items: Array<NutrientLike & { components?: Record<string, number> | null }> }

export interface WeeklyReviewInput {
  def: ProgrammeDefinition
  targets: EffectiveTargets
  /** Monday of the ISO week (the review's key). */
  weekStart: string
  /** Programme start date: a starter week (non-Monday start) is reviewed from the start date to Sunday (P3.2). */
  startDate?: string
  /** Days of the window counted so far (all for a finished week; fewer for "this week so far"). */
  daysElapsed?: number
  food: ReviewDayFood[]
  workouts: Array<{ date: string; status: 'done' | 'partial' | 'skipped' }>
  cardio: CardioSession[]
  steps: Array<{ date: string; steps: number }>
  sleep: SleepNight[]
  weighIns: WeighIn[]
  waist: WaistMeasurement[]
}

export interface ComponentAdherence {
  key: string
  name: string
  period: 'day' | 'week'
  /** Daily components: days the target was hit. Weekly: amount this week. */
  value: number
  /** Daily: days counted. Weekly: weekly target (pro-rated in the starter week). */
  of: number
  /** Weekly: "pro-rated for a 3-day starter week" / "not due this week". */
  note?: string | null
}

export interface WeeklyReview {
  /** Monday of the ISO week (storage key). */
  weekStart: string
  weekEnd: string
  /** First counted day: the start date in the starter week, else the Monday. Absent on reviews stored before P3.2. */
  windowStart?: string
  /** Days in the window (starter week: start..Sunday; else 7). Absent on older reviews (= 7). */
  windowDays?: number
  /** Starter week review. */
  starter?: boolean
  /** "Starter week (Fri–Sun)" for a starter week; null otherwise. */
  label?: string | null
  daysCounted: number
  daysLogged: number
  components: ComponentAdherence[]
  proteinDays: number
  satFatWithinTargetDays: number
  satFatWithinCeilingDays: number
  sessions: { done: number; partial: number; planned: number }
  cardio: { minutes: number; target: number | null }
  steps: { average: number | null; daysLogged: number; min: number | null }
  sleep: { averageMinutes: number | null; consistentNights: number; nights: number; windowMinutes: number }
  weight: { average: number | null; previousAverage: number | null; changeKg: number | null }
  waist: { latestCm: number | null; changeCm: number | null }
  focus: string[]
}

const r1 = (v: number) => Math.round(v * 10) / 10

export function computeWeeklyReview(input: WeeklyReviewInput): WeeklyReview {
  const { def, targets, weekStart } = input
  const weekEnd = addDays(weekStart, 6)
  const win = input.startDate ? weekWindow(input.startDate, weekStart) : null
  const starter = !!win?.isStarter
  const windowStart = starter ? win!.weekStart : weekStart
  const windowDays = daysBetween(windowStart, weekEnd) + 1
  const daysCounted = Math.min(windowDays, Math.max(1, input.daysElapsed ?? windowDays))
  const lastDay = addDays(windowStart, daysCounted - 1)
  const dates = Array.from({ length: daysCounted }, (_, i) => addDays(windowStart, i))
  const byDate = new Map<string, ReviewDayFood['items']>()
  for (const d of input.food) if (d.date >= windowStart && d.date <= lastDay) byDate.set(d.date, [...(byDate.get(d.date) ?? []), ...d.items])
  const daysLogged = dates.filter(d => (byDate.get(d) ?? []).length > 0).length

  const dayTotals = dates.map(d => ({ n: sumNutrients(byDate.get(d) ?? []), c: sumComponents(byDate.get(d) ?? []), logged: (byDate.get(d) ?? []).length > 0 }))
  const weekComp = sumComponents(dates.flatMap(d => byDate.get(d) ?? []))

  const components: ComponentAdherence[] = def.components.map(c => {
    if (c.period === 'day') return { key: c.key, name: c.name, period: 'day', value: dayTotals.filter(t => (t.c[c.key] ?? 0) >= c.target).length, of: daysCounted }
    const wt = weeklyComponentTarget(c.target, input.startDate, weekStart)
    return { key: c.key, name: c.name, period: 'week', value: r1(weekComp[c.key] ?? 0), of: wt.target, note: wt.notDue ? 'not due this week' : wt.note }
  })

  const proteinDays = dayTotals.filter(t => t.n.proteinG >= targets.proteinG).length
  const satFatWithinTargetDays = dayTotals.filter(t => t.logged && t.n.satFatG <= targets.satFatTargetG).length
  const satFatWithinCeilingDays = dayTotals.filter(t => t.logged && t.n.satFatG <= targets.satFatCeilingG).length

  const wk = input.workouts.filter(w => w.date >= windowStart && w.date <= weekEnd)
  const planned = starter
    ? sessionsForWeek(def, weekStart, input.startDate).length
    : def.weeklySchedule?.days.filter(d => d.kind === 'session').length ?? def.trainingSessions.length
  const sessions = { done: wk.filter(w => w.status === 'done').length, partial: wk.filter(w => w.status === 'partial').length, planned }

  const wc = weeklyCardio(def, input.cardio.filter(c => c.date >= windowStart), weekStart, input.startDate)
  const steps = input.steps.filter(s => s.date >= windowStart && s.date <= weekEnd)
  const stepsAvg = steps.length ? Math.round(steps.reduce((t, s) => t + s.steps, 0) / steps.length) : null

  const sl = sleepSummary(input.sleep.filter(n => n.date >= windowStart && n.date <= lastDay), lastDay, def)

  const now = sevenDayAverage(input.weighIns, lastDay)
  const prev = sevenDayAverage(input.weighIns, addDays(windowStart, -1))
  const waistUpTo = [...input.waist].filter(w => w.date <= weekEnd).sort((a, b) => a.date.localeCompare(b.date))
  const latestWaist = waistUpTo[waistUpTo.length - 1] ?? null
  const prevWaist = waistUpTo.length >= 2 ? waistUpTo[waistUpTo.length - 2] : null

  const review: WeeklyReview = {
    weekStart, weekEnd, windowStart, windowDays, starter, label: starter ? starterWeekRangeLabel(windowStart) : null,
    daysCounted, daysLogged, components, proteinDays, satFatWithinTargetDays, satFatWithinCeilingDays,
    sessions,
    cardio: { minutes: wc.minutes, target: wc.targetMinutes },
    steps: { average: stepsAvg, daysLogged: steps.length, min: def.dailyMovement?.stepsMin ?? null },
    sleep: { averageMinutes: sl.nights ? sl.averageMinutes : null, consistentNights: sl.consistentNights, nights: sl.nights, windowMinutes: sl.windowMinutes },
    weight: { average: now?.avg ?? null, previousAverage: prev?.avg ?? null, changeKg: now && prev ? r1(now.avg - prev.avg) : null },
    waist: { latestCm: latestWaist?.cm ?? null, changeCm: latestWaist && prevWaist ? r1(latestWaist.cm - prevWaist.cm) : null },
    focus: [],
  }
  review.focus = focusPoints(def, review)
  return review
}

/** A daily component is a "gap" when it was hit on fewer than 4 of 7 days (scaled for a partial week). */
function gap(r: WeeklyReview, key: string): boolean {
  const c = r.components.find(x => x.key === key)
  if (!c) return false
  return c.period === 'day' ? c.value < Math.ceil((4 / 7) * c.of) : c.value < c.of
}

/**
 * Top-3 focus points from fixed templates, in priority order. Combined fixes first (one change closing two gaps),
 * then single gaps, then training / cardio / steps / sleep. Always ends with "plan the week's food" when room is left
 * and the week has gaps.
 */
export function focusPoints(def: ProgrammeDefinition, r: WeeklyReview): string[] {
  const out: string[] = []
  const add = (s: string) => { if (!out.includes(s)) out.push(s) }
  const has = (k: string) => def.components.some(c => c.key === k)
  const scale = (n: number) => Math.ceil((n / 7) * r.daysCounted)
  // Session / cardio targets already cover the window (starter week: pro-rated), so scale by the window's days.
  const windowDays = r.windowDays ?? 7
  const scaleWindow = (n: number) => Math.ceil((n / windowDays) * r.daysCounted)

  if (has('beta_glucan') && has('soy_protein') && gap(r, 'beta_glucan') && gap(r, 'soy_protein')) {
    add('Oats with soya milk at breakfast fixes both gaps — beta-glucan and soy protein in one bowl.')
  }
  if (r.satFatWithinCeilingDays < r.daysLogged) add('Saturated fat went over the ceiling — sauce on the side, no butter or cheese, and fish/chicken/tofu at dinner.')
  if (r.proteinDays < scale(5)) add('Protein in every eating occasion — skyr in the afternoon and a palm of chicken, fish or tofu at dinner.')
  for (const c of def.components) {
    if (out.length >= 6) break
    if (!gap(r, c.key)) continue
    if ((c.key === 'beta_glucan' || c.key === 'soy_protein') && out[0]?.startsWith('Oats with soya')) continue
    add(c.suggestion ?? `${c.name}: aim for ${c.target}${c.unit === 'servings' ? ' servings' : ` ${c.unit}`} ${c.period === 'day' ? 'every day' : 'this week'}.`)
  }
  if (r.sessions.done + r.sessions.partial < Math.min(r.sessions.planned, scaleWindow(r.sessions.planned))) {
    add('Book your lifting sessions like meetings — if the week gets short, do Session C first.')
  }
  if (r.cardio.target !== null && r.cardio.minutes < Math.round((r.cardio.target * r.daysCounted) / windowDays)) {
    add(`Cardio ${r.cardio.minutes} of ${r.cardio.target} min — add a 30-minute brisk walk on your non-lifting days.`)
  }
  if (r.steps.average !== null && r.steps.min !== null && r.steps.average < r.steps.min) {
    add(`Steps averaged ${r.steps.average.toLocaleString('en-GB')} — a 10-minute walk after lunch and dinner adds ~2,000.`)
  }
  if (r.sleep.nights >= 3 && r.sleep.consistentNights < Math.ceil(r.sleep.nights * 0.6)) {
    add(`Keep bedtime within ±${r.sleep.windowMinutes} min — set a wind-down alarm and no phone in bed.`)
  }
  if (out.length < 3 && out.length > 0) add('Plan the week\'s food on Sunday so the components are in the shopping.')
  if (out.length === 0) add('Everything on track — keep the same routine and plan next week\'s food today.')
  return out.slice(0, 3)
}
