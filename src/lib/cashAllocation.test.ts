import { describe, it, expect } from 'vitest'
import {
  CASH_ROW_KEY,
  extractCashEntries,
  isReservedCashWord,
  normaliseWithCash,
  readCashTargetPct,
  rescaleStocksToCash,
  residualCashPct,
  scaleAllocationTo,
} from './cashAllocation'

const sum = (xs: Array<{ target_pct: number }>) => xs.reduce((s, x) => s + x.target_pct, 0)

describe('isReservedCashWord', () => {
  it('matches the deny-list case-insensitively with separators normalised', () => {
    for (const w of ['CASH', 'cash', ' Cash ', 'USD', '$', 'US$', 'MONEY MARKET', 'money_market', 'Money-Market Fund', 'MMF',
      'SWEEP', 'SPAXX', 'vmfxx', 'SWVXX', 'Cash Reserve', 'CASH (USD)', 'cash/reserve', CASH_ROW_KEY]) {
      expect(isReservedCashWord(w)).toBe(true)
    }
  })

  it('does not match real tickers', () => {
    for (const w of ['AAPL', 'MSFT', 'CASY', 'CSH', 'USDP', 'BRK.B', 'SWK', '']) {
      expect(isReservedCashWord(w)).toBe(false)
    }
    expect(isReservedCashWord(null)).toBe(false)
  })
})

describe('extractCashEntries', () => {
  it('converts reserved entries into cash and adds the explicit cash', () => {
    const res = extractCashEntries([
      { ticker: 'AAPL', target_pct: 60 },
      { ticker: 'CASH', target_pct: 15 },
      { ticker: 'SPAXX', target_pct: 5 },
    ], 10)
    expect(res.stocks.map(s => s.ticker)).toEqual(['AAPL'])
    expect(res.cash_target_pct).toBe(30)
  })

  it('clamps cash to 0–100', () => {
    expect(extractCashEntries([{ ticker: 'USD', target_pct: 150 }]).cash_target_pct).toBe(100)
    expect(extractCashEntries([], -5).cash_target_pct).toBe(0)
  })
})

describe('normaliseWithCash', () => {
  it('scales stocks and cash together to exactly 100', () => {
    const res = normaliseWithCash([{ target_pct: 50 }, { target_pct: 30 }], 25) // 105
    expect(sum(res.stocks) + res.cash_target_pct).toBeCloseTo(100, 9)
    expect(res.cash_target_pct).toBeCloseTo((25 * 100) / 105, 9)
  })

  it('drops zero weights and leaves an already-100 allocation alone', () => {
    const res = normaliseWithCash([{ target_pct: 80 }, { target_pct: 0 }], 20)
    expect(res.stocks).toEqual([{ target_pct: 80 }])
    expect(res.cash_target_pct).toBe(20)
  })

  it('defaults to cash 0 (backwards compatible with the old normaliseTo100)', () => {
    const res = normaliseWithCash([{ target_pct: 48 }, { target_pct: 48 }], 0)
    expect(sum(res.stocks)).toBeCloseTo(100, 9)
    expect(res.cash_target_pct).toBe(0)
  })
})

describe('rescaleStocksToCash / scaleAllocationTo / residualCashPct', () => {
  it('redistributes a removed stock proportionally among the remaining stocks, cash unchanged', () => {
    const res = rescaleStocksToCash([{ target_pct: 30 }, { target_pct: 10 }], 20) // removed 40% stock
    expect(res.map(r => r.target_pct)).toEqual([60, 20])
  })

  it('absorbs rounding into the largest position', () => {
    const res = scaleAllocationTo([{ target_pct: 1 }, { target_pct: 1 }, { target_pct: 1 }], 100)
    expect(sum(res)).toBe(100)
  })

  it('cash is whatever stocks leave over', () => {
    expect(residualCashPct([{ target_pct: 20 }, { target_pct: 20 }])).toBe(60)
    expect(residualCashPct([{ target_pct: 70 }, { target_pct: 40 }])).toBe(0)
  })
})

describe('stored cash target', () => {
  it('reads agent_outputs.cash_allocation; older recommendations → null', () => {
    expect(readCashTargetPct({ agent_outputs: { cash_allocation: { version: 1, cash_target_pct: 12.5, converted: ['CASH'] } } })).toBe(12.5)
    expect(readCashTargetPct({ agent_outputs: { usage: {} } })).toBeNull()
    expect(readCashTargetPct({ agent_outputs: { cash_allocation: { version: 1, cash_target_pct: 140 } } })).toBeNull()
    expect(readCashTargetPct(null)).toBeNull()
  })
})
