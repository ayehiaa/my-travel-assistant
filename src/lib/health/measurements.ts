import { z } from 'zod'
import type { ProgrammeDefinition } from './programmeSchema'
import type { Profile } from './targets'
import type { WeighIn } from './checkin'
import { sevenDayAverage } from './checkin'
import { addDays, daysBetween, isValidDate, programmeWeek, programmeWeekStart } from './time'
import { toCm, toMmol, type Units } from './units'

/**
 * Measurements, labs and milestones (specs/029 US9, phase P2). Pure. Stored units: cm, mmol/L.
 */

// ── Waist ───────────────────────────────────────────────────────────────────

export interface WaistBands { raised: number; high: number }

/** Waist risk thresholds: male > 94 cm raised, > 102 cm high (programme/brief); female > 80 / > 88 (same guidance). */
export function waistBands(sex: Profile['sex'] | null | undefined): WaistBands {
  return sex === 'female' ? { raised: 80, high: 88 } : { raised: 94, high: 102 }
}

export type WaistBand = 'ok' | 'raised' | 'high'

export function waistBand(cm: number, sex: Profile['sex'] | null | undefined): WaistBand {
  const b = waistBands(sex)
  if (cm > b.high) return 'high'
  if (cm > b.raised) return 'raised'
  return 'ok'
}

export const WAIST_REMINDER_DAYS = 14

/** Waist reminder: none recorded since the programme start, or the last one is ≥ 14 days old. */
export function waistDue(lastDate: string | null, today: string, everyDays = WAIST_REMINDER_DAYS): boolean {
  if (!lastDate) return true
  return daysBetween(lastDate, today) >= everyDays
}

export const WaistInputSchema = z.object({
  date:  z.string().refine(isValidDate, { message: 'Invalid date' }),
  value: z.number().positive().max(400),
  unit:  z.enum(['cm', 'in']).default('cm'),
}).strict()

export function waistInputToCm(input: z.infer<typeof WaistInputSchema>): number | null {
  const cm = toCm(input.value, input.unit)
  return cm >= 40 && cm <= 250 ? cm : null
}

export interface WaistMeasurement { date: string; cm: number }

export function waistTrend(rows: readonly WaistMeasurement[]): { latest: WaistMeasurement | null; first: WaistMeasurement | null; changeCm: number | null } {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0] ?? null
  const latest = sorted[sorted.length - 1] ?? null
  return { first, latest, changeCm: first && latest && first !== latest ? Math.round((latest.cm - first.cm) * 10) / 10 : null }
}

// ── Lipids ──────────────────────────────────────────────────────────────────

export const LabInputSchema = z.object({
  date:   z.string().refine(isValidDate, { message: 'Invalid date' }),
  unit:   z.enum(['mmol', 'mgdl']).default('mmol'),
  total:  z.number().positive().max(1000).nullable().optional(),
  ldl:    z.number().positive().max(1000).nullable().optional(),
  hdl:    z.number().positive().max(1000).nullable().optional(),
  tg:     z.number().positive().max(5000).nullable().optional(),
  notes:  z.string().trim().max(500).nullable().optional(),
}).strict().refine(v => [v.total, v.ldl, v.hdl, v.tg].some(x => x != null), { message: 'Enter at least one value' })
export type LabInput = z.infer<typeof LabInputSchema>

export interface LipidPanel {
  id?: string
  date: string
  totalMmol: number | null
  ldlMmol: number | null
  hdlMmol: number | null
  tgMmol: number | null
}

/** Convert an input panel to mmol/L and range-check it (plausible: chol 0.5–25, TG 0.1–50 mmol/L). */
export function labInputToPanel(input: LabInput): { ok: true; panel: LipidPanel } | { ok: false; error: string } {
  const c = (v: number | null | undefined) => (v == null ? null : toMmol(v, input.unit, 'chol'))
  const panel: LipidPanel = {
    date: input.date,
    totalMmol: c(input.total),
    ldlMmol: c(input.ldl),
    hdlMmol: c(input.hdl),
    tgMmol: input.tg == null ? null : toMmol(input.tg, input.unit, 'tg'),
  }
  for (const v of [panel.totalMmol, panel.ldlMmol, panel.hdlMmol]) {
    if (v !== null && (v < 0.5 || v > 25)) return { ok: false, error: `A cholesterol value looks wrong for ${input.unit === 'mmol' ? 'mmol/L' : 'mg/dL'} — check the unit` }
  }
  if (panel.tgMmol !== null && (panel.tgMmol < 0.1 || panel.tgMmol > 50)) return { ok: false, error: 'Triglycerides look wrong — check the unit' }
  return { ok: true, panel }
}

/** Non-HDL = total − HDL (mmol/L, 2 dp); null without both. */
export function nonHdl(p: Pick<LipidPanel, 'totalMmol' | 'hdlMmol'>): number | null {
  if (p.totalMmol === null || p.hdlMmol === null) return null
  return Math.round((p.totalMmol - p.hdlMmol) * 100) / 100
}

export interface Escalation { metric: string; value: number; threshold: number; unit: string; note: string; date: string }

/**
 * The programme's escalation notes (seed: LDL > 4.9 mmol/L) fire for a panel taken after the programme's last week
 * started (seed: after week 12), i.e. after a full programme of adherence.
 */
