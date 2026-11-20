import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RISK_LIMITS,
  RiskLimitsSchema,
  applyRiskLimits,
  bufferedBuyingCapacity,
  evaluateLossStops,
  forcedSellTickers,
  isForcedShariahSell,
  orderValueUsd,
  pickWeekStartEquity,
  readSafetySettings,
  resizeOrder,
  resolveRiskLimits,
  type RiskAccount,
  type RiskLimits,
} from './riskLimits'
import type { ActionItem, AlpacaOrderResult } from '@/types/database'
import type { ShariahScreeningResult } from '@/types/shariah'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function buy(ticker: string, notional: number, price = 100): AlpacaOrderResult {
  return {
    ticker, action: 'buy', qty: notional / price, notional, price_at_execution: price,
    estimated_value: notional, alpaca_order_id: null, status: 'planned', error_message: null,
    client_order_id: `x-${ticker}-buy`, fractionable: true,
  }
}

function wholeBuy(ticker: string, qty: number, price: number): AlpacaOrderResult {
  return {
    ticker, action: 'buy', qty, notional: null, price_at_execution: price, estimated_value: qty * price,
    alpaca_order_id: null, status: 'planned', error_message: null, client_order_id: `x-${ticker}-buy`, fractionable: false,
  }
}

function sell(ticker: string, qty: number, price = 100, fractionable = true): AlpacaOrderResult {
  return {
    ticker, action: 'sell', qty, notional: null, price_at_execution: price, estimated_value: qty * price,
    alpaca_order_id: null, status: 'planned', error_message: null, client_order_id: `x-${ticker}-sell`, fractionable,
  }
}

function item(ticker: string, action: 'buy' | 'sell', current_pct: number, target_pct: number, note?: string): ActionItem {
  return { ticker, action, current_pct, target_pct, current_usd: 0, target_usd: target_pct, delta_usd: 0, ...(note ? { note } : {}) }
}

/** Limits that never bind, so each test can switch on one rule. */
const LOOSE: RiskLimits = {
  max_turnover_pct: 100, max_position_pct: 100, min_cash_buffer_pct: 1, drift_threshold_pct: 1,
  max_single_order_usd: null, daily_loss_stop_pct: 3, weekly_loss_stop_pct: 7,
}

const account = (over: Partial<RiskAccount> = {}): RiskAccount => ({ equity: 10_000, cash: 10_000, positions: {}, ...over })

function screening(nonCompliant: string[]): ShariahScreeningResult {
  return {
    version: 1, screened_at: '2026-11-20T00:00:00Z',
    tickers: nonCompliant.map(t => ({
      ticker: t, name: null, verdict: 'non_compliant', reasons: ['debt'], security_type: 'CS', sic_code: null,
      sic_description: null, reviewer_verdict: null, reviewer_reason: null, non_permissible_income_pct: null,
      ratios: {
        debt: { value_pct: 50, status: 'fail', source: 'polygon', basis: 'exact' },
        cash_and_securities: { value_pct: 1, status: 'pass', source: 'polygon', basis: 'exact' },
        receivables: { value_pct: 1, status: 'pass', source: 'polygon', basis: 'exact' },
      },
      ratio_source: 'polygon', is_holding: true, excluded: true, screened_at: '2026-11-20T00:00:00Z',
    })),
    excluded: nonCompliant.map(t => ({ ticker: t, reasons: ['debt'] })),
  }
}

// ── Limits / settings ────────────────────────────────────────────────────────

describe('resolveRiskLimits', () => {
  it('returns defaults for missing / invalid input', () => {
    expect(resolveRiskLimits(null)).toEqual(DEFAULT_RISK_LIMITS)
    expect(resolveRiskLimits('x')).toEqual(DEFAULT_RISK_LIMITS)
    expect(resolveRiskLimits([1])).toEqual(DEFAULT_RISK_LIMITS)
  })
  it('merges valid fields and ignores invalid ones', () => {
    const r = resolveRiskLimits({ max_turnover_pct: 10, max_position_pct: 500, max_single_order_usd: 250, junk: 1 })
    expect(r.max_turnover_pct).toBe(10)
    expect(r.max_position_pct).toBe(20)
    expect(r.max_single_order_usd).toBe(250)
  })
  it('keeps an explicit null single-order cap', () => {
    expect(resolveRiskLimits({ max_single_order_usd: null }).max_single_order_usd).toBeNull()
  })
  it('schema bounds percentages to 1–100', () => {
    expect(RiskLimitsSchema.safeParse({ ...DEFAULT_RISK_LIMITS, max_turnover_pct: 0 }).success).toBe(false)
    expect(RiskLimitsSchema.safeParse({ ...DEFAULT_RISK_LIMITS, daily_loss_stop_pct: 101 }).success).toBe(false)
    expect(RiskLimitsSchema.safeParse(DEFAULT_RISK_LIMITS).success).toBe(true)
  })
})

