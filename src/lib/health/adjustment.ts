import { z } from 'zod'
import type { ProgrammeDefinition } from './programmeSchema'
import type { EffectiveTargets, Profile } from './targets'
import { kcalFloor } from './targets'
import type { WeighIn } from './checkin'
import { addDays, daysBetween, firstProgrammeMonday, programmeWeek } from './time'

/**
 * Fortnightly adjustment engine (specs/029 §6.3, US8). Pure.
 *
 * Periods are fixed fortnights from the first programme Monday (weeks 1–2, 3–4, …; P3.2: a starter week before it
 * never forms a fortnight, though its weigh-ins may still feed the first week's 7-day average). When a period has ended, the 7-day
 * average of its second week is compared with the 7-day average of its first week (≥ minWeighInsPerWeek weigh-ins
 * in EACH week, seed 5). Loss = first − second. The programme's bands map the loss to a kcal change (seed: < 0.4 kg →
 * −150; 0.4–1.2 kg → no change (aim 0.6–0.9); > 1.2 kg → +150). A loss exactly on a boundary resolves to the
 * "no change" band (most conservative). The proposal is only applied when the user accepts it.
 *
 * Applying: kcal changes by the proposal; protein is kept; the kcal are taken from / added to carbs (÷ 4, rounded to
 * 5 g); kcal never goes below the safety floor and carbs never below 0.
 */

export interface AdjustmentPeriod {
  /** 1-based fortnight index. */
  index: number
  start: string
  /** Last day of the period (inclusive). */
  end: string
}

/** The most recent fully finished period on `today` (ended yesterday or earlier), or null. */
export function latestFinishedPeriod(def: ProgrammeDefinition, startDate: string, today: string): AdjustmentPeriod | null {
  const every = def.adjustment?.everyWeeks
  if (!every) return null
  const len = every * 7
  const first = firstProgrammeMonday(startDate)
  const elapsed = daysBetween(first, today)
  const done = Math.floor(elapsed / len)
  if (done < 1) return null
  const maxPeriods = Math.floor((def.identity.durationWeeks * 7) / len)
  const index = Math.min(done, Math.max(1, maxPeriods))
  const start = addDays(first, (index - 1) * len)
  return { index, start, end: addDays(start, len - 1) }
}

export type ProposalStatus = 'insufficient_data' | 'proposal'

export interface AdjustmentProposal {
  status: ProposalStatus
  period: AdjustmentPeriod
  firstWeek: { avg: number | null; count: number }
  secondWeek: { avg: number | null; count: number }
  /** Positive = lost weight over the fortnight. */
  lossKg: number | null
  kcalChange: number
  bandLabel: string | null
  reasoning: string
  /** Water-weight caveat (e.g. creatine in weeks 1–3). */
  caveat: string | null
}

const round2 = (v: number) => Math.round(v * 100) / 100

function weekAverage(weighIns: readonly WeighIn[], from: string, to: string): { avg: number | null; count: number } {
  const inWin = weighIns.filter(w => w.date >= from && w.date <= to && Number.isFinite(w.weightKg))
  if (inWin.length === 0) return { avg: null, count: 0 }
  return { avg: round2(inWin.reduce((s, w) => s + w.weightKg, 0) / inWin.length), count: inWin.length }
}

/** Match a loss to a band: min inclusive, max inclusive; several matches (a boundary) → prefer "no change". */
export function matchBand(def: ProgrammeDefinition, lossKg: number) {
  const bands = def.adjustment?.bands ?? []
  const hits = bands.filter(b => (b.lossMinKg === undefined || lossKg >= b.lossMinKg) && (b.lossMaxKg === undefined || lossKg <= b.lossMaxKg))
  return hits.find(b => b.kcalChange === 0) ?? hits[0] ?? null
}

export function waterWeightCaveat(def: ProgrammeDefinition, startDate: string, periodEnd: string): string | null {
  const days = daysBetween(startDate, periodEnd)
  const s = def.supplements.find(x => x.waterWeightWeeks && days < x.waterWeightWeeks * 7 + 7)
  if (!s) return null
  return `${s.name} adds water weight in the first ${s.waterWeightWeeks} weeks, so this fortnight's scale change may understate fat loss — check your waist before accepting a cut.`
}

export function computeProposal(def: ProgrammeDefinition, startDate: string, weighIns: readonly WeighIn[], period: AdjustmentPeriod): AdjustmentProposal {
  const min = def.adjustment?.minWeighInsPerWeek ?? 5
  const firstEnd = addDays(period.end, -7)
  const first = weekAverage(weighIns, addDays(firstEnd, -6), firstEnd)
  const second = weekAverage(weighIns, addDays(period.end, -6), period.end)
  const caveat = waterWeightCaveat(def, startDate, period.end)
  const base = { period, firstWeek: first, secondWeek: second, caveat }
  if (first.count < min || second.count < min || first.avg === null || second.avg === null) {
    return {
      ...base, status: 'insufficient_data', lossKg: null, kcalChange: 0, bandLabel: null,
      reasoning: `Not enough weigh-ins to judge this fortnight — the rule needs at least ${min} in each week ` +
        `(you have ${first.count} and ${second.count}). No change proposed.`,
    }
  }
  const lossKg = round2(first.avg - second.avg)
  const band = matchBand(def, lossKg)
  const kcalChange = band?.kcalChange ?? 0
  const lossText = lossKg >= 0 ? `Loss ${lossKg.toFixed(2)} kg` : `Gain ${Math.abs(lossKg).toFixed(2)} kg`
  const action = kcalChange < 0
    ? `reduce by ${Math.abs(kcalChange)} kcal a day: drop one starch serving`
    : kcalChange > 0
      ? `add ${kcalChange} kcal a day: add one starch serving`
      : 'no change — keep going'
  return {
    ...base, status: 'proposal', lossKg, kcalChange, bandLabel: band?.label ?? null,
    reasoning: `${lossText} over the fortnight (7-day averages ${first.avg.toFixed(1)} → ${second.avg.toFixed(1)} kg) → ${action}.`,
  }
}

/** New targets after accepting a kcal change: protein kept, carbs absorb the change, floors respected. */
export function applyKcalChange(targets: EffectiveTargets, kcalChange: number, opts: { sex?: Profile['sex']; minKcal?: number } = {}): EffectiveTargets {
  const floor = opts.sex ? kcalFloor(opts.sex, opts.minKcal) : (opts.minKcal ?? 1200)
  const kcal = Math.max(floor, targets.kcal + kcalChange)
  const applied = kcal - targets.kcal
  const carbsG = Math.max(0, Math.round((targets.carbsG + applied / 4) / 5) * 5)
  return { ...targets, kcal, carbsG }
}

/** Mid-point review (seed week 6): the milestone week whose tasks mention a review, shown during that week. */
export function midpointReviewDue(def: ProgrammeDefinition, startDate: string, today: string): { week: number; tasks: string[] } | null {
  const week = programmeWeek(startDate, today)
  if (week === null) return null
  const m = def.milestones.find(x => x.week === week && x.tasks.some(t => /review/i.test(t) && !/physio/i.test(t)))
  return m ? { week: m.week, tasks: m.tasks } : null
}

export const AdjustmentDecisionSchema = z.object({
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  decision:  z.enum(['accept', 'decline']),
}).strict()

export interface StoredAdjustment {
  id: string
  periodEnd: string
  status: 'accepted' | 'declined'
  kcalChange: number
  lossKg: number | null
  reasoning: string
  decidedAt: string
  before: EffectiveTargets | null
  after: EffectiveTargets | null
}
