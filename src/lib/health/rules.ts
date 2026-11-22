import type { MealSlot, ProgrammeDefinition, NutritionRule } from './programmeSchema'
import type { EffectiveTargets } from './targets'
import { mealsRemaining, sumComponents, sumNutrients, type FoodItem } from './nutrition'
import { daysLeftInWeek, hhmmToMinutes } from './time'
import { preTrainingCoffee } from './training'

/**
 * Deterministic rules engine for the daily loop (specs/029 §6.1 / §6.2). Pure.
 * Rules decide WHAT fired; wording is fixed template text (AI wording is optional and off — not used here).
 *
 * P1a covers the rule types the food log + check-in support: ceilings/targets, daily + weekly components, timing
 * (component-with-meal, caffeine cut-off, last meal before bed), per-meal structure (one starch, protein every
 * occasion) and the treat budget trade-off. Schedule, progression, safety (pain) and adjustment rules arrive with
 * training (P1b) and P2.
 */

export const RECOMMENDATION_GROUPS = ['safety', 'ceiling', 'daily', 'weekly', 'habit'] as const
export type RecommendationGroup = (typeof RECOMMENDATION_GROUPS)[number]

export type RuleType = 'ceiling' | 'target' | 'component' | 'timing' | 'structure' | 'budget' | 'safety'

export interface RuleFinding {
  /** Stable per day, e.g. 'satfat.over_target', 'component.pulses' — used to de-duplicate stored events. */
  key: string
  type: RuleType
  group: RecommendationGroup
  /** Higher = more important within its group. */
  priority: number
  message: string
  data?: Record<string, unknown>
}

export interface RuleEntry {
  time: string
  slot: string | null
  items: Array<Pick<FoodItem, 'name' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'satFatG' | 'fibreG' | 'components' | 'isTreat'>>
}

