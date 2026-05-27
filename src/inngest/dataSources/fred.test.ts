import { describe, it, expect } from 'vitest'
import { FRED_SERIES_CONFIG, FED_RATES_SERIES_CONFIG } from './fred'

describe('FRED_SERIES_CONFIG', () => {
  it('has exactly 5 entries', () => {
    expect(FRED_SERIES_CONFIG).toHaveLength(5)
  })

  it('contains all expected macroeconomics series IDs', () => {
    const ids = FRED_SERIES_CONFIG.map(s => s.id)
    expect(ids).toContain('GDP')
    expect(ids).toContain('CPIAUCSL')
    expect(ids).toContain('UNRATE')
    expect(ids).toContain('DGS10')
    expect(ids).toContain('T10YIE')
  })

  it('every entry has a non-empty id, title, and unit', () => {
    for (const entry of FRED_SERIES_CONFIG) {
      expect(entry.id.length).toBeGreaterThan(0)
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.unit.length).toBeGreaterThan(0)
    }
  })

  it('does NOT contain any fed-rates series IDs (no cross-contamination)', () => {
    const ids = FRED_SERIES_CONFIG.map(s => s.id)
    expect(ids).not.toContain('FEDFUNDS')
    expect(ids).not.toContain('FEDTARMD')
    expect(ids).not.toContain('DGS2')
    expect(ids).not.toContain('DGS30')
  })
})

describe('FED_RATES_SERIES_CONFIG', () => {
  it('has exactly 4 entries', () => {
    expect(FED_RATES_SERIES_CONFIG).toHaveLength(4)
  })

  it('contains all expected Fed Rates series IDs', () => {
    const ids = FED_RATES_SERIES_CONFIG.map(s => s.id)
    expect(ids).toContain('FEDFUNDS')
    expect(ids).toContain('FEDTARMD')
    expect(ids).toContain('DGS2')
    expect(ids).toContain('DGS30')
  })

  it('every entry has a non-empty id, title, and unit', () => {
    for (const entry of FED_RATES_SERIES_CONFIG) {
      expect(entry.id.length).toBeGreaterThan(0)
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.unit.length).toBeGreaterThan(0)
    }
  })

  it('does NOT contain any macroeconomics series IDs (no cross-contamination)', () => {
    const ids = FED_RATES_SERIES_CONFIG.map(s => s.id)
    expect(ids).not.toContain('GDP')
    expect(ids).not.toContain('CPIAUCSL')
    expect(ids).not.toContain('UNRATE')
    expect(ids).not.toContain('DGS10')
    expect(ids).not.toContain('T10YIE')
  })

  it('series IDs appear in expected order: FEDFUNDS, FEDTARMD, DGS2, DGS30', () => {
    const ids = FED_RATES_SERIES_CONFIG.map(s => s.id)
    expect(ids).toEqual(['FEDFUNDS', 'FEDTARMD', 'DGS2', 'DGS30'])
  })

  it('all entries have unit "Percent"', () => {
    for (const entry of FED_RATES_SERIES_CONFIG) {
      expect(entry.unit).toBe('Percent')
    }
  })
})

describe('config independence', () => {
  it('FRED_SERIES_CONFIG and FED_RATES_SERIES_CONFIG share no series IDs', () => {
    const macroIds = new Set(FRED_SERIES_CONFIG.map(s => s.id))
    const fedIds = FED_RATES_SERIES_CONFIG.map(s => s.id)
    for (const id of fedIds) {
      expect(macroIds.has(id)).toBe(false)
    }
  })

  it('combined config has 9 unique series IDs', () => {
    const allIds = [
      ...FRED_SERIES_CONFIG.map(s => s.id),
      ...FED_RATES_SERIES_CONFIG.map(s => s.id),
    ]
    const uniqueIds = new Set(allIds)
    expect(uniqueIds.size).toBe(9)
  })
})
