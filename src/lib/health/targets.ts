import { z } from 'zod'
import type { ProgrammeDefinition } from './programmeSchema'

/**
 * Personal profile → effective daily targets (specs/029 §3.2, US1 acceptance 3). Pure.
 * Every computed number comes with the formula used so the UI can show it.
 */

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary:   1.2,
  light:       1.375,
  moderate:    1.55,
  active:      1.725,
  very_active: 1.9,
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary:   'Sedentary (desk job, little exercise)',
  light:       'Light (1–3 sessions a week)',
  moderate:    'Moderate (3–5 sessions a week)',
  active:      'Active (6–7 sessions a week)',
  very_active: 'Very active (physical job + training)',
}

/** IANA timezone check without a list: Intl throws RangeError for unknown zones. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const ProfileSchema = z.object({
  sex:           z.enum(['male', 'female']),
  age:           z.number().int().min(18).max(100),
  heightCm:      z.number().min(120).max(230),
  weightKg:      z.number().min(35).max(300),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  timezone:      z.string().min(1).max(64).refine(isValidTimeZone, { message: 'Unknown timezone' }),
})
export type Profile = z.infer<typeof ProfileSchema>

export const TARGET_KEYS = ['kcal', 'proteinG', 'fatG', 'satFatTargetG', 'satFatCeilingG', 'carbsG', 'fibreMinG'] as const
export type TargetKey = (typeof TARGET_KEYS)[number]

export interface EffectiveTargets {
  kcal: number
  proteinG: number
  fatG: number
  satFatTargetG: number
  satFatCeilingG: number
  carbsG: number
  fibreMinG: number
}

/** Optional per-target overrides the user typed in. */
export const TargetOverridesSchema = z.object({
  kcal:           z.number().min(1000).max(6000).optional(),
  proteinG:       z.number().min(20).max(400).optional(),
  fatG:           z.number().min(10).max(300).optional(),
  satFatTargetG:  z.number().min(1).max(100).optional(),
  satFatCeilingG: z.number().min(1).max(100).optional(),
  carbsG:         z.number().min(0).max(800).optional(),
  fibreMinG:      z.number().min(0).max(100).optional(),
}).strict()
export type TargetOverrides = z.infer<typeof TargetOverridesSchema>

export interface TargetComputation {
  targets: EffectiveTargets
  /** Human-readable formula per target, e.g. "1.8 g/kg × 80 kg = 144 → 145 g". */
  formulas: Record<TargetKey, string>
  bmr: number
  tdee: number
}

const round = (v: number, step: number) => Math.round(v / step) * step
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/** Mifflin-St Jeor resting energy (kcal/day). */
export function mifflinStJeor(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161)
}

/** Absolute safety floor for a personalised kcal target. */
export function kcalFloor(sex: Profile['sex'], programmeMin?: number): number {
  return Math.max(sex === 'male' ? 1500 : 1200, programmeMin ?? 0)
}

/**
 * Targets for one profile. Personalised targets (protein g/kg, TDEE-based kcal, fat % of kcal, carbs remainder) are
 * computed from the profile; fixed programme values are used as-is; overrides win last (then carbs re-derived only
 * when carbs were not overridden and the programme uses the remainder rule). Sat-fat ceiling is never below target.
 */
