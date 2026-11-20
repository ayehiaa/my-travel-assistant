import { describe, expect, it } from 'vitest'
import {
  computeWeeklyChange,
  executionNotificationType,
  orderOutcomeLines,
  sanitizeNotificationError,
  shariahHoldingsStatus,
  topTrades,
  tradeCount,
} from './summary'
import type { ActionItem, AlpacaOrderResult } from '@/types/database'
import type { ShariahScreeningResult } from '@/types/shariah'

function action(ticker: string, act: ActionItem['action'], delta: number): ActionItem {
  return { ticker, action: act, current_pct: 0, target_pct: 0, current_usd: 0, target_usd: 0, delta_usd: delta }
}

describe('topTrades / tradeCount', () => {
  const list = [action('A', 'buy', 100), action('B', 'sell', -500), action('C', 'hold', 0), action('D', 'buy', 250.555)]
  it('returns non-hold actions largest first', () => {
    expect(topTrades(list, 2)).toEqual([
      { ticker: 'B', action: 'sell', amount_usd: 500 },
      { ticker: 'D', action: 'buy', amount_usd: 250.56 },
    ])
    expect(tradeCount(list)).toBe(3)
    expect(topTrades(null)).toEqual([])
  })
})

describe('executionNotificationType', () => {
  it('maps terminal statuses', () => {
    expect(executionNotificationType('completed')).toBe('execution_completed')
    expect(executionNotificationType('completed_with_errors')).toBe('execution_completed_with_errors')
    expect(executionNotificationType('failed')).toBe('execution_failed')
    expect(executionNotificationType('cancelled')).toBe('execution_failed')
    expect(executionNotificationType('dry_run_completed')).toBe('dry_run_completed')
  })
  it('ignores non-terminal statuses', () => {
    expect(executionNotificationType('pending')).toBeNull()
    expect(executionNotificationType('executing')).toBeNull()
    expect(executionNotificationType('waiting_for_market')).toBeNull()
  })
})

describe('orderOutcomeLines', () => {
  const base: AlpacaOrderResult = {
    ticker: 'AAPL', action: 'buy', qty: 0, price_at_execution: 200, estimated_value: 500,
    alpaca_order_id: null, status: 'filled', error_message: null,
  }
  it('uses the filled value, then notional, then the estimate', () => {
    expect(orderOutcomeLines([{ ...base, filled_qty: 2, filled_avg_price: 201 }])[0]).toMatchObject({ amount_usd: 402, qty: 2, filled_avg_price: 201 })
    expect(orderOutcomeLines([{ ...base, notional: 300 }])[0]).toMatchObject({ amount_usd: 300, qty: null })
    expect(orderOutcomeLines([{ ...base, status: 'rejected', error_message: 'insufficient buying power' }])[0])
      .toMatchObject({ amount_usd: 500, status: 'rejected', note: 'insufficient buying power' })
  })
})

describe('computeWeeklyChange', () => {
  it('computes first → last of valid points', () => {
    expect(computeWeeklyChange([null, 10000, 10100, null, 10250])).toEqual({
      start_equity: 10000, end_equity: 10250, change_usd: 250, change_pct: 2.5,
    })
  })
  it('handles losses and a zero start', () => {
    expect(computeWeeklyChange([1000, 900])?.change_pct).toBe(-10)
    expect(computeWeeklyChange([0, 100])?.change_pct).toBeNull()
  })
  it('returns null with fewer than two points', () => {
    expect(computeWeeklyChange([])).toBeNull()
    expect(computeWeeklyChange([null, 5])).toBeNull()
  })
})

describe('shariahHoldingsStatus', () => {
  it('lists holdings only, split by verdict', () => {
    const ratio = { value_pct: 1, status: 'pass' as const, source: 'polygon' as const, basis: 'exact' as const }
    const mk = (ticker: string, verdict: 'compliant' | 'non_compliant', is_holding: boolean, reasons: string[] = []) => ({
      ticker, name: null, verdict, reasons, security_type: 'CS', sic_code: null, sic_description: null,
      reviewer_verdict: null, reviewer_reason: null, non_permissible_income_pct: null,
      ratios: { debt: ratio, cash_and_securities: ratio, receivables: ratio }, ratio_source: 'polygon' as const,
      is_holding, excluded: false, screened_at: 'x',
    })
    const s: ShariahScreeningResult = {
      version: 1, screened_at: '2026-11-20T15:00:00Z', excluded: [],
      tickers: [mk('MSFT', 'compliant', true), mk('BAC', 'non_compliant', true, ['Conventional bank']), mk('NEW', 'compliant', false)],
    }
    expect(shariahHoldingsStatus(s)).toEqual({
      screened_at: '2026-11-20T15:00:00Z',
      compliant: ['MSFT'],
      non_compliant: [{ ticker: 'BAC', reason: 'Conventional bank' }],
    })
    expect(shariahHoldingsStatus(null)).toBeNull()
  })
})

describe('sanitizeNotificationError', () => {
  it('redacts secrets and caps the length', () => {
    expect(sanitizeNotificationError('bad key re_secret123 here', ['re_secret123'])).toBe('bad key [REDACTED] here')
    expect(sanitizeNotificationError('x'.repeat(500), [])).toHaveLength(300)
  })
})
