import { z } from 'zod'
import type { ProgrammeDefinition } from './programmeSchema'
import type { EffectiveTargets, Profile } from './targets'
import type { WeighIn } from './checkin'
import { sevenDayAverage } from './checkin'
import type { WaistMeasurement, LipidPanel } from './measurements'
import { nonHdl } from './measurements'
import type { CardioSession } from './cardio'
import type { LoggedSet } from './training'
import { performanceScore } from './training'
import type { NutrientLike } from './nutrition'
import { sumComponents, sumNutrients } from './nutrition'
import { addDays, daysBetween, isValidDate } from './time'

/**
 * Clinician export (specs/029 US14, phase P3): assemble a date-range report from stored data. Pure — the API loads the
 * rows; this module computes the summary, the CSV, and the text rows the PDF renderer lays out.
 * No photos unless the user ticks "include progress photos"; no food item details (only daily adherence).
 */

export const MAX_EXPORT_DAYS = 400

export const ClinicianExportQuerySchema = z.object({
  from: z.string().refine(isValidDate, { message: 'Invalid from date' }),
  to: z.string().refine(isValidDate, { message: 'Invalid to date' }),
  format: z.enum(['pdf', 'csv']).default('pdf'),
  photos: z.enum(['0', '1']).default('0').transform(v => v === '1'),
}).refine(q => q.from <= q.to, { message: 'From must be on or before To' })
  .refine(q => daysBetween(q.from, q.to) <= MAX_EXPORT_DAYS, { message: `Choose at most ${MAX_EXPORT_DAYS} days` })

export interface ExportWorkout { date: string; sessionKey: string; status: 'done' | 'partial' | 'skipped'; notes: string | null }
export interface ExportExerciseSets { date: string; exerciseKey: string; sets: LoggedSet[] }

export interface ClinicianInput {
  from: string
  to: string
  generatedOn: string
  programmeName: string
  startDate: string
  def: ProgrammeDefinition
  profile: Profile | null
  targets: EffectiveTargets
  /** Weigh-ins from 6 days before `from` to `to` (for 7-day averages at the start of the range). */
  weighIns: WeighIn[]
  waist: WaistMeasurement[]
  labs: LipidPanel[]
  food: Array<{ date: string; items: Array<NutrientLike & { components?: Record<string, number> | null }> }>
  workouts: ExportWorkout[]
  exerciseSets: ExportExerciseSets[]
  cardio: CardioSession[]
  notes: Array<{ date: string; text: string }>
  photos?: Array<{ date: string; url: string }>
}

export interface ClinicianReport {
  title: string
  range: { from: string; to: string; days: number }
  generatedOn: string
  profile: string[]
  weight: {
    rows: Array<{ date: string; weightKg: number; avg7: number | null }>
    firstAvg: number | null
    lastAvg: number | null
    changeKg: number | null
  }
  waist: { rows: WaistMeasurement[]; changeCm: number | null }
  labs: Array<{ date: string; total: number | null; ldl: number | null; hdl: number | null; nonHdl: number | null; tg: number | null }>
  adherence: {
    daysLogged: number
    days: number
    proteinDays: number
    proteinTarget: number
    satFatTargetDays: number
    satFatCeilingDays: number
    satFatTarget: number
    satFatCeiling: number
    avgKcal: number | null
    avgProteinG: number | null
    avgSatFatG: number | null
    components: Array<{ name: string; period: 'day' | 'week'; summary: string }>
  }
  training: {
    done: number
    partial: number
    skipped: number
    keyLifts: Array<{ name: string; first: string; last: string; sessions: number; changePct: number | null }>
  }
  cardio: { minutes: number; sessions: number; perWeek: number | null; byType: Array<{ type: string; minutes: number }> }
  notes: Array<{ date: string; text: string }>
  photos: Array<{ date: string; url: string }>
}

const r1 = (v: number) => Math.round(v * 10) / 10
const r2 = (v: number) => Math.round(v * 100) / 100

function exerciseName(def: ProgrammeDefinition, key: string): string {
  for (const s of def.trainingSessions) {
    const ex = s.exercises.find(e => e.key === key)
    if (ex) return ex.name
  }
  return key.replace(/_/g, ' ')
}

function topSetLabel(sets: readonly LoggedSet[]): string {
  const working = sets.filter(s => !s.isDropSet)
  const score = performanceScore(working)
  const top = working.filter(s => (s.loadKg ?? 0) === score.load).sort((a, b) => (b.reps ?? 0) - (a.reps ?? 0))[0]
  if (!top) return '—'
  if (top.holdSeconds !== null) return `${top.holdSeconds} s hold`
  return score.load > 0 ? `${score.load} kg × ${top.reps ?? 0}` : `${top.reps ?? 0} reps`
}

