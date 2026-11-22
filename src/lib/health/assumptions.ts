import { z } from 'zod'

/**
 * Estimate assumptions (specs/029 P3.1). Anything the person did NOT state — butter on toast, oil in the pan, a
 * dressing, a guessed portion — is a separate assumption with its own nutrition delta, never merged silently into
 * the base item. Pure.
 *
 * Storage convention: an item's nutrient fields are the EFFECTIVE values = base (item as described) + the deltas
 * of the assumptions that are kept. Removing a chip subtracts its delta; adding it back adds it again. Items
 * without `assumptions` (every entry saved before P3.1) simply have none.
 */

export const ASSUMPTION_KINDS = ['added_fat', 'portion', 'preparation', 'ingredient'] as const
export type AssumptionKind = (typeof ASSUMPTION_KINDS)[number]

/** Max assumptions per item — more than a handful is the model over-assuming. */
export const MAX_ASSUMPTIONS = 6

const DELTA_MAX = { kcal: 2000, macroG: 200 } as const

export const AssumptionSchema = z.object({
  key:          z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label:        z.string().trim().min(1).max(60),
  kind:         z.enum(ASSUMPTION_KINDS),
  addsKcal:     z.number().finite().min(0).max(DELTA_MAX.kcal),
  addsSatFatG:  z.number().finite().min(0).max(DELTA_MAX.macroG),
  addsProteinG: z.number().finite().min(0).max(DELTA_MAX.macroG),
  addsCarbsG:   z.number().finite().min(0).max(DELTA_MAX.macroG),
  addsFatG:     z.number().finite().min(0).max(DELTA_MAX.macroG),
  /** False once the person removed the chip ("no butter"). */
  kept:         z.boolean().default(true),
  /** Assumed amount in grams, when known (e.g. 7 g butter). */
  grams:        z.number().finite().min(0).max(1000).nullable().optional(),
  /** Reference-dataset row the delta was computed from; absent = the model's own numbers. */
  refId:        z.string().max(40).nullable().optional(),
})
export type Assumption = z.infer<typeof AssumptionSchema>

export interface AssumptionNutrients {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  satFatG: number
}

type WithAssumptions = AssumptionNutrients & { assumptions?: Assumption[] | null }

const r1 = (v: number) => Math.round(v * 10) / 10
const clamp0 = (v: number) => (v > 0 ? v : 0)

/** "Butter (assumed)" / "olive oil" → "butter" / "olive_oil" — stable keys for chips and remembered preferences. */
export function assumptionKey(label: string): string {
  const k = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\((assumed|estimate|guess)\)/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9_]+/, '')
    .slice(0, 40)
  return k || 'assumption'
}

/** Sum of the deltas (kept ones only by default). */
export function assumptionTotals(list: Assumption[] | null | undefined, onlyKept = true): AssumptionNutrients {
  const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, satFatG: 0 }
  for (const a of list ?? []) {
    if (onlyKept && !a.kept) continue
    t.kcal += a.addsKcal
    t.proteinG += a.addsProteinG
    t.carbsG += a.addsCarbsG
    t.fatG += a.addsFatG
    t.satFatG += a.addsSatFatG
  }
  return { kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG), satFatG: r1(t.satFatG) }
}

function shift<T extends WithAssumptions>(item: T, d: AssumptionNutrients, sign: 1 | -1): T {
  return {
    ...item,
    kcal: Math.round(clamp0(item.kcal + sign * d.kcal)),
    proteinG: r1(clamp0(item.proteinG + sign * d.proteinG)),
    carbsG: r1(clamp0(item.carbsG + sign * d.carbsG)),
    fatG: r1(clamp0(item.fatG + sign * d.fatG)),
    satFatG: r1(clamp0(item.satFatG + sign * d.satFatG)),
  }
}

/** The item as described: effective values minus the kept assumptions. */
export function baseNutrients<T extends WithAssumptions>(item: T): T {
  return shift(item, assumptionTotals(item.assumptions), -1)
}

/** Base values + kept assumptions (used when building an item from base numbers). */
export function withAssumptions<T extends WithAssumptions>(base: T, assumptions: Assumption[]): T {
  return { ...shift(base, assumptionTotals(assumptions), 1), assumptions }
}

/** Keep or remove one chip; totals move by exactly that chip's delta. Unknown key / same state → unchanged. */
export function setAssumptionKept<T extends WithAssumptions>(item: T, key: string, kept: boolean): T {
  const list = item.assumptions ?? []
  const a = list.find(x => x.key === key)
  if (!a || a.kept === kept) return item
  const moved = shift(item, assumptionTotals([{ ...a, kept: true }]), kept ? 1 : -1)
  return { ...moved, assumptions: list.map(x => (x.key === key ? { ...x, kept } : x)) }
}

/** "Cooked/served without butter or oil": drop every added-fat assumption (and its delta if it was kept). */
export function dropAddedFat<T extends WithAssumptions>(item: T): T {
  const list = item.assumptions ?? []
  if (!list.some(a => a.kind === 'added_fat')) return item
  const removed = list.filter(a => a.kind === 'added_fat')
  return { ...shift(item, assumptionTotals(removed), -1), assumptions: list.filter(a => a.kind !== 'added_fat') }
}

/** Remembered chip choices (from the personal food library): { butter: false } → butter chip starts removed. */
export function applyAssumptionPrefs<T extends WithAssumptions>(item: T, prefs: Record<string, boolean> | null | undefined): T {
  if (!prefs) return item
  let out = item
  for (const [key, kept] of Object.entries(prefs)) out = setAssumptionKept(out, key, kept)
  return out
}

/** Chip choices to remember for an item ({ key: kept }). Empty when the item has no assumptions. */
export function assumptionPrefsOf(item: { assumptions?: Assumption[] | null }): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const a of item.assumptions ?? []) out[a.key] = a.kept
  return out
}

/** Tolerant read of stored assumptions (bad entries dropped; non-array → none). */
export function readAssumptions(v: unknown): Assumption[] {
  if (!Array.isArray(v)) return []
  const out: Assumption[] = []
  for (const raw of v.slice(0, MAX_ASSUMPTIONS)) {
    const r = AssumptionSchema.safeParse(raw)
    if (r.success && !out.some(a => a.key === r.data.key)) out.push(r.data)
  }
  return out
}