export function labEscalations(def: ProgrammeDefinition, startDate: string, panels: readonly LipidPanel[]): Escalation[] {
  const rules = def.outcomes?.escalation ?? []
  if (rules.length === 0) return []
  const lastWeekStart = programmeWeekStart(startDate, def.identity.durationWeeks)
  const latest = [...panels].filter(p => p.date >= lastWeekStart).sort((a, b) => a.date.localeCompare(b.date)).pop()
  if (!latest) return []
  const out: Escalation[] = []
  for (const r of rules) {
    const metric = r.metric.toLowerCase().replace(/[^a-z]/g, '')
    const value = metric === 'ldl' ? latest.ldlMmol : metric === 'hdl' ? latest.hdlMmol : metric === 'total' || metric === 'totalcholesterol' ? latest.totalMmol
      : metric === 'triglycerides' || metric === 'tg' ? latest.tgMmol : metric === 'nonhdl' ? nonHdl(latest) : null
    if (value === null || !/mmol/i.test(r.unit)) continue
    if (value > r.threshold) out.push({ metric: r.metric, value, threshold: r.threshold, unit: r.unit, note: r.note, date: latest.date })
  }
  return out
}

export function rowToPanel(r: Record<string, unknown>): LipidPanel {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return { id: String(r.id), date: String(r.taken_on), totalMmol: n(r.total_mmol), ldlMmol: n(r.ldl_mmol), hdlMmol: n(r.hdl_mmol), tgMmol: n(r.tg_mmol) }
}

// ── Milestones ──────────────────────────────────────────────────────────────

export type MilestoneState = 'upcoming' | 'current' | 'due' | 'done'

export interface MilestoneView {
  week: number
  start: string
  end: string
  state: MilestoneState
  tasks: Array<{ task: string; done: boolean }>
  expected: string[]
  actual: { weightChangeKg: number | null; waistChangeCm: number | null }
}

export const MilestoneTaskInputSchema = z.object({
  week: z.number().int().min(1).max(104),
  task: z.string().trim().min(1).max(200),
  done: z.boolean(),
}).strict()

/** Stable key for a milestone task (stored with the tick). */
export function milestoneTaskKey(week: number, task: string): string {
  return `w${week}:${task.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)}`
}

/**
 * Dates of a milestone week (P3.2): week 1 runs from the start date (covering any starter week) to the Sunday of
 * programme week 1; week N ≥ 2 is that Mon–Sun programme week.
 */
export function milestoneWindow(startDate: string, week: number): { start: string; end: string } {
  const monday = programmeWeekStart(startDate, Math.max(1, week))
  return { start: week <= 1 ? startDate : monday, end: addDays(monday, 6) }
}

/**
 * Milestone checklist per programme week with expected ranges next to actuals: weight change = 7-day average at the
 * end of the milestone week (or today) minus the start weight; waist change = latest waist up to then minus the first.
 * State: current week → 'current'; past with open tasks → 'due'; all ticked → 'done'; future → 'upcoming'.
 */
export function milestoneViews(
  def: ProgrammeDefinition,
  ctx: { startDate: string; today: string; startWeightKg: number | null; weighIns: readonly WeighIn[]; waist: readonly WaistMeasurement[]; doneKeys: ReadonlySet<string> },
): MilestoneView[] {
  const raw = programmeWeek(ctx.startDate, ctx.today)
  // Starter week (P3.2): week-1 milestone tasks are already shown / due from the start date.
  const week = raw === 0 ? 1 : raw
  const sortedWaist = [...ctx.waist].sort((a, b) => a.date.localeCompare(b.date))
  return def.milestones.map(m => {
    const { start, end } = milestoneWindow(ctx.startDate, m.week)
    const tasks = m.tasks.map(task => ({ task, done: ctx.doneKeys.has(milestoneTaskKey(m.week, task)) }))
    const allDone = tasks.length > 0 && tasks.every(t => t.done)
    const state: MilestoneState = allDone ? 'done'
      : week === null || week < m.week ? 'upcoming'
      : week === m.week ? 'current' : 'due'
    const asOf = ctx.today < end ? ctx.today : end
    let weightChangeKg: number | null = null
    if (state !== 'upcoming' && ctx.startWeightKg !== null) {
      const avg = sevenDayAverage([...ctx.weighIns], asOf)
      if (avg) weightChangeKg = Math.round((avg.avg - ctx.startWeightKg) * 10) / 10
    }
    let waistChangeCm: number | null = null
    if (state !== 'upcoming') {
      const upTo = sortedWaist.filter(w => w.date <= asOf)
      if (upTo.length >= 2) waistChangeCm = Math.round((upTo[upTo.length - 1].cm - upTo[0].cm) * 10) / 10
    }
    return { week: m.week, start, end, state, tasks, expected: m.expected, actual: { weightChangeKg, waistChangeCm } }
  })
}

/** Milestone whose week starts today or is the current week with open tasks (for the reminder / Today card). */
export function milestoneDue(views: readonly MilestoneView[]): MilestoneView | null {
  return views.find(v => v.state === 'current' && v.tasks.some(t => !t.done)) ?? null
}

/** Display helper: "−1.2 kg" etc. in the user's units. */
export function signed(v: number, unit: string): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} ${unit}`
}

export function unitsWaistLabel(units: Units): string {
  return units.length === 'in' ? 'in' : 'cm'
}
