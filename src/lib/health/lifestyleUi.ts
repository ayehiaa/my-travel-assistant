import type { ComponentProgress, FoodItem } from './nutrition'
import type { LibraryFood } from './foodLibrary'
import { itemFromLibrary, normalizeFoodName } from './foodLibrary'
import type { LoggedSet, ScheduleDay } from './training'
import { programmeWeek, shortDayLabel } from './time'

/**
 * Pure presentation helpers for the Lifestyle hub redesign (specs/032-lifestyle-ux-redesign): status tones for
 * meters and tiles, component chips, the effort picker, set prefill, the week strip, recent foods. No I/O.
 */

// ── Status tones ────────────────────────────────────────────────────────────

/** good = on track (green), close = near a limit (amber), bad = over a ceiling / well short (red), neutral = in progress. */
export type Tone = 'good' | 'close' | 'bad' | 'neutral'

export interface MeterState {
  tone: Tone
  /** Short status word shown next to the colour (never colour-only). */
  status: string | null
  /** 0–1 fill of the bar. */
  ratio: number
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const r1 = (v: number) => Math.round(v * 10) / 10

/** Energy (an upper target): over → bad; ≥ 90 % eaten → close; otherwise on track. */
export function kcalMeter(eaten: number, target: number): MeterState & { left: number } {
  const left = Math.round(target - eaten)
  const ratio = target > 0 ? clamp01(eaten / target) : 0
  if (target > 0 && eaten > target) return { left, ratio: 1, tone: 'bad', status: 'Over' }
  if (target > 0 && eaten >= target * 0.9) return { left, ratio, tone: 'close', status: 'Nearly there' }
  return { left, ratio, tone: 'good', status: null }
}

/** A minimum target (protein, fibre): met → good; otherwise in progress (no judgement during the day). */
export function minTargetMeter(value: number, target: number): MeterState {
  const ratio = target > 0 ? clamp01(value / target) : 0
  return value >= target && target > 0 ? { ratio: 1, tone: 'good', status: 'Done' } : { ratio, tone: 'neutral', status: null }
}

/** A target with a hard ceiling (saturated fat): over the ceiling → bad; over the target → close; else good. */
export function ceilingMeter(value: number, target: number, ceiling: number): MeterState & { markerRatio: number | null } {
  const max = Math.max(ceiling, target)
  const ratio = max > 0 ? clamp01(value / max) : 0
  const markerRatio = ceiling > target && ceiling > 0 ? target / ceiling : null
  if (value > ceiling) return { ratio: 1, markerRatio, tone: 'bad', status: 'Over limit' }
  if (value > target) return { ratio, markerRatio, tone: 'close', status: 'Over target' }
  return { ratio, markerRatio, tone: 'good', status: null }
}

/** Adherence (value of target, e.g. sessions 2/3, cardio 90/150 min): ≥ 100 % good, ≥ 60 % close, else bad. Null target → neutral. */
export function adherenceTone(value: number, target: number | null): Tone {
  if (target === null || !(target > 0)) return 'neutral'
  const r = value / target
  return r >= 1 ? 'good' : r >= 0.6 ? 'close' : 'bad'
}

export const TONE_TEXT: Record<Tone, string> = { good: 'On track', close: 'Close', bad: 'Behind', neutral: '' }

// ── Component chips (LDL row) ───────────────────────────────────────────────

export interface ComponentChip {
  key: string
  name: string
  state: 'done' | 'todo' | 'not_due'
  /** Compact text: "✓", "1.2 g left", "1/2 this week", "not due". */
  text: string
  /** Amount still needed (0 when done / not due). */
  remaining: number
  unit: string
  period: 'day' | 'week'
}

function amount(v: number, unit: string): string {
  const n = Number.isInteger(r1(v)) ? String(r1(v)) : r1(v).toFixed(1)
  return unit === 'servings' ? n : `${n} ${unit}`
}

/** Chip per programme component: daily ✓ or "x left"; weekly "v/t this week"; starter-week zero target → not due. */
export function componentChip(c: ComponentProgress): ComponentChip {
  const base = { key: c.key, name: c.name, unit: c.unit, period: c.period }
  if (c.notDue) return { ...base, state: 'not_due', text: 'not due', remaining: 0 }
  const remaining = Math.max(0, r1(c.target - c.value))
  if (c.period === 'week') {
    return { ...base, state: c.met ? 'done' : 'todo', text: `${amount(c.value, 'servings')}/${amount(c.target, 'servings')} this week`, remaining }
  }
  if (c.met) return { ...base, state: 'done', text: '✓', remaining: 0 }
  return { ...base, state: 'todo', text: `${amount(remaining, c.unit)} left`, remaining }
}

/** Library foods that contain a component, best contributors (at the default portion) first. */
export function foodsForComponent(library: readonly LibraryFood[], key: string, limit = 5): Array<{ food: LibraryFood; amount: number }> {
  return library
    .map(food => ({ food, amount: r1((food.per100.components[key] ?? 0) * food.defaultQuantityG / 100) }))
    .filter(f => f.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
}

// ── Effort picker (replaces "RIR" in the UI; stores the same rir / toFailure values) ──

export type EffortKey = 'easy' | 'medium' | 'hard' | 'failure'

export const EFFORT_OPTIONS: ReadonlyArray<{ key: EffortKey; label: string; hint: string; rir: number | null; failure: boolean }> = [
  { key: 'easy',    label: 'Easy',    hint: '3+ reps left', rir: 3,    failure: false },
  { key: 'medium',  label: 'Medium',  hint: '2 reps left',  rir: 2,    failure: false },
  { key: 'hard',    label: 'Hard',    hint: '0–1 reps left', rir: 1,   failure: false },
  { key: 'failure', label: 'Failure', hint: 'no more reps', rir: null, failure: true },
]

/** Effort shown for a stored set (rir 0–1 hard, 2 medium, ≥3 easy; failure flag wins). */
export function effortOf(rir: number | null, failure: boolean): EffortKey | null {
  if (failure) return 'failure'
  if (rir === null) return null
  return rir >= 3 ? 'easy' : rir === 2 ? 'medium' : 'hard'
}

/** Plain-language version of a programme RIR range: '2-3' → '2–3 reps left'. */
export function effortText(rir: string | null): string | null {
  if (!rir) return null
  return `${rir.replace('-', '–')} reps left`
}

// ── Set prefill (Hevy-style PREVIOUS column) ────────────────────────────────

export interface SetPrefill {
  /** "20 kg × 10" from last time, or null. */
  previous: string | null
  load: string
  reps: string
  hold: string
}

function fmtPrev(s: LoggedSet): string {
  const parts: string[] = []
  if (s.loadKg !== null && s.loadKg > 0) parts.push(`${s.loadKg} kg`)
  if (s.reps !== null) parts.push(parts.length ? `× ${s.reps}` : `${s.reps} reps`)
  if (s.holdSeconds !== null) parts.push(`${s.holdSeconds} s`)
  return parts.join(' ') || '—'
}

/**
 * Prefill for set `index`: the previous session's set at the same position (else its last working set). Load uses
 * the suggested start load when there is one (progression / light-week factor), else last time's load.
 */
export function prefillSet(previous: readonly LoggedSet[] | null, index: number, startLoad: number | null): SetPrefill {
  const working = (previous ?? []).filter(s => !s.isDropSet)
  const at = working.find(s => s.setIndex === index) ?? working[index] ?? null
  const prev = at ?? working[working.length - 1] ?? null
  const load = startLoad ?? (prev?.loadKg && prev.loadKg > 0 ? prev.loadKg : null)
  return {
    previous: at ? fmtPrev(at) : null,
    load: load !== null ? String(load) : '',
    reps: prev?.reps !== null && prev?.reps !== undefined ? String(prev.reps) : '',
    hold: prev?.holdSeconds !== null && prev?.holdSeconds !== undefined ? String(prev.holdSeconds) : '',
  }
}

// ── Week strip / phase / week chip ──────────────────────────────────────────

export type DotState = 'done' | 'partial' | 'missed' | 'skipped' | 'today' | 'planned' | 'cardio' | 'rest' | 'before_start'

/** Dot for a day of the training week strip. */
export function weekDot(day: Pick<ScheduleDay, 'status' | 'kind'>): DotState {
  switch (day.status) {
    case 'done': case 'moved': return 'done'
    case 'partial': return 'partial'
    case 'skipped': return 'skipped'
    case 'missed': return 'missed'
    case 'today': return 'today'
    case 'upcoming': return 'planned'
    case 'before_start': return 'before_start'
    default: return day.kind === 'rest' ? 'rest' : day.kind === 'session' ? 'planned' : 'cardio'
  }
}

/** "Block 2 — Build" → "Phase 2 · Build" (the index is used when the name has no number). */
export function phaseLabel(blockName: string, index: number): string {
  const m = /^\s*block\s*(\d+)\s*[—–:-]?\s*(.*)$/i.exec(blockName)
  if (m) return m[2] ? `Phase ${m[1]} · ${m[2]}` : `Phase ${m[1]}`
  return `Phase ${index + 1} · ${blockName}`
}

/** Small header chip: "Starter week", "Week 3 of 12", "Starts Mon 23 Nov" or "Complete". */
export function weekChip(startDate: string, date: string, durationWeeks: number): string {
  const w = programmeWeek(startDate, date)
  if (w === null) return `Starts ${shortDayLabel(startDate)}`
  if (w === 0) return 'Starter week'
  if (w > durationWeeks) return 'Complete'
  return `Week ${w} of ${durationWeeks}`
}

// ── Food: entry summary + recents ───────────────────────────────────────────

/** "Porridge, blueberries +2" — the first two item names and a count of the rest. */
export function entrySummary(items: ReadonlyArray<Pick<FoodItem, 'name'>>, text?: string | null): string {
  const names = items.map(i => i.name.trim()).filter(Boolean)
  if (names.length === 0) return text?.trim() || 'Food'
  const head = names.slice(0, 2).join(', ')
  return names.length > 2 ? `${head} +${names.length - 2}` : head
}

export interface RecentFood {
  key: string
  name: string
  kind: 'recent' | 'favourite'
  kcal: number
  proteinG: number
  satFatG: number
  /** Items to re-log as-is (no ids). */
  items: FoodItem[]
}

function strip(item: FoodItem & { id?: string }): FoodItem {
  const { id: _id, ...rest } = item as FoodItem & { id?: string }
  void _id
  return rest
}

/**
 * One-tap re-log list: recent meals (newest first, de-duplicated by their item names) then personal-library
 * favourites not already shown.
 */
export function recentFoods(
  entries: ReadonlyArray<{ date: string; time: string; text?: string | null; items: ReadonlyArray<FoodItem & { id?: string }> }>,
  library: readonly LibraryFood[],
  limit = 8,
): RecentFood[] {
  const out: RecentFood[] = []
  const seen = new Set<string>()
  const sorted = [...entries].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
  for (const e of sorted) {
    if (e.items.length === 0) continue
    const key = e.items.map(i => normalizeFoodName(i.name)).sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    const items = e.items.map(strip)
    out.push({
      key: `r:${key}`, name: entrySummary(items, e.text), kind: 'recent', items,
      kcal: Math.round(items.reduce((n, i) => n + i.kcal, 0)),
      proteinG: r1(items.reduce((n, i) => n + i.proteinG, 0)),
      satFatG: r1(items.reduce((n, i) => n + i.satFatG, 0)),
    })
    if (out.length >= Math.ceil(limit / 2)) break
  }
  for (const f of library) {
    if (out.length >= limit) break
    const key = normalizeFoodName(f.name)
    if (seen.has(key)) continue
    seen.add(key)
    const item = itemFromLibrary(f)
    out.push({ key: `f:${f.id}`, name: f.name, kind: 'favourite', items: [item], kcal: item.kcal, proteinG: item.proteinG, satFatG: item.satFatG })
  }
  return out
}

// ── Progress chart ranges ───────────────────────────────────────────────────

export const CHART_RANGES = [
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 91 },
  { key: 'all', label: 'All', days: null },
] as const
export type ChartRange = (typeof CHART_RANGES)[number]['key']

/** Points on or after `today − days + 1` (all points for 'all'). Points must be sorted by date. */
export function sliceRange<T extends { date: string }>(points: readonly T[], range: ChartRange, today: string): T[] {
  const r = CHART_RANGES.find(x => x.key === range)
  if (!r || r.days === null) return [...points]
  const from = new Date(`${today}T12:00:00Z`)
  from.setUTCDate(from.getUTCDate() - (r.days - 1))
  const cut = from.toISOString().slice(0, 10)
  return points.filter(p => p.date >= cut)
}

/** Schedule label without the parenthetical advice: "Session A — Upper (black coffee …)" → "Session A — Upper". */
export function shortLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim()
}

/**
 * Food-goal adherence for the Progress summary: daily components (days hit / days counted) and due weekly components
 * (amount / target, capped at 1) averaged into one percentage. Null when nothing is due.
 */
export function foodGoalAdherence(components: ReadonlyArray<{ period: 'day' | 'week'; value: number; of: number; note?: string | null }>): { pct: number; tone: Tone } | null {
  const ratios = components
    .filter(c => c.of > 0 && c.note !== 'not due this week')
    .map(c => Math.min(1, c.value / c.of))
  if (ratios.length === 0) return null
  const pct = Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100)
  return { pct, tone: adherenceTone(pct, 100) }
}
