import { describe, it, expect } from 'vitest'
import { computeTargets, kcalFloor, mifflinStJeor, readEffectiveTargets, ProfileSchema, isValidTimeZone, type Profile } from './targets'
import { SEED_PROGRAMME } from './seedProgramme'
import { ProgrammeDefinitionSchema } from './programmeSchema'

const owner: Profile = { sex: 'male', age: 40, heightCm: 180, weightKg: 80.5, activityLevel: 'moderate', timezone: 'Europe/London' }

describe('targets', () => {
  it('Mifflin-St Jeor', () => {
    expect(mifflinStJeor({ sex: 'male', age: 40, heightCm: 180, weightKg: 80 })).toBe(1730)
    expect(mifflinStJeor({ sex: 'female', age: 40, heightCm: 165, weightKg: 65 })).toBeCloseTo(1320.25)
  })

  it('reproduces the seed targets for a profile like the seed author', () => {
    const { targets, formulas } = computeTargets(SEED_PROGRAMME, owner)
    expect(targets).toEqual({ kcal: 2200, proteinG: 145, fatG: 75, satFatTargetG: 15, satFatCeilingG: 18, carbsG: 235, fibreMinG: 35 })
    expect(formulas.proteinG).toBe('1.8 g/kg × 80.5 kg = 145 → 145 g')
    expect(formulas.kcal).toMatch(/BMR \(Mifflin-St Jeor\) 1735 × activity 1.55 = 2689 kcal − 500 deficit/)
    expect(formulas.carbsG).toMatch(/^\(2200 − 145×4 − 75×9\) ÷ 4/)
  })

  it('personalises from a different profile and respects the kcal floor', () => {
    const small: Profile = { sex: 'female', age: 60, heightCm: 150, weightKg: 50, activityLevel: 'sedentary', timezone: 'Europe/London' }
    const { targets, formulas } = computeTargets(SEED_PROGRAMME, small)
    expect(targets.kcal).toBe(kcalFloor('female', 1200))
    expect(formulas.kcal).toMatch(/minimum/)
    expect(targets.proteinG).toBe(90)
    expect(targets.carbsG).toBeGreaterThanOrEqual(0)
  })

  it('applies overrides and keeps the ceiling ≥ target', () => {
    const { targets, formulas } = computeTargets(SEED_PROGRAMME, owner, { kcal: 2000, satFatTargetG: 20 })
    expect(targets.kcal).toBe(2000)
    expect(formulas.kcal).toBe('Your override: 2000 kcal')
    expect(targets.satFatCeilingG).toBe(20)
    expect(targets.fatG).toBe(65) // 30% of the overridden kcal
    expect(targets.carbsG).toBe(210)
  })

  it('falls back for a programme without energy/macros', () => {
    const p = ProgrammeDefinitionSchema.parse({ identity: { name: 'x', durationWeeks: 4 } })
    const { targets } = computeTargets(p, owner)
    expect(targets.proteinG).toBe(130)
    expect(targets.fibreMinG).toBe(30)
    expect(targets.satFatCeilingG).toBe(targets.satFatTargetG)
  })

  it('validates profiles and stored targets', () => {
    expect(ProfileSchema.safeParse(owner).success).toBe(true)
    expect(ProfileSchema.safeParse({ ...owner, timezone: 'Mars/Base' }).success).toBe(false)
    expect(isValidTimeZone('Asia/Dubai')).toBe(true)
    expect(readEffectiveTargets({ kcal: 1 })).toBeNull()
    expect(readEffectiveTargets(computeTargets(SEED_PROGRAMME, owner).targets)?.kcal).toBe(2200)
  })
})
