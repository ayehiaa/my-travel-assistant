import { describe, it, expect } from 'vitest'
import {
  annualisePct,
  buildRealReturnMetrics,
  chooseReturnWindow,
  computeHoldingMomentum,
  computeTimeWeightedReturn,
  describeTarget,
  proratedAnnualPct,
  readReturnMetrics,
  targetAnnualPct,
  type PortfolioHistoryInput,
} from './returnMetrics'

const DAY = 86_400
const T0 = Date.UTC(2026, 7, 1) / 1000 // 2026-08-01

/** Daily points from T0 with the given equity / P/L arrays. */
function hist(equity: number[], extra: Partial<PortfolioHistoryInput> = {}): PortfolioHistoryInput {
  return { timestamp: equity.map((_, i) => T0 + i * DAY), equity, ...extra }
}

describe('target conversion', () => {
  it('compounds a monthly target to annual instead of ×12', () => {
    expect(targetAnnualPct(1, 'monthly')).toBeCloseTo(12.6825, 3)
    expect(targetAnnualPct(2, 'monthly')).toBeCloseTo(26.824, 2) // old code: 24
    expect(targetAnnualPct(10, 'annual')).toBe(10)
  })

  it('prorates an annual target by compounding', () => {
    expect(proratedAnnualPct(10, 365)).toBeCloseTo(10)
    expect(proratedAnnualPct(10, 36.5)).toBeCloseTo((Math.pow(1.1, 0.1) - 1) * 100, 6)
    expect(proratedAnnualPct(10, 0)).toBe(0)
  })

  it('annualises by compounding', () => {
    expect(annualisePct(5, 182.5)).toBeCloseTo(10.25, 6)
    expect(annualisePct(10, 365)).toBeCloseTo(10)
    expect(annualisePct(-100, 30)).toBe(-100)
  })
})

describe('chooseReturnWindow', () => {
  const now = new Date('2026-11-22T12:00:00Z')

  it('uses the programme start when it is within the last 3 months (shorter window)', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    expect(chooseReturnWindow(now, start)).toEqual({ start, window: 'programme_start' })
  })

  it('caps the window at 3 months', () => {
    const w = chooseReturnWindow(now, new Date('2026-01-01T00:00:00Z'))
    expect(w?.window).toBe('three_months')
    expect(w?.start.toISOString()).toBe('2026-08-22T12:00:00.000Z')
  })

  it('is null without a programme start', () => {
    expect(chooseReturnWindow(now, null)).toBeNull()
  })
})

describe('computeTimeWeightedReturn', () => {
  it('uses the cumulative profit_loss_pct ratio between the first and last point in the window', () => {
    const h = hist([1000, 1100, 1210], { profit_loss_pct: [0.1, 0.21, 0.331] })
    const r = computeTimeWeightedReturn(h, T0)
    expect(r?.method).toBe('profit_loss_pct')
    expect(r?.period_return_pct).toBeCloseTo((1.331 / 1.1 - 1) * 100, 9) // 21%
    expect(r?.days).toBe(2)
  })

  it('prefers equity adjusted for real deposits / withdrawals over Alpaca P/L fields', () => {
    // Funded 100k; P/L fields disagree with equity (Alpaca baseline quirk); no deposits since → equity change only.
    const h = hist([100_000, 99_800, 100_050, 99_981.43], {
      profit_loss: [0, -1200, -1400, -1400], profit_loss_pct: [0, -0.012, -0.014, -0.014], cash_flows: [],
    })
    const r = computeTimeWeightedReturn(h, T0)
    expect(r?.method).toBe('cash_flows')
    expect(r?.period_return_pct).toBeCloseTo(-0.01857, 5)
  })

  it('takes a mid-period deposit out of the return', () => {
    // +10% day 1, deposit 1000 on day 2 (equity 2100), +10% day 3 → 21%, not +131%.
    const dates = [0, 1, 2, 3].map(i => new Date((T0 + i * DAY) * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))
    const h = hist([1000, 1100, 2100, 2310], { cash_flows: [{ date: dates[2], amount: 1000 }] })
    const r = computeTimeWeightedReturn(h, T0)
    expect(r?.method).toBe('cash_flows')
    expect(r?.period_return_pct).toBeCloseTo(21, 9)
  })

  it('prefers the USD P/L chain over profit_loss_pct (which is wrong for accounts funded mid-period)', () => {
    const h = hist([100_000, 99_984.52], { profit_loss: [0, -15.48], profit_loss_pct: [0, -0.0136] })
    const r = computeTimeWeightedReturn(h, T0)
    expect(r?.method).toBe('profit_loss')
    expect(r?.period_return_pct).toBeCloseTo(-0.01548, 5)
  })

  it('excludes a deposit when chaining daily returns from profit_loss', () => {
    // Day 1: +10% on 1000 (pl 100) → 1100. Day 2: deposit 1000 → 2100 (pl unchanged). Day 3: +10% on 2100 → 2310.
    const h = hist([1000, 1100, 2100, 2310], { profit_loss: [0, 100, 100, 310] })
    const r = computeTimeWeightedReturn(h, T0)
    expect(r?.method).toBe('profit_loss')
    expect(r?.period_return_pct).toBeCloseTo(21, 9) // 1.1 × 1.0 × 1.1 − 1; a raw equity ratio would say +131%
  })

  it('ignores points before the window start and before funding', () => {
    const h = hist([0, 500, 1000, 1050], { profit_loss: [0, 0, 0, 50] })
    const r = computeTimeWeightedReturn(h, T0 + 2 * DAY)
    expect(r?.period_return_pct).toBeCloseTo(5, 9)
    expect(r?.start_ts).toBe(T0 + 2 * DAY)
  })

  it('falls back to equity only (not deposit-adjusted) when no P/L is sent', () => {
    const r = computeTimeWeightedReturn(hist([1000, 1020]), T0)
    expect(r?.method).toBe('equity')
    expect(r?.period_return_pct).toBeCloseTo(2, 9)
  })

  it('is null with fewer than two usable points', () => {
    expect(computeTimeWeightedReturn(hist([1000]), T0)).toBeNull()
    expect(computeTimeWeightedReturn(hist([1000, 1100]), T0 + 5 * DAY)).toBeNull()
  })
})