export function assembleClinicianReport(input: ClinicianInput): ClinicianReport {
  const { from, to, def, targets } = input
  const days = daysBetween(from, to) + 1
  const inRange = (d: string) => d >= from && d <= to

  // Profile (no photos, no free-text health details).
  const profile: string[] = [`Programme: ${input.programmeName} (${def.identity.durationWeeks} weeks, started ${input.startDate})`]
  if (input.profile) {
    const p = input.profile
    profile.push(`${p.sex === 'male' ? 'Male' : 'Female'}, ${p.age} y, height ${p.heightCm} cm, start weight ${p.weightKg} kg, activity: ${p.activityLevel.replace(/_/g, ' ')}`)
  }
  profile.push(`Daily targets: ${targets.kcal} kcal · protein ${targets.proteinG} g · fat ${targets.fatG} g · saturated fat ≤${targets.satFatTargetG} g (ceiling ${targets.satFatCeilingG} g) · carbs ${targets.carbsG} g · fibre ≥${targets.fibreMinG} g`)

  // Weight + 7-day averages.
  const weighIns = [...input.weighIns].sort((a, b) => a.date.localeCompare(b.date))
  const rows = weighIns.filter(w => inRange(w.date)).map(w => ({ date: w.date, weightKg: w.weightKg, avg7: sevenDayAverage(weighIns, w.date)?.avg ?? null }))
  const avgs = rows.filter(r => r.avg7 !== null)
  const firstAvg = avgs[0]?.avg7 ?? null
  const lastAvg = avgs[avgs.length - 1]?.avg7 ?? null

  // Waist.
  const waistRows = input.waist.filter(w => inRange(w.date)).sort((a, b) => a.date.localeCompare(b.date))
  const waistChange = waistRows.length >= 2 ? r1(waistRows[waistRows.length - 1].cm - waistRows[0].cm) : null

  // Labs (all panels in range, mmol/L).
  const labs = input.labs.filter(l => inRange(l.date)).sort((a, b) => a.date.localeCompare(b.date)).map(l => ({
    date: l.date, total: l.totalMmol, ldl: l.ldlMmol, hdl: l.hdlMmol, nonHdl: nonHdl(l), tg: l.tgMmol,
  }))

  // Adherence (days with at least one food item).
  const foodDays = input.food.filter(f => inRange(f.date) && f.items.length > 0)
  const daily = foodDays.map(f => ({ date: f.date, totals: sumNutrients(f.items), comps: sumComponents(f.items) }))
  const avg = (vals: number[]) => (vals.length ? r1(vals.reduce((s, v) => s + v, 0) / vals.length) : null)
  const components = def.components.map(c => {
    if (c.period === 'day') {
      const hit = daily.filter(d => (d.comps[c.key] ?? 0) >= c.target).length
      return { name: c.name, period: c.period, summary: `target ${c.target} ${c.unit}/day met on ${hit} of ${daily.length} logged days` }
    }
    // Weekly components: count ISO weeks fully or partly in range with the target met.
    const weeks = new Map<string, number>()
    for (const d of daily) {
      const dow = (new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7
      const monday = addDays(d.date, -dow)
      weeks.set(monday, (weeks.get(monday) ?? 0) + (d.comps[c.key] ?? 0))
    }
    const met = [...weeks.values()].filter(v => v >= c.target).length
    return { name: c.name, period: c.period, summary: `target ${c.target} ${c.unit}/week met in ${met} of ${weeks.size} logged weeks` }
  })

  // Training.
  const workouts = input.workouts.filter(w => inRange(w.date))
  const byExercise = new Map<string, ExportExerciseSets[]>()
  for (const e of input.exerciseSets.filter(x => inRange(x.date) && x.sets.some(s => (s.loadKg ?? 0) > 0))) {
    const list = byExercise.get(e.exerciseKey) ?? []
    list.push(e)
    byExercise.set(e.exerciseKey, list)
  }
  const keyLifts = [...byExercise.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const f = performanceScore(first.sets.filter(s => !s.isDropSet)).load
      const l = performanceScore(last.sets.filter(s => !s.isDropSet)).load
      return {
        name: exerciseName(def, key),
        first: `${topSetLabel(first.sets)} (${first.date})`,
        last: `${topSetLabel(last.sets)} (${last.date})`,
        sessions: sorted.length,
        changePct: f > 0 ? Math.round(((l - f) / f) * 100) : null,
      }
    })
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))
    .slice(0, 8)

  // Cardio.
  const cardio = input.cardio.filter(c => inRange(c.date))
  const minutes = cardio.reduce((s, c) => s + c.minutes, 0)
  const byTypeMap = new Map<string, number>()
  for (const c of cardio) byTypeMap.set(c.type, (byTypeMap.get(c.type) ?? 0) + c.minutes)

  return {
    title: `Health summary — ${input.programmeName}`,
    range: { from, to, days },
    generatedOn: input.generatedOn,
    profile,
    weight: { rows, firstAvg, lastAvg, changeKg: firstAvg !== null && lastAvg !== null ? r2(lastAvg - firstAvg) : null },
    waist: { rows: waistRows, changeCm: waistChange },
    labs,
    adherence: {
      daysLogged: daily.length,
      days,
      proteinDays: daily.filter(d => d.totals.proteinG >= targets.proteinG).length,
      proteinTarget: targets.proteinG,
      satFatTargetDays: daily.filter(d => d.totals.satFatG <= targets.satFatTargetG).length,
      satFatCeilingDays: daily.filter(d => d.totals.satFatG <= targets.satFatCeilingG).length,
      satFatTarget: targets.satFatTargetG,
      satFatCeiling: targets.satFatCeilingG,
      avgKcal: avg(daily.map(d => d.totals.kcal)) === null ? null : Math.round(avg(daily.map(d => d.totals.kcal))!),
      avgProteinG: avg(daily.map(d => d.totals.proteinG)),
      avgSatFatG: avg(daily.map(d => d.totals.satFatG)),
      components,
    },
    training: {
      done: workouts.filter(w => w.status === 'done').length,
      partial: workouts.filter(w => w.status === 'partial').length,
      skipped: workouts.filter(w => w.status === 'skipped').length,
      keyLifts,
    },
    cardio: {
      minutes,
      sessions: cardio.length,
      perWeek: days >= 7 ? Math.round(minutes / (days / 7)) : null,
      byType: [...byTypeMap.entries()].map(([type, m]) => ({ type, minutes: m })).sort((a, b) => b.minutes - a.minutes),
    },
    notes: input.notes.filter(n => inRange(n.date) && n.text.trim()).sort((a, b) => a.date.localeCompare(b.date)),
    photos: input.photos ?? [],
  }
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // Neutralise spreadsheet formula injection, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