describe('readSafetySettings', () => {
  it('defaults to dry run ON and not paused when the migration is missing', () => {
    const s = readSafetySettings({ user_id: 'u', risk_profile: 'moderate' })
    expect(s).toEqual({
      limits: DEFAULT_RISK_LIMITS, dry_run: true, trading_paused: false, paused_reason: null, paused_at: null,
      migration_applied: false,
    })
    expect(readSafetySettings(null).dry_run).toBe(true)
  })
  it('reads the stored columns', () => {
    const s = readSafetySettings({
      dry_run: false, trading_paused: true, paused_reason: 'manual', paused_at: '2026-11-20T10:00:00Z',
      risk_limits: { max_turnover_pct: 15 },
    })
    expect(s.dry_run).toBe(false)
    expect(s.trading_paused).toBe(true)
    expect(s.paused_reason).toBe('manual')
    expect(s.limits.max_turnover_pct).toBe(15)
    expect(s.migration_applied).toBe(true)
  })
  it('treats a null dry_run as ON', () => {
    expect(readSafetySettings({ dry_run: null, trading_paused: false }).dry_run).toBe(true)
  })
})

describe('forced Shariah sells', () => {
  it('detects by note, by screening and ignores buys', () => {
    expect(isForcedShariahSell(item('AAA', 'sell', 5, 0, 'Not Shariah-compliant: debt'), null)).toBe(true)
    expect(isForcedShariahSell(item('BBB', 'sell', 5, 0), screening(['BBB']))).toBe(true)
    expect(isForcedShariahSell(item('BBB', 'buy', 5, 10), screening(['BBB']))).toBe(false)
    expect(isForcedShariahSell(item('CCC', 'sell', 5, 0), screening(['BBB']))).toBe(false)
    expect(forcedSellTickers([item('BBB', 'sell', 5, 0), item('BBB', 'sell', 5, 0), item('C', 'sell', 1, 0)], screening(['BBB']))).toEqual(['BBB'])
  })
})

// ── resizeOrder ──────────────────────────────────────────────────────────────

describe('resizeOrder', () => {
  it('never increases an order', () => {
    const o = buy('A', 100)
    expect(resizeOrder(o, 500, 'n', 'b')).toBe(o)
  })
  it('floors notional buys to cents and blocks below $1', () => {
    const r = resizeOrder(buy('A', 100), 40.129, 'trim', 'blocked')
    expect(r.notional).toBe(40.12)
    expect(r.estimated_value).toBe(40.12)
    expect(r.risk_note).toBe('trim')
    expect(resizeOrder(buy('A', 100), 0.5, 'trim', 'blocked')).toMatchObject({ status: 'skipped', error_message: 'blocked', notional: null })
  })
  it('floors whole-share buys to shares', () => {
    expect(resizeOrder(wholeBuy('A', 10, 30), 100, 't', 'b')).toMatchObject({ qty: 3, estimated_value: 90 })
    expect(resizeOrder(wholeBuy('A', 10, 30), 20, 't', 'b').status).toBe('skipped')
  })
  it('resizes fractional and whole-share sells', () => {
    expect(resizeOrder(sell('A', 10, 100), 250, 't', 'b').qty).toBe(2.5)
    expect(resizeOrder(sell('A', 10, 100, false), 250, 't', 'b').qty).toBe(2)
    expect(resizeOrder(sell('A', 10, 100), 0.5, 't', 'b').status).toBe('skipped')
  })
  it('passes non-planned orders through', () => {
    const o = { ...buy('A', 100), status: 'skipped' as const }
    expect(resizeOrder(o, 1, 't', 'b')).toBe(o)
  })
})

// ── applyRiskLimits ──────────────────────────────────────────────────────────

