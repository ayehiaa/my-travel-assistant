import { z } from 'zod'
import { HhMmSchema, type MealSlot, type ProgrammeDefinition } from './programmeSchema'
import type { EffectiveTargets } from './targets'
import { hhmmToMinutes, isValidDate } from './time'

/**
 * Food items, day totals, remaining budget and component progress (specs/029 §3.4, US3, US4). Pure.
 */

/** Built-in component keys every estimate returns, whatever the programme. */
export const BUILTIN_COMPONENTS = ['starch_servings', 'caffeine_mg'] as const

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const
export type Confidence = (typeof CONFIDENCE_LEVELS)[number]

export const ITEM_SOURCES = ['ai', 'library', 'off', 'manual'] as const
export type ItemSource = (typeof ITEM_SOURCES)[number]

/** Plausibility clamps for one item (AI output and user edits). */
export const ITEM_LIMITS = {
  quantityG: 3000, kcal: 4000, macroG: 400, fibreG: 100, componentValue: 2000,
} as const

const ComponentMapSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  z.number().finite().min(0).max(ITEM_LIMITS.componentValue),
)

export const FoodItemSchema = z.object({
  name:       z.string().trim().min(1).max(120),
  quantityG:  z.number().finite().min(0).max(ITEM_LIMITS.quantityG),
  kcal:       z.number().finite().min(0).max(ITEM_LIMITS.kcal),
  proteinG:   z.number().finite().min(0).max(ITEM_LIMITS.macroG),
  carbsG:     z.number().finite().min(0).max(ITEM_LIMITS.macroG),
  fatG:       z.number().finite().min(0).max(ITEM_LIMITS.macroG),
  satFatG:    z.number().finite().min(0).max(ITEM_LIMITS.macroG),
  fibreG:     z.number().finite().min(0).max(ITEM_LIMITS.fibreG),
  components: ComponentMapSchema.default({}),
  confidence: z.enum(CONFIDENCE_LEVELS).default('medium'),
  isTreat:    z.boolean().default(false),
  source:     z.enum(ITEM_SOURCES).default('manual'),
  libraryId:  z.string().uuid().nullable().optional(),
  offCode:    z.string().regex(/^[0-9]{4,20}$/).nullable().optional(),
})
export type FoodItem = z.infer<typeof FoodItemSchema>

export const PHOTO_PATH_RE = /^[0-9a-f-]{36}\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/[0-9a-f-]{36}\.jpg$/

export const FoodEntryInputSchema = z.object({
  date:       z.string().refine(isValidDate, { message: 'Invalid date' }),
  time:       HhMmSchema,
  slot:       z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).nullable(),
  text:       z.string().trim().max(1000).nullable().optional(),
  restaurant: z.boolean().default(false),
  photoPaths: z.array(z.string().regex(PHOTO_PATH_RE)).max(4).default([]),
  items:      z.array(FoodItemSchema).min(1).max(30),
  /** Indices of items to remember in the personal food library (the UI ticks edited items automatically). */
  remember:   z.array(z.number().int().min(0).max(29)).max(30).default([]),
}).strict()
export type FoodEntryInput = z.infer<typeof FoodEntryInputSchema>

/** PATCH body: replace items and/or move the entry to another slot / time (same day). */
export const FoodEntryPatchSchema = z.object({
  time:     HhMmSchema.optional(),
  slot:     z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).nullable().optional(),
  items:    z.array(FoodItemSchema).min(1).max(30).optional(),
  remember: z.array(z.number().int().min(0).max(29)).max(30).default([]),
}).strict()
export type FoodEntryPatch = z.infer<typeof FoodEntryPatchSchema>

export interface NutrientTotals {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  satFatG: number
  fibreG: number
}

export const ZERO_TOTALS: NutrientTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, satFatG: 0, fibreG: 0 }

const r1 = (v: number) => Math.round(v * 10) / 10

type NutrientLike = Pick<FoodItem, 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'satFatG' | 'fibreG'>

export function sumNutrients(items: NutrientLike[]): NutrientTotals {
  const t = items.reduce<NutrientTotals>((acc, i) => ({
    kcal:     acc.kcal + (i.kcal || 0),
    proteinG: acc.proteinG + (i.proteinG || 0),
    carbsG:   acc.carbsG + (i.carbsG || 0),
    fatG:     acc.fatG + (i.fatG || 0),
    satFatG:  acc.satFatG + (i.satFatG || 0),
    fibreG:   acc.fibreG + (i.fibreG || 0),
  }), { ...ZERO_TOTALS })
  return { kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG), satFatG: r1(t.satFatG), fibreG: r1(t.fibreG) }
}

export function sumComponents(items: Array<{ components?: Record<string, number> | null }>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const i of items) {
    for (const [k, v] of Object.entries(i.components ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = r1((out[k] ?? 0) + v)
    }
  }
  return out
}