describe('buildRealReturnMetrics', () => {
  /** n+1 daily points with a constant daily return, P/L series included. */
  function steady(days: number, dailyPct: number): PortfolioHistoryInput {
    const equity: number[] = []
    const pl: number[] = []
    let e = 1000
    for (let i = 0; i <= days; i++) {
      equity.push(e)
      pl.push(e - 1000)
      e *= 1 + dailyPct / 100
    }
    return hist(equity, { profit_loss: pl })
  }
  const programmeStart = new Date(T0 * 1000)

  it('is insufficient_history under 21 days', () => {
    const m = buildRealReturnMetrics({ history: steady(14, 0.1), now: new Date((T0 + 14 * DAY) * 1000), programmeStart, targetPct: 10, horizon: 'annual' })
    expect(m.status).toBe('insufficient_history')
    expect(m.days).toBe(14)
    expect(m.gap_pct).toBeNull()
    expect(m.reason).toMatch(/14 days/)
  })

  it('is insufficient_history before the first complete recommendation', () => {
    const m = buildRealReturnMetrics({ history: steady(90, 0.1), now: new Date(), programmeStart: null, targetPct: 10, horizon: 'annual' })
    expect(m.status).toBe('insufficient_history')
    expect(m.reason).toMatch(/programme has not started/)
  })

  it('compares the period return with the prorated target between 21 and 59 days', () => {
    const m = buildRealReturnMetrics({ history: steady(30, 0.1), now: new Date((T0 + 30 * DAY) * 1000), programmeStart, targetPct: 10, horizon: 'annual' })
    expect(m.status).toBe('ok')
    expect(m.basis).toBe('period')
    expect(m.annualised_return_pct).toBeNull()
    const period = (Math.pow(1.001, 30) - 1) * 100
    const prorated = (Math.pow(1.1, 30 / 365) - 1) * 100
    expect(m.period_return_pct).toBeCloseTo(period, 6)
    expect(m.target_period_pct).toBeCloseTo(prorated, 6)
    expect(m.gap_pct).toBeCloseTo(period - prorated, 6)
    expect(describeTarget(m)).toMatch(/over 30 days \(prorated from 10.00% a year\)/)
  })

  it('annualises by compounding from 60 days and compares with the annual target', () => {
    const m = buildRealReturnMetrics({ history: steady(80, 0.02), now: new Date((T0 + 80 * DAY) * 1000), programmeStart, targetPct: 1, horizon: 'monthly' })
    expect(m.basis).toBe('annualised')
    const period = (Math.pow(1.0002, 80) - 1) * 100
    const annualised = (Math.pow(1 + period / 100, 365 / 80) - 1) * 100
    expect(m.annualised_return_pct).toBeCloseTo(annualised, 6)
    expect(m.target_annual_pct).toBeCloseTo(12.6825, 3)
    expect(m.gap_pct).toBeCloseTo(annualised - 12.6825, 3)
    expect(m.window).toBe('programme_start')
    expect(m.start_date).toBe('2026-08-01')
  })

  it('reports unavailable when the history could not be fetched', () => {
    const m = buildRealReturnMetrics({ history: null, now: new Date(), programmeStart, targetPct: 10, horizon: 'annual', unavailableReason: 'Account history could not be fetched' })
    expect(m.status).toBe('unavailable')
    expect(m.target_annual_pct).toBe(10)
  })

  it('round-trips through agent_outputs.return_metrics', () => {
    const m = buildRealReturnMetrics({ history: steady(30, 0.1), now: new Date((T0 + 30 * DAY) * 1000), programmeStart, targetPct: 10, horizon: 'annual' })
    expect(readReturnMetrics({ agent_outputs: { return_metrics: m } })).toEqual(m)
    expect(readReturnMetrics({ agent_outputs: { return_metrics: { foo: 1 } } })).toBeNull()
    expect(readReturnMetrics({ agent_outputs: null })).toBeNull()
  })
})

describe('computeHoldingMomentum', () => {
  it('lists each holding\'s price change with its weight, strongest first', () => {
    const res = computeHoldingMomentum(
      [{ ticker: 'A', total_value_usd: 750 }, { ticker: 'B', total_value_usd: 250 }, { ticker: 'C', total_value_usd: 0 }],
      { A: [{ close: 100 }, { close: 95 }], B: [{ close: 50 }, { close: 55 }] },
    )
    expect(res.rows.map(r => r.ticker)).toEqual(['B', 'A'])
    expect(res.rows[0].return_pct).toBeCloseTo(10)
    expect(res.rows[1].weight_pct).toBeCloseTo(75)
    expect(res.coverage_pct).toBe(100)
  })

  it('skips holdings without usable prices', () => {
    const res = computeHoldingMomentum([{ ticker: 'A', total_value_usd: 100 }, { ticker: 'B', total_value_usd: 100 }], { A: [{ close: 0 }, { close: 5 }] })
    expect(res.rows).toEqual([])
    expect(res.coverage_pct).toBe(0)
  })
})
