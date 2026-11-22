import dataset from './reference/usdaSr28Foods.json'
import { normalizeFoodName } from './foodLibrary'
import { REFERENCE_SOURCE_LABEL } from './itemMeta'

/**
 * Reference nutrition data (specs/029 P3.1). A compact bundled subset of a published food-composition dataset
 * (see src/lib/health/reference/README.md for provenance and licence). The AI identifies items, portions and a
 * reference key; the NUMBERS come from here, scaled to the portion. Pure and deterministic.
 */

export interface ReferencePer100 {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  satFatG: number
  fibreG: number
}

export interface ReferenceFood {
  /** "<dataset>:<dataset row id>", e.g. "usda-sr28:09037". */
  id: string
  name: string
  aliases: string[]
  /** The dataset's own description of the row. */
  sourceDesc: string
  per100: ReferencePer100
}

interface DatasetFile {
  dataset: string
  datasetId: string
  licence: string
  rows: ReferenceFood[]
}

const FILE = dataset as DatasetFile

export const REFERENCE_DATASET = {
  id: FILE.datasetId,
  name: FILE.dataset,
  /** Short label for the item source chip ("Ref: USDA SR28"). */
  label: REFERENCE_SOURCE_LABEL,
  licence: FILE.licence,
} as const

export const REFERENCE_FOODS: readonly ReferenceFood[] = FILE.rows

const BY_ID = new Map(REFERENCE_FOODS.map(f => [f.id, f]))

export function referenceById(id: string | null | undefined): ReferenceFood | null {
  if (!id) return null
  return BY_ID.get(id.trim()) ?? null
}

// ── Matching ────────────────────────────────────────────────────────────────

const STOP = new Set(['of', 'the', 'a', 'an', 'with', 'my', 'some', 'and', 'on', 'in', 'x', 'g', 'ml', 'cup', 'cups', 'slice', 'slices', 'piece', 'pieces', 'portion', 'small', 'large', 'medium', 'one', 'two', 'three', 'half'])

/** Simple English singular for matching ("eggs" → "egg", "tomatoes" → "tomato", "berries" → "berry"). */
export function singularWord(w: string): string {
  if (w.length <= 3) return w
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (/(ch|sh|ss|x|z|o)es$/.test(w)) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1)
  return w
}

export function matchTokens(text: string): string[] {
  return normalizeFoodName(text)
    .split(' ')
    .filter(t => t.length > 1 && !STOP.has(t) && !/^[0-9]+$/.test(t))
    .map(singularWord)
}

/** Name without the parenthetical qualifier ("Salmon (cooked)" → "Salmon"). */
const stripParen = (s: string) => s.replace(/\([^)]*\)/g, ' ')

interface Indexed { food: ReferenceFood; names: Array<{ norm: string; tokens: Set<string>; primary: boolean; weight: number }> }

/**
 * Names per food: the display name, the display name without its qualifier (weighted 0.97 so "salmon" prefers the
 * food that lists "salmon" as an alias — the everyday default, e.g. cooked — over every "Salmon (…)" variant), and
 * the hand-written aliases.
 */
const INDEX: Indexed[] = REFERENCE_FOODS.map(food => ({
  food,
  names: [
    { s: food.name, primary: true, weight: 1 },
    { s: stripParen(food.name), primary: true, weight: 0.97 },
    ...food.aliases.map(a => ({ s: a, primary: false, weight: 1 })),
  ].map(({ s, primary, weight }) => ({ norm: matchTokens(s).join(' '), tokens: new Set(matchTokens(s)), primary, weight }))
    .filter(n => n.tokens.size > 0),
}))

/**
 * Score 0–1 of a query against one name: 1 for an exact (normalised, singular) match; otherwise
 * 0.65 × (share of query words found) + 0.35 × (share of the name's words found), so short precise names
 * beat long ones that merely contain the words.
 */
export function nameScore(queryTokens: string[], name: { norm: string; tokens: Set<string> }): number {
  if (queryTokens.length === 0) return 0
  if (queryTokens.join(' ') === name.norm) return 1
  const q = new Set(queryTokens)
  let inter = 0
  for (const t of q) if (name.tokens.has(t)) inter++
  if (inter === 0) return 0
  return 0.65 * (inter / q.size) + 0.35 * (inter / name.tokens.size)
}

export interface ReferenceHit { food: ReferenceFood; score: number }

/** Deterministic ranked search: best score per food, ties → primary-name hit, then shorter name, then id. */
export function searchReference(query: string, limit = 5): ReferenceHit[] {
  const qt = matchTokens(query)
  if (qt.length === 0) return []
  const hits: Array<ReferenceHit & { primary: boolean }> = []
  for (const entry of INDEX) {
    let best = 0
    let primary = false
    for (const n of entry.names) {
      const s = nameScore(qt, n) * n.weight
      if (s > best || (s === best && s > 0 && n.primary && !primary)) { best = s; primary = n.primary }
    }
    if (best > 0) hits.push({ food: entry.food, score: Math.round(best * 1000) / 1000, primary })
  }
  hits.sort((a, b) =>
    b.score - a.score
    || Number(b.primary) - Number(a.primary)
    || a.food.name.length - b.food.name.length
    || a.food.id.localeCompare(b.food.id))
  return hits.slice(0, limit).map(({ food, score }) => ({ food, score }))
}