export function computeTargets(def: ProgrammeDefinition, profile: Profile, overrides: TargetOverrides = {}): TargetComputation {
  const bmr = Math.round(mifflinStJeor(profile))
  const factor = ACTIVITY_FACTORS[profile.activityLevel]
  const tdee = Math.round(bmr * factor)
  const formulas = {} as Record<TargetKey, string>

  // Energy
  const energy = def.energy
  let kcal: number
  if (energy?.mode === 'tdee_deficit') {
    const deficit = energy.deficitKcal ?? 0
    const floor = kcalFloor(profile.sex, energy.minKcal)
    const raw = tdee - deficit
    kcal = Math.max(floor, round(raw, 50))
    formulas.kcal =
      `BMR (Mifflin-St Jeor) ${bmr} × activity ${factor} = ${tdee} kcal − ${deficit} deficit = ${raw} → ${kcal} kcal` +
      (kcal === floor && round(raw, 50) < floor ? ` (raised to the ${floor} kcal minimum)` : '')
  } else {
    kcal = energy?.referenceKcal ?? round(tdee, 50)
    formulas.kcal = energy?.referenceKcal !== undefined
      ? `Programme value ${kcal} kcal`
      : `Maintenance: BMR ${bmr} × activity ${factor} = ${tdee} → ${kcal} kcal`
  }
  if (overrides.kcal !== undefined) { kcal = overrides.kcal; formulas.kcal = `Your override: ${kcal} kcal` }

  // Protein
  const protein = def.macros?.protein
  let proteinG: number
  if (protein?.gPerKg !== undefined) {
    const raw = protein.gPerKg * profile.weightKg
    proteinG = round(raw, 5)
    formulas.proteinG = `${protein.gPerKg} g/kg × ${fmt(profile.weightKg)} kg = ${fmt(Math.round(raw))} → ${proteinG} g`
  } else {
    proteinG = protein?.g ?? round(1.6 * profile.weightKg, 5)
    formulas.proteinG = protein?.g !== undefined ? `Programme value ${proteinG} g` : `1.6 g/kg × ${fmt(profile.weightKg)} kg → ${proteinG} g`
  }
  if (overrides.proteinG !== undefined) { proteinG = overrides.proteinG; formulas.proteinG = `Your override: ${proteinG} g` }

  // Fat
  const fat = def.macros?.fat
  let fatG: number
  if (fat?.pctOfKcal !== undefined && energy?.mode === 'tdee_deficit') {
    const raw = (kcal * fat.pctOfKcal) / 9
    fatG = round(raw, 5)
    formulas.fatG = `${Math.round(fat.pctOfKcal * 100)}% × ${kcal} kcal ÷ 9 = ${Math.round(raw)} → ${fatG} g`
  } else {
    fatG = fat?.g ?? round((kcal * 0.3) / 9, 5)
    formulas.fatG = fat?.g !== undefined ? `Programme value ${fatG} g` : `30% × ${kcal} kcal ÷ 9 → ${fatG} g`
  }
  if (overrides.fatG !== undefined) { fatG = overrides.fatG; formulas.fatG = `Your override: ${fatG} g` }

  // Saturated fat
  let satFatTargetG = def.macros?.satFat?.targetG ?? round((kcal * 0.1) / 9, 1)
  formulas.satFatTargetG = def.macros?.satFat?.targetG !== undefined
    ? `Programme target ${satFatTargetG} g`
    : `10% × ${kcal} kcal ÷ 9 → ${satFatTargetG} g`
  if (overrides.satFatTargetG !== undefined) { satFatTargetG = overrides.satFatTargetG; formulas.satFatTargetG = `Your override: ${satFatTargetG} g` }
  let satFatCeilingG = def.macros?.satFat?.ceilingG ?? satFatTargetG
  formulas.satFatCeilingG = def.macros?.satFat?.ceilingG !== undefined ? `Programme ceiling ${satFatCeilingG} g` : `Same as target ${satFatCeilingG} g`
  if (overrides.satFatCeilingG !== undefined) { satFatCeilingG = overrides.satFatCeilingG; formulas.satFatCeilingG = `Your override: ${satFatCeilingG} g` }
  if (satFatCeilingG < satFatTargetG) {
    satFatCeilingG = satFatTargetG
    formulas.satFatCeilingG += ` (raised to the target ${satFatTargetG} g)`
  }

  // Carbs
  let carbsG: number
  if (overrides.carbsG !== undefined) {
    carbsG = overrides.carbsG
    formulas.carbsG = `Your override: ${carbsG} g`
  } else if (def.macros?.carbs?.mode === 'fixed' && def.macros.carbs.g !== undefined) {
    carbsG = def.macros.carbs.g
    formulas.carbsG = `Programme value ${carbsG} g`
  } else {
    const raw = (kcal - proteinG * 4 - fatG * 9) / 4
    carbsG = Math.max(0, round(raw, 5))
    formulas.carbsG = `(${kcal} − ${proteinG}×4 − ${fatG}×9) ÷ 4 = ${Math.round(raw)} → ${carbsG} g`
  }

  // Fibre
  let fibreMinG = def.macros?.fibre?.minG ?? 30
  formulas.fibreMinG = def.macros?.fibre?.minG !== undefined ? `Programme minimum ${fibreMinG} g` : `Default minimum ${fibreMinG} g`
  if (overrides.fibreMinG !== undefined) { fibreMinG = overrides.fibreMinG; formulas.fibreMinG = `Your override: ${fibreMinG} g` }

  return {
    targets: { kcal, proteinG, fatG, satFatTargetG, satFatCeilingG, carbsG, fibreMinG },
    formulas,
    bmr,
    tdee,
  }
}

export const TARGET_LABELS: Record<TargetKey, string> = {
  kcal:           'Energy',
  proteinG:       'Protein',
  fatG:           'Fat',
  satFatTargetG:  'Saturated fat (target)',
  satFatCeilingG: 'Saturated fat (ceiling)',
  carbsG:         'Carbs',
  fibreMinG:      'Fibre (minimum)',
}

/** Read stored effective targets (jsonb) defensively; anything missing → null (caller shows "not set"). */
export function readEffectiveTargets(raw: unknown): EffectiveTargets | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const out: Partial<EffectiveTargets> = {}
  for (const k of TARGET_KEYS) {
    const v = r[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    out[k] = v
  }
  return out as EffectiveTargets
}