describe('applyRiskLimits', () => {
  it('leaves a plan within all limits untouched', () => {
    const plan = { orders: [buy('A', 500)], items: [item('A', 'buy', 0, 5)], forcedSellTickers: [] }
    const r = applyRiskLimits(plan, account(), LOOSE)
    expect(r.orders[0]).toMatchObject({ status: 'planned', notional: 500 })
    expect(r.adjustments).toEqual([])
    expect(r.summary.turnover_before_pct).toBeCloseTo(5)
  })

  it('drift filter blocks small rebalances but never forced Shariah sells', () => {
    const plan = {
      orders: [sell('X', 1), buy('A', 200), sell('B', 1)],
      items: [item('X', 'sell', 1, 0, 'Not Shariah-compliant: debt'), item('A', 'buy', 3, 5), item('B', 'sell', 10, 8)],
      forcedSellTickers: ['X'],
    }
    const r = applyRiskLimits(plan, account(), { ...LOOSE, drift_threshold_pct: 3 })
    expect(r.orders[0].status).toBe('planned')
    expect(r.orders[1]).toMatchObject({ status: 'skipped' })
    expect(r.orders[1].error_message).toContain('below the 3% threshold')
    expect(r.orders[2].status).toBe('skipped')
    expect(r.adjustments.map(a => a.rule)).toEqual(['drift', 'drift'])
  })

  it('turnover cap scales buys and non-forced sells proportionally after forced sells', () => {
    // portfolio 10k, cap 20% = 2000; forced sell 1000 → 1000 left for 2000 of other orders → factor 0.5
    const plan = {
      orders: [sell('X', 10), sell('B', 5), buy('A', 1500)],
      items: [item('X', 'sell', 10, 0), item('B', 'sell', 20, 15), item('A', 'buy', 0, 15)],
      forcedSellTickers: ['X'],
    }
    const r = applyRiskLimits(plan, account(), { ...LOOSE, max_turnover_pct: 20 })
    expect(r.orders[0].qty).toBe(10)
    expect(r.orders[1].qty).toBe(2.5)
    expect(r.orders[2].notional).toBe(750)
    expect(r.summary.turnover_after_usd).toBeCloseTo(2000)
    expect(r.summary.trimmed_count).toBe(2)
    expect(r.orders[2].risk_note).toContain('turnover')
  })

  it('turnover cap blocks everything else when forced sells use the whole budget', () => {
    const plan = {
      orders: [sell('X', 30), buy('A', 500)],
      items: [item('X', 'sell', 30, 0), item('A', 'buy', 0, 5)],
      forcedSellTickers: ['X'],
    }
    const r = applyRiskLimits(plan, account(), { ...LOOSE, max_turnover_pct: 20 })
    expect(r.orders[0]).toMatchObject({ status: 'planned', qty: 30 })
    expect(r.orders[1].status).toBe('skipped')
    expect(r.orders[1].error_message).toContain('turnover limit is used up')
  })

  it('position cap trims buys to the cap including the existing position', () => {
    const plan = { orders: [buy('A', 1500), buy('B', 500)], items: [item('A', 'buy', 15, 30), item('B', 'buy', 25, 30)], forcedSellTickers: [] }
    const r = applyRiskLimits(plan, account({ positions: { A: 1500, B: 2500 }, cash: 6000 }), { ...LOOSE, max_position_pct: 20 })
    expect(r.orders[0].notional).toBe(500)
    expect(r.orders[1].status).toBe('skipped')
    expect(r.orders[1].error_message).toContain('already 25%')
  })

  it('cash buffer scales buys and counts planned sell proceeds', () => {
    // equity 10k, buffer 2% = 200, cash 1000 + sells 500 → 1300 spendable for 2600 of buys
    const plan = {
      orders: [sell('S', 5), buy('A', 1300), buy('B', 1300)],
      items: [item('S', 'sell', 20, 15), item('A', 'buy', 0, 13), item('B', 'buy', 0, 13)],
      forcedSellTickers: [],
    }
    const r = applyRiskLimits(plan, account({ cash: 1000, positions: { S: 9000 } }), { ...LOOSE, min_cash_buffer_pct: 2 })
    expect(r.orders[0].qty).toBe(5)
    expect(r.orders[1].notional).toBe(650)
    expect(r.orders[2].notional).toBe(650)
    expect(r.adjustments.every(a => a.rule === 'cash_buffer')).toBe(true)
  })

  it('cash buffer reserves slippage for whole-share buys', () => {
    const plan = { orders: [wholeBuy('A', 10, 100)], items: [item('A', 'buy', 0, 10)], forcedSellTickers: [] }
    const r = applyRiskLimits(plan, account({ cash: 1100, equity: 10_000 }), { ...LOOSE, min_cash_buffer_pct: 2 })
    // spendable 900; cost 1010 → factor 0.891 → value 891 → 8 shares
    expect(r.orders[0].qty).toBe(8)
  })

  it('single-order cap trims every non-forced order', () => {
    const plan = {
      orders: [sell('X', 20), sell('B', 10), buy('A', 800)],
      items: [item('X', 'sell', 20, 0), item('B', 'sell', 20, 10), item('A', 'buy', 0, 8)],
      forcedSellTickers: ['X'],
    }
    const r = applyRiskLimits(plan, account(), { ...LOOSE, max_single_order_usd: 300 })
    expect(r.orders[0].qty).toBe(20)
    expect(r.orders[1].qty).toBe(3)
    expect(r.orders[2].notional).toBe(300)
  })

  it('applies rules in order and never increases any order', () => {
    const orders = [sell('B', 8), buy('A', 3000), buy('C', 900), wholeBuy('D', 7, 110)]
    const plan = {
      orders,
      items: [item('B', 'sell', 30, 22), item('A', 'buy', 0, 30), item('C', 'buy', 12, 21), item('D', 'buy', 0, 7.7)],
      forcedSellTickers: [],
    }
    const r = applyRiskLimits(plan, account({ cash: 2000, positions: { B: 3000, C: 1200 } }), DEFAULT_RISK_LIMITS)
    r.orders.forEach((o, i) => {
      expect(orderValueUsd(o)).toBeLessThanOrEqual(orderValueUsd(orders[i]) + 1e-9)
      expect(o.qty).toBeLessThanOrEqual(orders[i].qty + 1e-9)
    })
    expect(r.summary.turnover_after_usd).toBeLessThanOrEqual(2000 + 1e-6)
  })

  it('blocks everything except forced sells when portfolio value is unknown', () => {
    const plan = {
      orders: [sell('X', 1), buy('A', 10)], items: [item('X', 'sell', 5, 0), item('A', 'buy', 0, 10)], forcedSellTickers: ['X'],
    }
    const r = applyRiskLimits(plan, { equity: 0, cash: 0, positions: {} }, LOOSE)
    expect(r.orders[0].status).toBe('planned')
    expect(r.orders[1].status).toBe('skipped')
  })

  it('passes already-skipped rows through untouched', () => {
    const skipped: AlpacaOrderResult = { ...buy('A', 0), status: 'skipped', error_message: 'Not Shariah-compliant' }
    const r = applyRiskLimits({ orders: [skipped], items: [item('A', 'buy', 0, 1)], forcedSellTickers: [] }, account(), DEFAULT_RISK_LIMITS)
    expect(r.orders[0]).toEqual(skipped)
    expect(r.adjustments).toEqual([])
  })
})

