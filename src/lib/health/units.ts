import { z } from 'zod'

/**
 * Units (specs/029 §12.6): kg / cm / mmol/L by default; lb / in / mg/dL as options. Pure.
 * Everything is STORED in kg, cm and mmol/L; conversion happens only for display and input.
 */

export const UnitsSchema = z.object({
  weight: z.enum(['kg', 'lb']).default('kg'),
  length: z.enum(['cm', 'in']).default('cm'),
  lipids: z.enum(['mmol', 'mgdl']).default('mmol'),
})
export type Units = z.infer<typeof UnitsSchema>
export const DEFAULT_UNITS: Units = { weight: 'kg', length: 'cm', lipids: 'mmol' }

export const KG_PER_LB = 0.45359237
export const CM_PER_IN = 2.54
/** Cholesterol (total, LDL, HDL, non-HDL): 1 mmol/L = 38.67 mg/dL. */
export const CHOL_MGDL_PER_MMOL = 38.67
/** Triglycerides: 1 mmol/L = 88.57 mg/dL. */
export const TG_MGDL_PER_MMOL = 88.57

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp

export function parseUnits(raw: unknown): Units {
  const r = UnitsSchema.safeParse(raw ?? {})
  return r.success ? r.data : DEFAULT_UNITS
}

export function kgTo(kg: number, unit: Units['weight']): number {
  return unit === 'lb' ? round(kg / KG_PER_LB, 1) : round(kg, 1)
}
export function toKg(value: number, unit: Units['weight']): number {
  return unit === 'lb' ? round(value * KG_PER_LB, 2) : round(value, 2)
}
export function cmTo(cm: number, unit: Units['length']): number {
  return unit === 'in' ? round(cm / CM_PER_IN, 1) : round(cm, 1)
}
export function toCm(value: number, unit: Units['length']): number {
  return unit === 'in' ? round(value * CM_PER_IN, 1) : round(value, 1)
}

export type LipidKind = 'chol' | 'tg'

/** mmol/L → display unit (mg/dL rounded to whole numbers, mmol/L to 2 dp). */
export function lipidTo(mmol: number, unit: Units['lipids'], kind: LipidKind = 'chol'): number {
  if (unit === 'mmol') return round(mmol, 2)
  return Math.round(mmol * (kind === 'tg' ? TG_MGDL_PER_MMOL : CHOL_MGDL_PER_MMOL))
}

/** Display unit → mmol/L (stored with 2 dp). */
export function toMmol(value: number, unit: Units['lipids'], kind: LipidKind = 'chol'): number {
  if (unit === 'mmol') return round(value, 2)
  return round(value / (kind === 'tg' ? TG_MGDL_PER_MMOL : CHOL_MGDL_PER_MMOL), 2)
}

export function unitLabel(units: Units, kind: 'weight' | 'length' | 'lipids'): string {
  if (kind === 'weight') return units.weight
  if (kind === 'length') return units.length
  return units.lipids === 'mmol' ? 'mmol/L' : 'mg/dL'
}