/** Score needed to accept a match without the model choosing it (photo-only logs, missing key). */
export const STRICT_MATCH_SCORE = 0.8

/** Confident single match for an item name, or null (better an "AI estimate" than a wrong reference row). */
export function matchReferenceStrict(name: string): ReferenceFood | null {
  const [top, second] = searchReference(name, 2)
  if (!top || top.score < STRICT_MATCH_SCORE) return null
  // Two different foods equally good → ambiguous: leave it to the model / AI numbers.
  if (second && second.score === top.score && top.score < 1) return null
  return top.food
}

// ── Candidates for the prompt ───────────────────────────────────────────────

/** Drinks / dishes whose words do not name their reference components. */
const EXPANSIONS: Array<{ re: RegExp; add: string[] }> = [
  { re: /flat white|latte|cappuccino|cortado|macchiato|cafe au lait|mocha/i, add: ['espresso', 'milk', 'semi skimmed milk', 'whole milk'] },
  { re: /americano|filter coffee|long black|coffee/i, add: ['coffee', 'espresso'] },
  { re: /\btea\b|cay|chai/i, add: ['tea', 'semi skimmed milk'] },
  { re: /toast|sandwich|bruschetta/i, add: ['white bread', 'wholemeal bread', 'sourdough'] },
  { re: /porridge|overnight oats/i, add: ['porridge oats', 'porridge'] },
  { re: /salad/i, add: ['side salad', 'romaine lettuce', 'tomato', 'cucumber', 'olive oil'] },
  { re: /curry|dal|daal|dhal/i, add: ['lentils', 'split peas', 'white rice', 'naan', 'chickpeas'] },
  { re: /kebab|kebap|kofte|kofta|shawarma/i, add: ['lamb mince', 'chicken breast', 'pitta', 'flour tortilla wrap'] },
  { re: /menemen|shakshuka/i, add: ['egg', 'chopped tomatoes', 'red pepper', 'onion', 'olive oil'] },
  { re: /pilaf|pilav|pilau/i, add: ['bulgur', 'white rice', 'butter'] },
]

/** Added fats are offered on every prompt so assumptions (butter, oil, ghee…) can use reference numbers too. */
const ADDED_FAT_CANDIDATES = ['butter', 'olive oil', 'rapeseed oil', 'sunflower oil', 'ghee', 'vegetable oil spread', 'mayonnaise', 'oil and vinegar dressing']

/**
 * Up to `limit` reference rows relevant to a free-text log, for the model to choose `reference_key`s from.
 * Deterministic: per text segment (split on , + ; "and" "with" "on") the top hits, then each longer word on its
 * own, then expansions (flat white → espresso + milks), then the added-fat rows.
 */
export function referenceCandidates(text: string | null, limit = 45): ReferenceFood[] {
  const out: ReferenceFood[] = []
  const add = (f: ReferenceFood) => { if (out.length < limit && !out.some(x => x.id === f.id)) out.push(f) }
  const t = (text ?? '').slice(0, 1000)
  if (t.trim()) {
    const segments = t.split(/,|\+|\n|;|\band\b|\bwith\b|\bon\b|&/i).map(s => s.trim()).filter(Boolean)
    for (const seg of segments) for (const h of searchReference(seg, 4)) if (h.score >= 0.4) add(h.food)
    const words = [...new Set(matchTokens(t))].filter(w => w.length >= 4)
    for (const w of words) for (const h of searchReference(w, 2)) if (h.score >= 0.5) add(h.food)
    for (const e of EXPANSIONS) if (e.re.test(t)) for (const q of e.add) { const h = searchReference(q, 1)[0]; if (h) add(h.food) }
  }
  for (const q of ADDED_FAT_CANDIDATES) { const h = searchReference(q, 1)[0]; if (h) add(h.food) }
  return out
}

// ── Scaling ─────────────────────────────────────────────────────────────────

const r1 = (v: number) => Math.round(v * 10) / 10

/** Reference values for `grams` of a food (kcal whole, the rest to 0.1 g). */
export function scaleReference(food: ReferenceFood, grams: number): ReferencePer100 {
  const f = grams > 0 ? grams / 100 : 0
  return {
    kcal: Math.round(food.per100.kcal * f),
    proteinG: r1(food.per100.proteinG * f),
    carbsG: r1(food.per100.carbsG * f),
    fatG: r1(food.per100.fatG * f),
    satFatG: r1(food.per100.satFatG * f),
    fibreG: r1(food.per100.fibreG * f),
  }
}

/** Sum of several (food, grams) parts — a composite item such as a flat white (espresso + milk). */
export function scaleReferenceParts(parts: Array<{ food: ReferenceFood; grams: number }>): ReferencePer100 {
  const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, satFatG: 0, fibreG: 0 }
  for (const p of parts) {
    const f = p.grams > 0 ? p.grams / 100 : 0
    t.kcal += p.food.per100.kcal * f
    t.proteinG += p.food.per100.proteinG * f
    t.carbsG += p.food.per100.carbsG * f
    t.fatG += p.food.per100.fatG * f
    t.satFatG += p.food.per100.satFatG * f
    t.fibreG += p.food.per100.fibreG * f
  }
  return { kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG), satFatG: r1(t.satFatG), fibreG: r1(t.fibreG) }
}