// ── Loss stops ───────────────────────────────────────────────────────────────

describe('pickWeekStartEquity', () => {
  it('returns the first positive point', () => {
    expect(pickWeekStartEquity([null, 0, 980, 1000])).toBe(980)
    expect(pickWeekStartEquity([])).toBeNull()
    expect(pickWeekStartEquity(null)).toBeNull()
  })
})

describe('evaluateLossStops', () => {
  const base = { equity: 10_000, last_equity: 10_000, week_start_equity: 10_000, week_history_available: true }
  it('allows trading within limits', () => {
    expect(evaluateLossStops({ ...base, equity: 9800 }, DEFAULT_RISK_LIMITS)).toMatchObject({ blocked: false, triggered: null })
  })
  it('triggers the daily stop', () => {
    const r = evaluateLossStops({ ...base, equity: 9600 }, DEFAULT_RISK_LIMITS)
    expect(r).toMatchObject({ blocked: true, triggered: 'daily' })
    expect(r.reason).toContain('4%')
  })
  it('triggers the weekly stop', () => {
    const r = evaluateLossStops({ ...base, equity: 9200, last_equity: 9300, week_start_equity: 10_000 }, DEFAULT_RISK_LIMITS)
    expect(r).toMatchObject({ blocked: true, triggered: 'weekly' })
  })
  it('does not trigger at exactly the limit', () => {
    expect(evaluateLossStops({ ...base, equity: 9700 }, DEFAULT_RISK_LIMITS).blocked).toBe(false)
  })
  it('fails closed without triggering when equity is unknown', () => {
    expect(evaluateLossStops({ ...base, equity: null }, DEFAULT_RISK_LIMITS)).toMatchObject({ blocked: true, triggered: null })
    expect(evaluateLossStops({ ...base, week_history_available: false }, DEFAULT_RISK_LIMITS)).toMatchObject({ blocked: true, triggered: null })
  })
  it('allows a new account with no history', () => {
    expect(evaluateLossStops({ ...base, week_start_equity: null }, DEFAULT_RISK_LIMITS).blocked).toBe(false)
  })
})

describe('bufferedBuyingCapacity', () => {
  it('keeps the cash buffer and never exceeds settled capacity', () => {
    expect(bufferedBuyingCapacity(5000, 3000, 10_000, DEFAULT_RISK_LIMITS)).toBe(2800)
    expect(bufferedBuyingCapacity(1000, 3000, 10_000, DEFAULT_RISK_LIMITS)).toBe(1000)
    expect(bufferedBuyingCapacity(1000, 100, 10_000, DEFAULT_RISK_LIMITS)).toBe(0)
    expect(bufferedBuyingCapacity(1000, null, 10_000, DEFAULT_RISK_LIMITS)).toBe(0)
  })
})
