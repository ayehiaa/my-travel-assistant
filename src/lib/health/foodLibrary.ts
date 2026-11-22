import { z } from 'zod'
import type { FoodItem } from './nutrition'

/**
 * Personal food library (specs/029 §3.5). Pure. Values are stored per 100 g (components too) with a default
 * portion; items are rebuilt by scaling to a quantity. Library matches always win over AI guesses.
 */

export interface Per100 {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  satFatG: number
  fibreG: number
  components: Record<string, number>
}

export interface LibraryFood {
  id: string
  name: string
  normalizedName: string
  defaultQuantityG: number
  per100: Per100
  isTreat: boolean
}

const r1 = (v: number) => Math.round(v * 10) / 10

/** Lower-case, accents and punctuation removed, single spaces. */
export function normalizeFoodName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(name: string): Set<string> {
  return new Set(normalizeFoodName(name).split(' ').filter(t => t.length > 1 && !STOPWORDS.has(t)))
}

const STOPWORDS = new Set(['of', 'the', 'a', 'an', 'with', 'my', 'some', 'and'])

/** Exact normalised match first; otherwise the best token-set match with Jaccard ≥ 0.75. */
export function matchLibrary(name: string, library: LibraryFood[]): LibraryFood | null {
  const norm = normalizeFoodName(name)
  if (!norm) return null
  const exact = library.find(f => f.normalizedName === norm)
  if (exact) return exact
  const a = tokens(name)
  if (a.size === 0) return null
  let best: { food: LibraryFood; score: number } | null = null
  for (const f of library) {
    const b = tokens(f.name)
    if (b.size === 0) continue
    const inter = [...a].filter(t => b.has(t)).length
    const score = inter / new Set([...a, ...b]).size
    if (score >= 0.75 && (!best || score > best.score)) best = { food: f, score }
  }
  return best?.food ?? null
}

/** Build a food item from a library food at a quantity (default portion when omitted). */
export function itemFromLibrary(food: LibraryFood, quantityG?: number | null): FoodItem {
  const q = quantityG && quantityG > 0 ? quantityG : food.defaultQuantityG
  const f = q / 100
  const components: Record<string, number> = {}
  for (const [k, v] of Object.entries(food.per100.components)) components[k] = r1(v * f)
  return {
    name: food.name,
    quantityG: Math.round(q),
    kcal: Math.round(food.per100.kcal * f),
    proteinG: r1(food.per100.proteinG * f),
    carbsG: r1(food.per100.carbsG * f),
    fatG: r1(food.per100.fatG * f),
    satFatG: r1(food.per100.satFatG * f),
    fibreG: r1(food.per100.fibreG * f),
    components,
    confidence: 'high',
    isTreat: food.isTreat,
    source: 'library',
    libraryId: food.id,
    offCode: null,
  }
}

/** Per-100 g values from an item (null when the quantity is 0 — nothing to scale from). */
export function per100FromItem(item: FoodItem): Per100 | null {
  if (!(item.quantityG > 0)) return null
  const f = 100 / item.quantityG
  const components: Record<string, number> = {}
  for (const [k, v] of Object.entries(item.components)) components[k] = Math.round(v * f * 100) / 100
  return {
    kcal: Math.round(item.kcal * f),
    proteinG: r1(item.proteinG * f),
    carbsG: r1(item.carbsG * f),
    fatG: r1(item.fatG * f),
    satFatG: r1(item.satFatG * f),
    fibreG: r1(item.fibreG * f),
    components,
  }
}

/** Any input → a finite number ≥ 0 (junk / missing → 0). z.unknown() keeps the key required-safe in Zod 4. */
const NumOr0 = z.unknown().optional().transform(v => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0
})
const Per100Schema = z.object({
  kcal: NumOr0, proteinG: NumOr0, carbsG: NumOr0, fatG: NumOr0, satFatG: NumOr0, fibreG: NumOr0,
  components: z.unknown().optional().transform(v => {
    const out: Record<string, number> = {}
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v)) if (typeof x === 'number' && Number.isFinite(x) && x >= 0) out[k] = x
    }
    return out
  }),
})

/** A DB row → LibraryFood (null when unusable). */
export function readLibraryRow(row: unknown): LibraryFood | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const per100 = Per100Schema.safeParse(r.per100)
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || !per100.success) return null
  const q = Number(r.default_quantity_g)
  return {
    id: r.id,
    name: r.name,
    normalizedName: typeof r.normalized_name === 'string' ? r.normalized_name : normalizeFoodName(r.name),
    defaultQuantityG: Number.isFinite(q) && q > 0 ? q : 100,
    per100: per100.data,
    isTreat: r.is_treat === true,
  }
}

export interface ParsedSegment { name: string; quantityG: number | null; count: number }

/**
 * Split a free-text log ("2 soya flat whites, 150g skyr and walnuts") into segments with an optional gram amount
 * or count. Used to log purely from the library without an AI call when every segment matches.
 */
export function splitFoodText(text: string): ParsedSegment[] {
  return text
    .split(/,|\+|\n|;| and /i)
    .map(s => s.trim())
    .filter(Boolean)
    .map(seg => {
      const grams = seg.match(/^(\d+(?:\.\d+)?)\s*(g|gr|grams?|ml)\b\s*(?:of\s+)?(.*)$/i)
      if (grams) return { name: grams[3].trim(), quantityG: Number(grams[1]), count: 1 }
      const count = seg.match(/^(\d+(?:\.\d+)?|half|a|an|one|two|three)\s*(?:x\s*)?(.*)$/i)
      if (count && count[2]) {
        const word: Record<string, number> = { half: 0.5, a: 1, an: 1, one: 1, two: 2, three: 3 }
        const n = word[count[1].toLowerCase()] ?? Number(count[1])
        // "a" / "an" are only a count when followed by more words
        return { name: count[2].replace(/^of\s+/i, '').trim(), quantityG: null, count: Number.isFinite(n) && n > 0 ? n : 1 }
      }
      return { name: seg, quantityG: null, count: 1 }
    })
    .filter(s => s.name.length > 0)
}

/** Simple English singular for matching ("flat whites" → "flat white"). */
function singular(name: string): string {
  return name.replace(/(\w{3,})es\b/g, (m, w) => (/(ch|sh|s|x|z)$/.test(w) ? w : `${w}e`)).replace(/(\w{3,}[^s])s\b/g, '$1')
}

/** Items for a text when EVERY segment matches the library; otherwise null (the AI is needed). */
export function itemsFromLibraryText(text: string, library: LibraryFood[]): FoodItem[] | null {
  const segments = splitFoodText(text)
  if (segments.length === 0 || library.length === 0) return null
  const items: FoodItem[] = []
  for (const seg of segments) {
    const food = matchLibrary(seg.name, library) ?? matchLibrary(singular(seg.name), library)
    if (!food) return null
    items.push(itemFromLibrary(food, seg.quantityG ?? food.defaultQuantityG * seg.count))
  }
  return items
}