/** The programme says logged figures are ±15% — show a band, never false precision. */
export const UNCERTAINTY = 0.15

export function uncertaintyBand(value: number, pct = UNCERTAINTY): { low: number; high: number } {
  return { low: Math.round(value * (1 - pct)), high: Math.round(value * (1 + pct)) }
}

export interface RemainingBudget {
  kcal: number
  proteinG: number
  /** To the target; negative = over. */
  satFatToTargetG: number
  /** To the ceiling; negative = over. */
  satFatToCeilingG: number
  carbsG: number
  fatG: number
  fibreG: number
  /** Starch servings left under the one-starch rule (one per remaining meal slot), null without the rule. */
  starchServingsLeft: number | null
}

export function remainingBudget(
  totals: NutrientTotals,
  targets: EffectiveTargets,
  opts: { mealsRemaining?: number; oneStarchRule?: boolean } = {},
): RemainingBudget {
  return {
    kcal:             Math.round(targets.kcal - totals.kcal),
    proteinG:         r1(targets.proteinG - totals.proteinG),
    satFatToTargetG:  r1(targets.satFatTargetG - totals.satFatG),
    satFatToCeilingG: r1(targets.satFatCeilingG - totals.satFatG),
    carbsG:           r1(targets.carbsG - totals.carbsG),
    fatG:             r1(targets.fatG - totals.fatG),
    fibreG:           r1(targets.fibreMinG - totals.fibreG),
    starchServingsLeft: opts.oneStarchRule ? Math.max(0, opts.mealsRemaining ?? 0) : null,
  }
}

/** 0–1 progress for a bar (over target stays at 1; the UI shows the number). */
export function progressRatio(value: number, target: number): number {
  if (!(target > 0)) return 0
  return Math.max(0, Math.min(1, value / target))
}

// ── Meal slots ──────────────────────────────────────────────────────────────

/** Slot whose window contains `time`; otherwise the nearest window (by start/end distance). Null without slots. */
export function suggestSlot(slots: MealSlot[], time: string): MealSlot | null {
  const t = hhmmToMinutes(time)
  if (t === null || slots.length === 0) return null
  let best: { slot: MealSlot; d: number } | null = null
  for (const s of slots) {
    const a = hhmmToMinutes(s.start) ?? 0
    const b = hhmmToMinutes(s.end) ?? a
    const d = t >= a && t <= b ? 0 : Math.min(Math.abs(t - a), Math.abs(t - b))
    if (!best || d < best.d) best = { slot: s, d }
  }
  return best?.slot ?? null
}

/** Meal slots (isMeal) whose window has not ended yet at `time` and have no entry logged. */
export function mealsRemaining(slots: MealSlot[], time: string, loggedSlots: Iterable<string | null>): MealSlot[] {
  const t = hhmmToMinutes(time) ?? 0
  const logged = new Set([...loggedSlots].filter((s): s is string => !!s))
  return slots.filter(s => s.isMeal && !logged.has(s.key) && (hhmmToMinutes(s.end) ?? 0) > t)
}

// ── Components ──────────────────────────────────────────────────────────────

export interface ComponentProgress {
  key: string
  name: string
  unit: string
  period: 'day' | 'week'
  target: number
  value: number
  met: boolean
}

/** Progress per programme component: daily ones vs today's total, weekly ones vs this week's total. */
export function componentProgress(
  def: ProgrammeDefinition,
  todayComponents: Record<string, number>,
  weekComponents: Record<string, number>,
): ComponentProgress[] {
  return def.components.map(c => {
    const value = r1((c.period === 'day' ? todayComponents[c.key] : weekComponents[c.key]) ?? 0)
    return { key: c.key, name: c.name, unit: c.unit, period: c.period, target: c.target, value, met: value >= c.target }
  })
}

/** Scale an item's nutrition linearly to a new quantity (portion edit). Zero quantity → unchanged. */
export function scaleItem<T extends FoodItem>(item: T, newQuantityG: number): T {
  if (!(item.quantityG > 0) || !(newQuantityG >= 0)) return item
  const f = newQuantityG / item.quantityG
  const components: Record<string, number> = {}
  for (const [k, v] of Object.entries(item.components)) components[k] = r1(v * f)
  return {
    ...item,
    quantityG: Math.round(newQuantityG),
    kcal: Math.round(item.kcal * f),
    proteinG: r1(item.proteinG * f),
    carbsG: r1(item.carbsG * f),
    fatG: r1(item.fatG * f),
    satFatG: r1(item.satFatG * f),
    fibreG: r1(item.fibreG * f),
    components,
  }
}

/** Portion presets for a low-confidence item: small / medium / large relative to the estimate. */
export const PORTION_FACTORS = { small: 0.7, medium: 1, large: 1.4 } as const