const line = (cells: Array<string | number | null | undefined>) => cells.map(csvCell).join(',')

/** One CSV with labelled sections (blank line between sections). */
export function reportToCsv(r: ClinicianReport): string {
  const out: string[] = []
  out.push(line(['section', r.title]), line(['range', `${r.range.from} to ${r.range.to}`]), line(['generated', r.generatedOn]))
  for (const p of r.profile) out.push(line(['profile', p]))
  out.push('', line(['weight', 'date', 'weight_kg', 'avg_7d_kg']))
  for (const w of r.weight.rows) out.push(line(['weight', w.date, w.weightKg, w.avg7]))
  out.push('', line(['waist', 'date', 'waist_cm']))
  for (const w of r.waist.rows) out.push(line(['waist', w.date, w.cm]))
  out.push('', line(['lipids', 'date', 'total_mmol_l', 'ldl_mmol_l', 'hdl_mmol_l', 'non_hdl_mmol_l', 'tg_mmol_l']))
  for (const l of r.labs) out.push(line(['lipids', l.date, l.total, l.ldl, l.hdl, l.nonHdl, l.tg]))
  const a = r.adherence
  out.push('', line(['adherence', 'measure', 'value']))
  out.push(line(['adherence', 'days with food logged', `${a.daysLogged} of ${a.days}`]))
  out.push(line(['adherence', `protein >= ${a.proteinTarget} g`, `${a.proteinDays} days`]))
  out.push(line(['adherence', `saturated fat <= ${a.satFatTarget} g`, `${a.satFatTargetDays} days`]))
  out.push(line(['adherence', `saturated fat <= ${a.satFatCeiling} g (ceiling)`, `${a.satFatCeilingDays} days`]))
  out.push(line(['adherence', 'average kcal', a.avgKcal]), line(['adherence', 'average protein g', a.avgProteinG]), line(['adherence', 'average saturated fat g', a.avgSatFatG]))
  for (const c of a.components) out.push(line(['adherence', c.name, c.summary]))
  out.push('', line(['training', 'measure', 'value']))
  out.push(line(['training', 'sessions done', r.training.done]), line(['training', 'sessions partial', r.training.partial]), line(['training', 'sessions skipped', r.training.skipped]))
  out.push(line(['key_lift', 'exercise', 'first', 'latest', 'sessions', 'change_pct']))
  for (const k of r.training.keyLifts) out.push(line(['key_lift', k.name, k.first, k.last, k.sessions, k.changePct]))
  out.push('', line(['cardio', 'type', 'minutes']))
  for (const c of r.cardio.byType) out.push(line(['cardio', c.type, c.minutes]))
  out.push(line(['cardio', 'total', r.cardio.minutes]))
  if (r.notes.length) {
    out.push('', line(['notes', 'date', 'note']))
    for (const n of r.notes) out.push(line(['notes', n.date, n.text]))
  }
  return out.join('\r\n') + '\r\n'
}

/** Characters the standard PDF fonts (WinAnsi) cannot draw are replaced with ASCII equivalents. */
export function pdfSafeText(s: string): string {
  return s
    .replace(/[≤]/g, '<=').replace(/[≥]/g, '>=').replace(/[→]/g, '->').replace(/[−]/g, '-')
    .replace(/[   ]/g, ' ')
    // Keep Latin-1 and the WinAnsi extras (– — ‘ ’ “ ” • … € ™); drop anything else.
    .replace(/[^\x20-\x7e¡-ÿ–—‘’“”•…€™\n]/g, '?')
}

export function exportFileName(r: Pick<ClinicianReport, 'range'>, ext: 'pdf' | 'csv'): string {
  return `health-summary-${r.range.from}-to-${r.range.to}.${ext}`
}
