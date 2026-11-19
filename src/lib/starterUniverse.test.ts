import { describe, it, expect } from 'vitest'
import { getStarterUniverse } from './starterUniverse'

describe('getStarterUniverse', () => {
  it.each(['conservative', 'moderate', 'aggressive'] as const)('includes core broad-market ETFs for %s', risk => {
    const list = getStarterUniverse(risk)
    expect(list).toEqual(expect.arrayContaining(['VTI', 'VOO', 'VXUS']))
  })

  it('has no duplicates and a workable size', () => {
    for (const risk of ['conservative', 'moderate', 'aggressive'] as const) {
      const list = getStarterUniverse(risk)
      expect(new Set(list).size).toBe(list.length)
      expect(list.length).toBeGreaterThanOrEqual(6)
      expect(list.length).toBeLessThanOrEqual(12)
    }
  })

  it('leans to bonds when conservative and to growth when aggressive', () => {
    expect(getStarterUniverse('conservative')).toContain('BND')
    expect(getStarterUniverse('conservative')).not.toContain('NVDA')
    expect(getStarterUniverse('aggressive')).toContain('NVDA')
    expect(getStarterUniverse('aggressive')).not.toContain('BND')
  })
})
