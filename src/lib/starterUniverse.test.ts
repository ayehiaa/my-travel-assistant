import { describe, it, expect } from 'vitest'
import { getStarterUniverse } from './starterUniverse'

const RISKS = ['conservative', 'moderate', 'aggressive'] as const

// Funds / bonds that must never appear, and impermissible-business examples.
const FORBIDDEN = [
  'VTI', 'VOO', 'VXUS', 'BND', 'AGG', 'SCHD', 'VIG', 'XLV', 'XLP', 'QQQ', 'SMH', 'XLK', 'SPY', 'TLT',
  'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'BRK.B', 'AIG', 'MET', 'PGR', 'BUD', 'STZ', 'DEO', 'MO', 'PM',
  'LVS', 'MGM', 'WYNN', 'DKNG', 'LMT', 'RTX', 'NOC', 'GD', 'BA',
]

describe('getStarterUniverse', () => {
  it.each(RISKS)('returns 8–12 unique individual stocks for %s', risk => {
    const list = getStarterUniverse(risk)
    expect(new Set(list).size).toBe(list.length)
    expect(list.length).toBeGreaterThanOrEqual(8)
    expect(list.length).toBeLessThanOrEqual(12)
  })

  it.each(RISKS)('contains no ETFs, bonds or impermissible businesses for %s', risk => {
    const list = getStarterUniverse(risk)
    for (const t of FORBIDDEN) expect(list).not.toContain(t)
  })

  it('leans defensive when conservative and to growth when aggressive', () => {
    expect(getStarterUniverse('conservative')).toContain('JNJ')
    expect(getStarterUniverse('conservative')).not.toContain('NVDA')
    expect(getStarterUniverse('aggressive')).toContain('NVDA')
    expect(getStarterUniverse('aggressive')).not.toContain('KO')
  })
})
