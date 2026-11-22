import { describe, it, expect } from 'vitest'
import { cmTo, kgTo, lipidTo, parseUnits, toCm, toKg, toMmol, unitLabel, DEFAULT_UNITS } from './units'

describe('units', () => {
  it('defaults to kg / cm / mmol', () => {
    expect(parseUnits(undefined)).toEqual(DEFAULT_UNITS)
    expect(parseUnits({ weight: 'lb' })).toEqual({ weight: 'lb', length: 'cm', lipids: 'mmol' })
    expect(parseUnits({ weight: 'stone' })).toEqual(DEFAULT_UNITS)
  })
  it('converts weight and length both ways', () => {
    expect(kgTo(80, 'lb')).toBe(176.4)
    expect(toKg(176.4, 'lb')).toBeCloseTo(80.01, 1)
    expect(kgTo(80.04, 'kg')).toBe(80)
    expect(cmTo(94, 'in')).toBe(37)
    expect(toCm(37, 'in')).toBe(94)
  })
  it('converts cholesterol and triglycerides with their own factors', () => {
    expect(lipidTo(5, 'mgdl')).toBe(193)
    expect(lipidTo(1.5, 'mgdl', 'tg')).toBe(133)
    expect(toMmol(193, 'mgdl')).toBe(4.99)
    expect(toMmol(133, 'mgdl', 'tg')).toBe(1.5)
    expect(lipidTo(4.912, 'mmol')).toBe(4.91)
    expect(unitLabel(DEFAULT_UNITS, 'lipids')).toBe('mmol/L')
  })
})
