import { describe, it, expect } from 'vitest'
import { renormaliseAllocation, capAllocation, removeTickers } from './allocationUtils'

const sum = (xs: Array<{ target_pct: number }>) => xs.reduce((s, x) => s + x.target_pct, 0)

describe('renormaliseAllocation', () => {
  it('scales a partial allocation to exactly 100', () => {
    const out = renormaliseAllocation([{ ticker: 'A', target_pct: 30 }, { ticker: 'B', target_pct: 20 }])
    expect(sum(out)).toBeCloseTo(100, 10)
    expect(out[0].target_pct).toBeCloseTo(60)
    expect(out[1].target_pct).toBeCloseTo(40)
  })

  it('leaves an allocation already summing to ~100 unchanged', () => {
    const items = [{ ticker: 'A', target_pct: 50 }, { ticker: 'B', target_pct: 49.8 }]
    expect(renormaliseAllocation(items)).toBe(items)
  })

  it('returns empty and zero-sum inputs unchanged', () => {
    expect(renormaliseAllocation([])).toEqual([])
    const zero = [{ ticker: 'A', target_pct: 0 }]
    expect(renormaliseAllocation(zero)).toBe(zero)
  })

  it('absorbs rounding into the largest position', () => {
    const out = renormaliseAllocation([
      { ticker: 'A', target_pct: 33.3 }, { ticker: 'B', target_pct: 33.3 }, { ticker: 'C', target_pct: 13.3 },
    ])
    expect(sum(out)).toBe(100)
  })
})

describe('capAllocation', () => {
  it('caps positions and redistributes excess to positions under the cap', () => {
    const out = capAllocation([
      { ticker: 'A', target_pct: 40 }, { ticker: 'B', target_pct: 20 }, { ticker: 'C', target_pct: 15 },
      { ticker: 'D', target_pct: 15 }, { ticker: 'E', target_pct: 5 }, { ticker: 'F', target_pct: 5 },
    ], 20)
    expect(Math.max(...out.map(a => a.target_pct))).toBeLessThanOrEqual(20 + 1e-9)
    expect(sum(out)).toBeCloseTo(100, 6)
  })

  it('leaves remainder in cash when every position is capped', () => {
    const out = capAllocation([{ ticker: 'A', target_pct: 60 }, { ticker: 'B', target_pct: 40 }], 20)
    expect(out.map(a => a.target_pct)).toEqual([20, 20])
  })

  it('is a no-op when nothing exceeds the cap', () => {
    const out = capAllocation([{ ticker: 'A', target_pct: 20 }, { ticker: 'B', target_pct: 10 }], 20)
    expect(out.map(a => a.target_pct)).toEqual([20, 10])
  })
})

describe('removeTickers', () => {
  it('drops tickers and renormalises', () => {
    const out = removeTickers([
      { ticker: 'A', target_pct: 50, rationale: '' }, { ticker: 'B', target_pct: 25, rationale: '' },
      { ticker: 'C', target_pct: 25, rationale: '' },
    ], new Set(['A']))
    expect(out.map(a => a.ticker)).toEqual(['B', 'C'])
    expect(sum(out)).toBeCloseTo(100)
  })
})
