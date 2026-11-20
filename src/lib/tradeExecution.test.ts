import { describe, expect, it } from 'vitest'
import {
  ALPACA_MIN_NOTIONAL_USD,
  MAX_CLIENT_ORDER_ID_LENGTH,
  SKIP_REASONS,
  applyOrderSnapshot,
  buildClientOrderId,
  buildEnvelope,
  classifyAlpacaOrderStatus,
  computeBuyingCapacity,
  decideMarketWait,
  deriveExecutionStatus,
  floorTo,
  fnv1aHex,
  isOrderOpen,
  normalizeExecution,
  parseStoredOrders,
  planOrders,
  scaleBuysToCapacity,
  settlementLookbackStart,
  type PlanInput,
} from './tradeExecution'
import { NOT_COMPLIANT_SKIP_REASON, NO_SCREENING_SKIP_REASON } from './shariahRules'
import type { ActionItem, AlpacaOrderResult } from '@/types/database'
import type { ShariahScreeningResult, TickerScreening } from '@/types/shariah'
import type { AlpacaOrderSnapshot } from './alpacaClient'

const EXEC_ID = '11111111-2222-3333-4444-555555555555'

function compliant(ticker: string): TickerScreening {
  return {
    ticker, name: null, verdict: 'compliant', reasons: [], security_type: 'CS', sic_code: null, sic_description: null,
    reviewer_verdict: null, reviewer_reason: null, non_permissible_income_pct: null,
    ratios: {
      debt:                { value_pct: 1, status: 'pass', source: 'polygon', basis: 'exact' },
      cash_and_securities: { value_pct: 1, status: 'pass', source: 'polygon', basis: 'exact' },
      receivables:         { value_pct: 1, status: 'pass', source: 'polygon', basis: 'exact' },
    },
    ratio_source: 'polygon',
  } as TickerScreening
}

const screening: ShariahScreeningResult = {
  version: 1, screened_at: 'x', tickers: [compliant('AAPL'), compliant('MSFT'), compliant('BRK')], excluded: [],
}

function item(ticker: string, action: 'buy' | 'sell', delta: number, targetPct = 10): ActionItem {
  return { ticker, action, current_pct: 0, target_pct: targetPct, current_usd: 0, target_usd: targetPct * 10, delta_usd: delta }
}

function input(overrides: Partial<PlanInput>): PlanInput {
  return {
    executionId: EXEC_ID,
    items:       [],
    screening,
    assets:      {
      AAPL: { tradable: true, fractionable: true },
      MSFT: { tradable: true, fractionable: true },
      BRK:  { tradable: true, fractionable: false },
    },
    quotes:      { AAPL: 200, MSFT: 400, BRK: 500 },
    positions:   {},
    recentBuys:  [],
    ...overrides,
  }
}

