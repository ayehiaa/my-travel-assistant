import { describe, expect, it } from 'vitest'
import { retargetAfterEdit, targetsForSwitch } from './programmeEdit'
import { replaceSection, sectionOf } from './programmeImport'
import { SEED_PROGRAMME } from './seedProgramme'
import { computeTargets, type Profile } from './targets'

const PROFILE: Profile = { sex: 'male', age: 40, heightCm: 180, weightKg: 80.5, activityLevel: 'moderate', timezone: 'Europe/London' }

describe('retargetAfterEdit', () => {
  const base = computeTargets(SEED_PROGRAMME, PROFILE).targets
  it('keeps targets when the edit does not touch energy / macros', () => {
    const r = replaceSection(SEED_PROGRAMME, 'sleep', { sleep: { ...SEED_PROGRAMME.sleep, caffeineCutoff: '13:00' } })
    if (!r.ok) throw new Error('edit failed')
    const current = { ...base, kcal: base.kcal - 150 }
    expect(retargetAfterEdit(SEED_PROGRAMME, r.definition, PROFILE, {}, current)).toEqual({ targets: current, changed: false })
  })
  it('re-applies accepted adjustments on top of new macros', () => {
    const macros = sectionOf(SEED_PROGRAMME, 'macros')
    const m = macros.macros as Record<string, unknown>
    const r = replaceSection(SEED_PROGRAMME, 'macros', { ...macros, macros: { ...m, satFat: { targetG: 13, ceilingG: 16 } } })
    if (!r.ok) throw new Error('edit failed')
    const current = { ...base, kcal: base.kcal - 150, carbsG: base.carbsG - 40 }
    const out = retargetAfterEdit(SEED_PROGRAMME, r.definition, PROFILE, {}, current)
    expect(out.changed).toBe(true)
    expect(out.targets).toMatchObject({ kcal: base.kcal - 150, carbsG: base.carbsG - 40, satFatTargetG: 13, satFatCeilingG: 16 })
  })
  it('no profile → unchanged', () => {
    expect(retargetAfterEdit(SEED_PROGRAMME, SEED_PROGRAMME, null, {}, base).changed).toBe(false)
  })
  it('switch computes fresh targets', () => {
    expect(targetsForSwitch(SEED_PROGRAMME, PROFILE)).toEqual(base)
  })
})