export interface RuleContext {
  def: ProgrammeDefinition
  targets: EffectiveTargets
  /** Local time now 'HH:MM' (use '23:59' to evaluate a finished day). */
  now: string
  /** Local date being evaluated. */
  date: string
  entries: RuleEntry[]
  /** Component totals for the ISO week so far (including today). */
  weekComponents: Record<string, number>
  /** Planned bedtime 'HH:MM' (programme target or typical from check-ins); null = unknown. */
  bedtime: string | null
  /** Training signals (P1b). Omitted when training data is unavailable — training rules then stay silent. */
  training?: {
    /** A lifting session is recommended today (planned, catch-up or short-week priority). */
    sessionToday: boolean
    trainedToday: boolean
    /** Today's session has joint-watched exercises. */
    jointWatchedToday: boolean
    joint: { level: 'ok' | 'reduce' | 'stop'; message: string | null }
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10
const fmt = (v: number) => (Number.isInteger(r1(v)) ? String(r1(v)) : r1(v).toFixed(1))

function rule<T extends NutritionRule['type']>(def: ProgrammeDefinition, type: T): Extract<NutritionRule, { type: T }> | null {
  return (def.nutritionRules.find(r => r.type === type) as Extract<NutritionRule, { type: T }> | undefined) ?? null
}

function slotOf(def: ProgrammeDefinition, key: string | null): MealSlot | null {
  return key ? def.mealSlots.find(s => s.key === key) ?? null : null
}

function slotLabel(def: ProgrammeDefinition, key: string | null): string {
  return slotOf(def, key)?.name ?? 'That snack'
}

/** Eating window from the first slot start to the last slot end (default 07:00–20:00). */
function eatingWindow(def: ProgrammeDefinition): { start: number; end: number } {
  const starts = def.mealSlots.map(s => hhmmToMinutes(s.start)).filter((v): v is number => v !== null)
  const ends = def.mealSlots.map(s => hhmmToMinutes(s.end)).filter((v): v is number => v !== null)
  const start = starts.length ? Math.min(...starts) : 7 * 60
  const end = ends.length ? Math.max(...ends) : 20 * 60
  return end > start ? { start, end } : { start: 7 * 60, end: 20 * 60 }
}

/** Fraction of the eating window that has passed at `now` (0–1). */
export function dayPace(def: ProgrammeDefinition, now: string): number {
  const { start, end } = eatingWindow(def)
  const t = hhmmToMinutes(now) ?? 0
  return Math.max(0, Math.min(1, (t - start) / (end - start)))
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Minutes on a bedtime scale: times before noon count as after midnight. */
function nightScale(min: number): number {
  return min < 12 * 60 ? min + 1440 : min
}

export function evaluateRules(ctx: RuleContext): RuleFinding[] {
  const { def, targets, now, entries } = ctx
  const out: RuleFinding[] = []
  const items = entries.flatMap(e => e.items)
  const totals = sumNutrients(items)
  const comps = sumComponents(items)
  const nowMin = hhmmToMinutes(now) ?? 0
  const remainingMeals = mealsRemaining(def.mealSlots, now, entries.map(e => e.slot))
  const nextMealName = remainingMeals[0]?.name.toLowerCase() ?? null

  // ── Ceilings / targets: saturated fat ─────────────────────────────────────
  const sat = totals.satFatG
  if (sat > targets.satFatCeilingG) {
    out.push({
      key: 'satfat.over_ceiling', type: 'ceiling', group: 'ceiling', priority: 100,
      message: `Saturated fat is ${fmt(sat)} g — over your ${fmt(targets.satFatCeilingG)} g ceiling. Keep the rest of today plant-based: no cheese, butter, cream or red meat.`,
      data: { satFatG: sat, ceilingG: targets.satFatCeilingG },
    })
  } else if (sat > targets.satFatTargetG) {
    out.push({
      key: 'satfat.over_target', type: 'ceiling', group: 'ceiling', priority: 90,
      message: `Saturated fat ${fmt(sat)}/${fmt(targets.satFatTargetG)} g — past your target, ${fmt(targets.satFatCeilingG - sat)} g to the ceiling. Keep any remaining food to fish, chicken, tofu and vegetables.`,
      data: { satFatG: sat, targetG: targets.satFatTargetG, ceilingG: targets.satFatCeilingG },
    })
  } else if (sat >= targets.satFatTargetG * 0.75 && remainingMeals.length > 0) {
    out.push({
      key: 'satfat.at_risk', type: 'ceiling', group: 'ceiling', priority: 80,
      message: `Saturated fat at ${fmt(sat)}/${fmt(targets.satFatTargetG)} g — keep ${nextMealName ?? 'your next meal'} to fish/chicken/tofu with vegetables; skip cheese and butter sauces.`,
      data: { satFatG: sat, targetG: targets.satFatTargetG },
    })
  }

  // ── Ceilings / targets: energy ────────────────────────────────────────────
  if (totals.kcal > targets.kcal) {
    out.push({
      key: 'kcal.over', type: 'ceiling', group: 'ceiling', priority: 70,
      message: `Energy ${totals.kcal}/${targets.kcal} kcal — over today's target. Keep anything else to lean protein and vegetables, no starch.`,
      data: { kcal: totals.kcal, targetKcal: targets.kcal },
    })
  } else if (totals.kcal >= targets.kcal * 0.85 && remainingMeals.length > 0) {
    out.push({
      key: 'kcal.at_risk', type: 'ceiling', group: 'ceiling', priority: 60,
      message: `${targets.kcal - totals.kcal} kcal left with ${remainingMeals.length} meal${remainingMeals.length > 1 ? 's' : ''} to go — make ${nextMealName ?? 'the next one'} lean protein and vegetables.`,
      data: { kcal: totals.kcal, targetKcal: targets.kcal },
    })
  }

  // ── Daily targets behind pace ─────────────────────────────────────────────
  const pace = dayPace(def, now)
  if (nowMin >= 12 * 60 && totals.proteinG < targets.proteinG * pace * 0.8) {
    const left = r1(targets.proteinG - totals.proteinG)
    const snackLeft = def.mealSlots.some(s => !s.isMeal && (hhmmToMinutes(s.end) ?? 0) > nowMin)
    const tips = [
      snackLeft ? 'Afternoon slot: 250 g skyr (+26 g).' : null,
      remainingMeals.length > 0 ? `${remainingMeals[remainingMeals.length - 1].name}: 150 g chicken or tofu (+40 g).` : null,
    ].filter(Boolean).join(' ')
    out.push({
      key: 'protein.behind', type: 'target', group: 'daily', priority: 50,
      message: `Protein ${fmt(totals.proteinG)}/${fmt(targets.proteinG)} g — behind pace (${fmt(left)} g to go).${tips ? ` ${tips}` : ''}`,
      data: { proteinG: totals.proteinG, targetG: targets.proteinG, pace: r1(pace) },
    })
  }
  if (nowMin >= 16 * 60 && totals.fibreG < targets.fibreMinG * pace * 0.8) {
    out.push({
      key: 'fibre.behind', type: 'target', group: 'daily', priority: 40,
      message: `Fibre ${fmt(totals.fibreG)}/${fmt(targets.fibreMinG)} g — add vegetables, pulses or oat bran at ${nextMealName ?? 'your next meal'}.`,
      data: { fibreG: totals.fibreG, minG: targets.fibreMinG },
    })
  }

  // ── Components: daily ─────────────────────────────────────────────────────
  for (const c of def.components) {
    if (c.period !== 'day') continue
    const value = comps[c.key] ?? 0
    if (value >= c.target) continue
    const after = hhmmToMinutes(c.nudgeAfter ?? '16:00') ?? 16 * 60
    if (nowMin < after) continue
    const status = value === 0
      ? `No ${c.name.toLowerCase()} yet today`
      : `${c.name} ${fmt(value)}/${fmt(c.target)} ${c.unit} today`
    const tip = c.suggestion ?? (c.sources[0] ? `Add ${c.sources[0].toLowerCase()}.` : '')
    out.push({
      key: `component.${c.key}`, type: 'component', group: 'daily', priority: 45 - Math.round((value / c.target) * 10),
      message: `${status} — ${tip}`.trim(),
      data: { component: c.key, value, target: c.target },
    })
  }

  // ── Components: weekly ────────────────────────────────────────────────────
  const daysLeft = daysLeftInWeek(ctx.date)
  for (const c of def.components) {
    if (c.period !== 'week') continue
    const value = ctx.weekComponents[c.key] ?? 0
    const remaining = c.target - value
    if (remaining <= 0 || daysLeft > remaining * 2) continue
    out.push({
      key: `component_week.${c.key}`, type: 'component', group: 'weekly', priority: 30 + Math.round(remaining),
      message: `${c.name} ${fmt(value)} of ${fmt(c.target)} this week — ${c.suggestion ?? `plan ${c.sources[0]?.toLowerCase() ?? 'it'} before Sunday.`}`,
      data: { component: c.key, value, target: c.target, daysLeft },
    })
  }

  // ── Timing: component must be eaten with a meal ───────────────────────────
  for (const c of def.components) {
    if (c.timing !== 'with_meal') continue
    const offMeal = entries.find(e => !slotOf(def, e.slot)?.isMeal && sumComponents(e.items)[c.key] > 0)
    if (!offMeal) continue
    out.push({
      key: `timing.with_meal.${c.key}`, type: 'timing', group: 'habit', priority: 25,
      message: `${c.name} work best with a meal — have the next one with ${nextMealName ?? 'a meal'}.`,
      data: { component: c.key, time: offMeal.time },
    })
  }

  // ── Timing: caffeine cut-off ──────────────────────────────────────────────
  const caffeine = rule(def, 'caffeine_cutoff')
  const cutoffTime = caffeine?.time ?? def.sleep?.caffeineCutoff ?? null
  const cutoff = cutoffTime ? hhmmToMinutes(cutoffTime) : null
  if (cutoff !== null) {
    const late = entries.find(e => (hhmmToMinutes(e.time) ?? 0) > cutoff && (sumComponents(e.items).caffeine_mg ?? 0) >= 15)
    if (late) {
      out.push({
        key: 'timing.caffeine', type: 'timing', group: 'habit', priority: 28,
        message: `Caffeine at ${late.time} is after your ${cutoffTime} cut-off — choose decaf; sleep matters more than the lift.`,
        data: { time: late.time, cutoff: cutoffTime },
      })
    }
  }

  // ── Timing: last meal before bed ──────────────────────────────────────────
  const lastMeal = rule(def, 'last_meal_before_bed')
  const bed = ctx.bedtime ? hhmmToMinutes(ctx.bedtime) : null
  if (lastMeal && bed !== null) {
    const bedN = nightScale(bed)
    const gap = lastMeal.minGapHours * 60
    const late = entries.find(e => {
      const t = hhmmToMinutes(e.time)
      if (t === null || sumNutrients(e.items).kcal < 50) return false
      const tN = t < 4 * 60 ? t + 1440 : t
      return tN > bedN - gap && tN <= bedN
    })
    if (late) {
      out.push({
        key: 'timing.last_meal', type: 'timing', group: 'habit', priority: 22,
        message: `Last food at ${late.time} is within ${fmt(lastMeal.minGapHours)} h of your ${ctx.bedtime} bedtime — move the afternoon slot earlier tomorrow.`,
        data: { time: late.time, bedtime: ctx.bedtime },
      })
    }
  }

  // ── Per-meal structure: one starch per meal ───────────────────────────────
  const oneStarch = rule(def, 'one_starch_per_meal')
  if (oneStarch) {
    const heavy = entries.find(e => (sumComponents(e.items).starch_servings ?? 0) > oneStarch.maxStarchServings)
    if (heavy) {
      const today = remainingMeals.length > 0 ? ` Today: skip starch at ${nextMealName} to stay on target.` : ''
      out.push({
        key: 'structure.one_starch', type: 'structure', group: 'habit', priority: 35,
        message: `One-starch rule: ${slotLabel(def, heavy.slot).toLowerCase()} had ${fmt(sumComponents(heavy.items).starch_servings)} starch servings — next time choose rice or bread.${today}`,
        data: { slot: heavy.slot, time: heavy.time },
      })
    }
  }

  // ── Per-meal structure: protein in every eating occasion ──────────────────
  const proteinRule = rule(def, 'protein_every_occasion')
  if (proteinRule) {
    const low = entries.find(e => {
      const t = sumNutrients(e.items)
      return t.kcal >= 100 && t.proteinG < proteinRule.minProteinG
    })
    if (low) {
      out.push({
        key: 'structure.protein_occasion', type: 'structure', group: 'habit', priority: 20,
        message: `${slotLabel(def, low.slot)} had ${fmt(sumNutrients(low.items).proteinG)} g protein — add protein to every eating occasion (skyr, edamame, eggs or a soya latte).`,
        data: { slot: low.slot, time: low.time },
      })
    }
  }

  // ── Budget trade-off: treats ──────────────────────────────────────────────
  const treat = rule(def, 'treat_budget')
  if (treat) {
    const treatItems = items.filter(i => i.isTreat && i.kcal >= treat.minKcal)
    if (treatItems.length > 0) {
      const kcal = treatItems.reduce((s, i) => s + i.kcal, 0)
      const spare = r1(targets.satFatTargetG - sat)
      const pay = remainingMeals.length > 0
        ? `drop the starch at ${joinNames(remainingMeals.map(m => m.name.toLowerCase()))}`
        : 'drop a starch serving at tomorrow\'s meals'
      out.push({
        key: 'budget.treat', type: 'budget', group: 'daily', priority: 55,
        message: spare >= 0
          ? `Treat (${kcal} kcal) fits your sat-fat spare (${fmt(spare)} g left). Pay the calories: ${pay}.`
          : `Treat (${kcal} kcal) is past your sat-fat spare. Pay the calories (${pay}) and keep the rest of today low in saturated fat.`,
        data: { kcal, satFatSpareG: spare },
      })
    }
  }

  // ── Training (P1b): joint safety + pre-training coffee timing ─────────────
  const tr = ctx.training
  if (tr) {
    if (tr.joint.level === 'stop') {
      out.push({
        key: 'safety.joint_red_flag', type: 'safety', group: 'safety', priority: 100,
        message: tr.joint.message ?? 'Stop leg work and see your physiotherapist.',
      })
    } else if (tr.joint.level === 'reduce' && tr.sessionToday && tr.jointWatchedToday && !tr.trainedToday) {
      out.push({
        key: 'safety.joint_reduce', type: 'safety', group: 'safety', priority: 80,
        message: tr.joint.message ?? 'Shorten the range or reduce the load on joint-watched exercises today.',
      })
    }
    const coffee = preTrainingCoffee(cutoffTime, now, tr.sessionToday, tr.trainedToday)
    if (coffee) out.push({ key: coffee.key, type: 'timing', group: 'habit', priority: 26, message: coffee.message })
  }

  return out
}

const GROUP_ORDER: Record<RecommendationGroup, number> = { safety: 0, ceiling: 1, daily: 2, weekly: 3, habit: 4 }

export const MAX_RECOMMENDATIONS = 3

/** §6.2 ranking: safety > ceilings at risk > daily targets behind pace > weekly targets > habits; max 3. */
export function rankRecommendations(findings: RuleFinding[], max = MAX_RECOMMENDATIONS): RuleFinding[] {
  return [...findings]
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || b.priority - a.priority || a.key.localeCompare(b.key))
    .slice(0, max)
}

/** Rule coverage for the seed programme (specs/029 §11): every §6.1 rule type and whether P1a evaluates it. */
export const RULE_COVERAGE: ReadonlyArray<{ type: string; example: string; phase: 'P1a' | 'P1b' | 'P2' }> = [
  { type: 'Daily ceiling / target', example: 'sat fat ≤15 g target / 18 g ceiling; protein; kcal; fibre', phase: 'P1a' },
  { type: 'Component target (day)', example: 'stanols, beta-glucan, soy, nuts, pulses', phase: 'P1a' },
  { type: 'Component target (week)', example: 'oily fish 2×/week', phase: 'P1a' },
  { type: 'Timing', example: 'stanols with a meal; caffeine cut-off 14:00; last meal ≥2 h before bed', phase: 'P1a' },
  { type: 'Per-meal structure', example: 'one starch per meal; protein every eating occasion', phase: 'P1a' },
  { type: 'Budget trade-off', example: 'treat uses sat-fat spare; pay calories by dropping starch', phase: 'P1a' },
  { type: 'Timing (training)', example: 'pre-training coffee before the cut-off; skip it before an evening session (rules.ts + training.ts)', phase: 'P1b' },
  { type: 'Schedule', example: 'rest day between lifts; A→B→C; C first if short (training.ts)', phase: 'P1b' },
  { type: 'Progression', example: 'top of range → add load; stall ×2 → add a set; block sets/reps; light weeks; deload (training.ts)', phase: 'P1b' },
  { type: 'Safety', example: 'pain thresholds, red flags, excluded movements, unlocks (painRules.ts, training.ts)', phase: 'P1b' },
  { type: 'Adjustment', example: 'fortnightly ±150 kcal from 7-day averages, accept/decline (adjustment.ts)', phase: 'P2' },
  { type: 'Tracking', example: '"don\'t track" metrics are hidden', phase: 'P1a' },
]