function order(partial: Partial<AlpacaOrderResult>): AlpacaOrderResult {
  return {
    ticker: 'AAPL', action: 'buy', qty: 0, price_at_execution: 100, estimated_value: 0,
    alpaca_order_id: null, status: 'planned', error_message: null, ...partial,
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

describe('floorTo', () => {
  it('floors to the given decimals and absorbs binary noise', () => {
    expect(floorTo(12.349, 2)).toBe(12.34)
    expect(floorTo(0.29, 2)).toBe(0.29)
    expect(floorTo(1.23456789, 6)).toBe(1.234567)
    expect(floorTo(Number.NaN, 2)).toBe(0)
  })
})

// ── client_order_id ──────────────────────────────────────────────────────────

describe('buildClientOrderId', () => {
  it('uses execution-ticker-side when it fits in 48 chars', () => {
    expect(buildClientOrderId(EXEC_ID, 'AAPL', 'buy')).toBe(`${EXEC_ID}-AAPL-buy`)
  })

  it('is deterministic', () => {
    expect(buildClientOrderId(EXEC_ID, 'GOOGL', 'sell')).toBe(buildClientOrderId(EXEC_ID, 'GOOGL', 'sell'))
  })

  it('hashes when the plain id would exceed 48 chars, keeping side and ticker distinct', () => {
    const id = buildClientOrderId(EXEC_ID, 'GOOGL', 'sell') // 36 + 1 + 5 + 1 + 4 = 47 → plain
    expect(id.length).toBeLessThanOrEqual(MAX_CLIENT_ORDER_ID_LENGTH)
    const long = buildClientOrderId(EXEC_ID, 'BRK.B', 'sell')
    expect(long.length).toBeLessThanOrEqual(MAX_CLIENT_ORDER_ID_LENGTH)
    const longBuy = buildClientOrderId(EXEC_ID, 'ABCDEFG', 'buy')
    const longSell = buildClientOrderId(EXEC_ID, 'ABCDEFG', 'sell')
    expect(longBuy).not.toBe(longSell)
    expect(longSell).toBe(`${EXEC_ID}-${fnv1aHex('ABCDEFG-sell')}`)
    expect(longSell.length).toBeLessThanOrEqual(MAX_CLIENT_ORDER_ID_LENGTH)
  })

  it('fnv1aHex is 8 hex chars', () => {
    expect(fnv1aHex('abc')).toMatch(/^[0-9a-f]{8}$/)
    expect(fnv1aHex('')).toBe('811c9dc5')
  })
})

// ── status classification ────────────────────────────────────────────────────

describe('classifyAlpacaOrderStatus', () => {
  it('maps terminal statuses', () => {
    expect(classifyAlpacaOrderStatus('filled')).toEqual({ status: 'filled', terminal: true })
    expect(classifyAlpacaOrderStatus('canceled')).toEqual({ status: 'canceled', terminal: true })
    expect(classifyAlpacaOrderStatus('expired')).toEqual({ status: 'expired', terminal: true })
    expect(classifyAlpacaOrderStatus('done_for_day')).toEqual({ status: 'expired', terminal: true })
    expect(classifyAlpacaOrderStatus('rejected')).toEqual({ status: 'rejected', terminal: true })
    expect(classifyAlpacaOrderStatus('replaced')).toEqual({ status: 'canceled', terminal: true })
  })

  it('maps working statuses as non-terminal', () => {
    expect(classifyAlpacaOrderStatus('partially_filled')).toEqual({ status: 'partially_filled', terminal: false })
    for (const s of ['new', 'accepted', 'pending_new', 'pending_cancel', 'held', 'something_new']) {
      expect(classifyAlpacaOrderStatus(s)).toEqual({ status: 'submitted', terminal: false })
    }
  })

  it('isOrderOpen only for submitted / partially filled', () => {
    expect(isOrderOpen(order({ status: 'submitted' }))).toBe(true)
    expect(isOrderOpen(order({ status: 'partially_filled' }))).toBe(true)
    expect(isOrderOpen(order({ status: 'planned' }))).toBe(false)
    expect(isOrderOpen(order({ status: 'filled' }))).toBe(false)
  })
})

describe('applyOrderSnapshot', () => {
  const snap: AlpacaOrderSnapshot = {
    id: 'ord-1', client_order_id: 'cid', symbol: 'AAPL', side: 'buy', status: 'filled',
    qty: null, notional: '50', filled_qty: '0.25', filled_avg_price: '200.10', filled_at: '2026-11-20T15:00:00Z',
    submitted_at: '2026-11-20T14:59:00Z', created_at: null, updated_at: null,
  }

  it('records the fill', () => {
    const out = applyOrderSnapshot(order({ notional: 50 }), snap, 'now')
    expect(out).toMatchObject({
      alpaca_order_id: 'ord-1', client_order_id: 'cid', status: 'filled', alpaca_status: 'filled',
      filled_qty: 0.25, filled_avg_price: 200.1, filled_at: '2026-11-20T15:00:00Z', updated_at: 'now', notional: 50,
    })
  })

  it('adds a default message for rejections', () => {
    expect(applyOrderSnapshot(order({}), { ...snap, status: 'rejected', filled_qty: '0' }, 'now').error_message)
      .toBe('Order rejected by broker')
  })
})

// ── market clock ─────────────────────────────────────────────────────────────

describe('decideMarketWait', () => {
  const now = Date.parse('2026-11-20T15:00:00Z')

  it('proceeds when open with time left before the close', () => {
    expect(decideMarketWait(
      { timestamp: '', is_open: true, next_open: '2026-11-23T14:30:00Z', next_close: '2026-11-20T21:00:00Z' }, now, now,
    )).toEqual({ action: 'proceed' })
  })

  it('waits until next open + 5 minutes when closed', () => {
    expect(decideMarketWait(
      { timestamp: '', is_open: false, next_open: '2026-11-23T14:30:00Z', next_close: '2026-11-23T21:00:00Z' }, now, now,
    )).toEqual({ action: 'wait', until: '2026-11-23T14:35:00.000Z' })
  })

  it('waits for the next session when too close to the close', () => {
    const late = Date.parse('2026-11-20T20:40:00Z')
    expect(decideMarketWait(
      { timestamp: '', is_open: true, next_open: '2026-11-23T14:30:00Z', next_close: '2026-11-20T21:00:00Z' }, late, late,
    )).toEqual({ action: 'wait', until: '2026-11-23T14:35:00.000Z' })
  })

  it('never sleeps past the 4-day cap and gives up after it', () => {
    const clock = { timestamp: '', is_open: false, next_open: '2026-12-01T14:30:00Z', next_close: '2026-12-01T21:00:00Z' }
    expect(decideMarketWait(clock, now, now)).toEqual({ action: 'wait', until: '2026-11-24T15:00:00.000Z' })
    expect(decideMarketWait(clock, now + 4 * 24 * 3600_000, now)).toEqual({ action: 'give_up' })
  })

  it('re-checks in an hour when the clock is unparseable', () => {
    expect(decideMarketWait({ timestamp: '', is_open: false, next_open: 'bad', next_close: 'bad' }, now, now))
      .toEqual({ action: 'wait', until: '2026-11-20T16:00:00.000Z' })
  })
})

describe('settlementLookbackStart', () => {
  it('goes back 2 business days to 00:00 UTC', () => {
    // Thursday → Tuesday
    expect(settlementLookbackStart(new Date('2026-11-19T18:00:00Z')).toISOString()).toBe('2026-11-17T00:00:00.000Z')
  })

  it('skips weekends', () => {
    // Monday → previous Thursday
    expect(settlementLookbackStart(new Date('2026-11-23T15:00:00Z')).toISOString()).toBe('2026-11-19T00:00:00.000Z')
  })
})

// ── planning ─────────────────────────────────────────────────────────────────

describe('planOrders — buys', () => {
  it('uses notional (2dp) for fractionable assets', () => {
    const [o] = planOrders(input({ items: [item('AAPL', 'buy', 37.519)] }))
    expect(o).toMatchObject({
      ticker: 'AAPL', action: 'buy', status: 'planned', notional: 37.51, estimated_value: 37.51,
      client_order_id: `${EXEC_ID}-AAPL-buy`, fractionable: true,
    })
    expect(o.qty).toBeCloseTo(37.51 / 200, 6)
  })

  it(`skips buys below the $${ALPACA_MIN_NOTIONAL_USD} minimum`, () => {
    const [o] = planOrders(input({ items: [item('AAPL', 'buy', 0.99)] }))
    expect(o).toMatchObject({ status: 'skipped', error_message: SKIP_REASONS.belowMinNotional })
  })

  it('falls back to whole shares when the asset is not fractionable', () => {
    const [ok] = planOrders(input({ items: [item('BRK', 'buy', 1200)] }))
    expect(ok).toMatchObject({ status: 'planned', qty: 2, notional: null, estimated_value: 1000 })
    const [small] = planOrders(input({ items: [item('BRK', 'buy', 400)] }))
    expect(small).toMatchObject({ status: 'skipped', error_message: SKIP_REASONS.tooSmallWhole })
  })

  it('applies the Shariah buy guard', () => {
    const [o] = planOrders(input({
      items: [item('XOM', 'buy', 500)],
      assets: { XOM: { tradable: true, fractionable: true } }, quotes: { XOM: 100 },
    }))
    expect(o).toMatchObject({ status: 'skipped', error_message: NOT_COMPLIANT_SKIP_REASON })
    const [noScreen] = planOrders(input({ items: [item('AAPL', 'buy', 500)], screening: null }))
    expect(noScreen).toMatchObject({ status: 'skipped', error_message: NO_SCREENING_SKIP_REASON })
  })

  it('skips untradeable assets and missing quotes', () => {
    const [a] = planOrders(input({ items: [item('AAPL', 'buy', 500)], assets: { AAPL: { tradable: false, fractionable: true } } }))
    expect(a.error_message).toBe(SKIP_REASONS.notTradeable('AAPL'))
    const [b] = planOrders(input({ items: [item('AAPL', 'buy', 500)], quotes: {} }))
    expect(b.error_message).toBe(SKIP_REASONS.noQuote)
  })
})

describe('planOrders — sells', () => {
  it('sells a fractional qty capped at the held qty', () => {
    const [o] = planOrders(input({ items: [item('AAPL', 'sell', -50)], positions: { AAPL: 3 } }))
    expect(o).toMatchObject({ status: 'planned', qty: 0.25, estimated_value: 50, notional: null })
    const [capped] = planOrders(input({ items: [item('AAPL', 'sell', -5000)], positions: { AAPL: 1.5 } }))
    expect(capped.qty).toBe(1.5)
  })

  it('sells the full position when the target is 0%', () => {
    const [o] = planOrders(input({ items: [item('AAPL', 'sell', -10, 0)], positions: { AAPL: 0.123456789 } }))
    expect(o).toMatchObject({ status: 'planned', qty: 0.123456789 })
  })

  it('uses whole shares for non-fractionable sells', () => {
    const [o] = planOrders(input({ items: [item('BRK', 'sell', -1400)], positions: { BRK: 5 } }))
    expect(o.qty).toBe(2)
  })

  it('skips sells with no position or too small', () => {
    expect(planOrders(input({ items: [item('AAPL', 'sell', -50)] }))[0].error_message).toBe(SKIP_REASONS.noPosition)
    expect(planOrders(input({ items: [item('AAPL', 'sell', -0.5)], positions: { AAPL: 3 } }))[0].error_message)
      .toBe(SKIP_REASONS.tooSmallSell)
  })

  it('never sells a symbol bought within the settlement window (GFV guard)', () => {
    const [o] = planOrders(input({ items: [item('AAPL', 'sell', -50, 0)], positions: { AAPL: 3 }, recentBuys: ['AAPL'] }))
    expect(o).toMatchObject({ status: 'skipped', error_message: SKIP_REASONS.unsettledBuy })
  })

  it('skips sells when recent purchases could not be checked', () => {
    const [o] = planOrders(input({ items: [item('AAPL', 'sell', -50)], positions: { AAPL: 3 }, recentBuys: null }))
    expect(o.error_message).toBe(SKIP_REASONS.settlementUnknown)
  })

  it('sells are not subject to the Shariah buy guard and come before buys', () => {
    const out = planOrders(input({
      screening: null,
      items: [item('MSFT', 'buy', 100), item('AAPL', 'sell', -50)],
      positions: { AAPL: 3 },
    }))
    expect(out.map(o => `${o.action}:${o.status}`)).toEqual(['sell:planned', 'buy:skipped'])
  })

  it('ignores hold items', () => {
    expect(planOrders(input({ items: [{ ...item('AAPL', 'buy', 0), action: 'hold' }] }))).toEqual([])
  })
})

// ── buying power ─────────────────────────────────────────────────────────────

describe('computeBuyingCapacity', () => {
  it('uses the smaller of cash and non-marginable buying power', () => {
    expect(computeBuyingCapacity({ cash: 1000, non_marginable_buying_power: 800 })).toBe(800)
    expect(computeBuyingCapacity({ cash: 500, non_marginable_buying_power: 800 })).toBe(500)
  })

  it('handles missing and negative values', () => {
    expect(computeBuyingCapacity({ cash: null, non_marginable_buying_power: 300 })).toBe(300)
    expect(computeBuyingCapacity({ cash: null, non_marginable_buying_power: null })).toBe(0)
    expect(computeBuyingCapacity({ cash: -10, non_marginable_buying_power: 300 })).toBe(0)
  })
})

describe('scaleBuysToCapacity', () => {
  const buys = [
    order({ ticker: 'AAPL', notional: 600, estimated_value: 600, price_at_execution: 200, qty: 3 }),
    order({ ticker: 'MSFT', notional: 400, estimated_value: 400, price_at_execution: 400, qty: 1 }),
    order({ ticker: 'X', action: 'sell', qty: 1, status: 'filled' }),
  ]

  it('leaves buys alone when they fit', () => {
    expect(scaleBuysToCapacity(buys, 1000)).toBe(buys)
  })

  it('scales proportionally and floors to cents', () => {
    const out = scaleBuysToCapacity(buys, 500.01)
    expect(out[0].notional).toBe(300)
    expect(out[1].notional).toBe(200)
    expect(out[0].qty).toBe(1.5)
    expect(out[2]).toBe(buys[2])
    const total = out.filter(o => o.action === 'buy').reduce((s, o) => s + (o.notional ?? 0), 0)
    expect(total).toBeLessThanOrEqual(500.01)
  })

  it('skips buys that fall below the minimum', () => {
    const out = scaleBuysToCapacity(buys, 2)
    expect(out[0]).toMatchObject({ status: 'planned', notional: 1.2 })
    expect(out[1]).toMatchObject({ status: 'skipped', error_message: SKIP_REASONS.noBuyingPower })
  })

  it('scales whole-share buys with a slippage buffer', () => {
    const whole = [order({ ticker: 'BRK', qty: 4, price_at_execution: 100, estimated_value: 400 })]
    // cost incl. 1% buffer = 404 → factor 0.5 → 2 shares
    expect(scaleBuysToCapacity(whole, 202)[0]).toMatchObject({ status: 'planned', qty: 2, estimated_value: 200 })
    expect(scaleBuysToCapacity(whole, 50)[0]).toMatchObject({ status: 'skipped', error_message: SKIP_REASONS.noBuyingPower })
  })

  it('skips everything when there is no capacity', () => {
    expect(scaleBuysToCapacity(buys, 0).filter(o => o.action === 'buy').every(o => o.status === 'skipped')).toBe(true)
  })
})

// ── execution status + storage ───────────────────────────────────────────────

describe('deriveExecutionStatus', () => {
  it('completed when nothing actionable or everything filled', () => {
    expect(deriveExecutionStatus([])).toBe('completed')
    expect(deriveExecutionStatus([order({ status: 'skipped' })])).toBe('completed')
    expect(deriveExecutionStatus([order({ status: 'filled' }), order({ status: 'skipped' })])).toBe('completed')
  })

  it('completed_with_errors when some but not all filled', () => {
    expect(deriveExecutionStatus([order({ status: 'filled' }), order({ status: 'rejected' })])).toBe('completed_with_errors')
    expect(deriveExecutionStatus([order({ status: 'canceled', filled_qty: 0.5 })])).toBe('completed_with_errors')
  })

  it('failed when nothing filled', () => {
    expect(deriveExecutionStatus([order({ status: 'rejected' }), order({ status: 'error' })])).toBe('failed')
  })
})

describe('parseStoredOrders / normalizeExecution', () => {
  const legacy = [order({ status: 'submitted', qty: 2 })]

  it('reads legacy bare arrays as completed', () => {
    expect(parseStoredOrders(legacy)).toMatchObject({ status: 'completed', orders: legacy })
  })

  it('reads v2 envelopes', () => {
    const env = buildEnvelope('waiting_for_market', [], '2026-11-20T00:00:00Z', { wait_until: '2026-11-23T14:35:00Z' })
    expect(parseStoredOrders(env)).toEqual({
      status: 'waiting_for_market', updated_at: '2026-11-20T00:00:00Z', error_message: null,
      wait_until: '2026-11-23T14:35:00Z', orders: [],
    })
  })

  it('keeps extra v2 order fields', () => {
    const o = order({ status: 'filled', notional: 10, filled_qty: 0.05, client_order_id: 'c' })
    expect(parseStoredOrders(buildEnvelope('completed', [o], 'now')).orders[0]).toEqual(o)
  })

  it('treats garbage as failed with no orders', () => {
    expect(parseStoredOrders({ foo: 1 })).toMatchObject({ status: 'failed', orders: [] })
  })

  it('normalizeExecution unwraps the envelope', () => {
    const n = normalizeExecution({
      id: 'e', recommendation_id: 'r', user_id: 'u', executed_at: 't', is_paper: true,
      orders: buildEnvelope('executing', legacy, 'now'),
    })
    expect(n).toMatchObject({ id: 'e', status: 'executing', is_paper: true, orders: legacy })
  })
})
