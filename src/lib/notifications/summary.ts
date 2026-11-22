import type { ActionItem, AlpacaOrderResult, ExecutionStatus } from '@/types/database'
import type { ShariahScreeningResult } from '@/types/shariah'
import type { NotificationType, OrderOutcomeLine, TradeLine, WeeklySummaryPayload } from './types'

/** Pure helpers that turn stored rows into notification payload pieces. */

/** Non-hold actions, largest first. */
export function topTrades(actionList: ActionItem[] | null | undefined, limit = 5): TradeLine[] {
  return (actionList ?? [])
    .filter((a): a is ActionItem & { action: 'buy' | 'sell' } => a.action === 'buy' || a.action === 'sell')
    .filter(a => Number.isFinite(a.delta_usd) && Math.abs(a.delta_usd) > 0)
    .sort((a, b) => Math.abs(b.delta_usd) - Math.abs(a.delta_usd))
    .slice(0, limit)
    .map(a => ({ ticker: a.ticker, action: a.action, amount_usd: Math.round(Math.abs(a.delta_usd) * 100) / 100 }))
}

export function tradeCount(actionList: ActionItem[] | null | undefined): number {
  return (actionList ?? []).filter(a => a.action === 'buy' || a.action === 'sell').length
}

/** Execution status → notification type. Non-terminal statuses → null (nothing to send). */
export function executionNotificationType(status: ExecutionStatus | string): NotificationType | null {
  switch (status) {
    case 'completed':             return 'execution_completed'
    case 'completed_with_errors': return 'execution_completed_with_errors'
    case 'failed':
    case 'cancelled':             return 'execution_failed'
    case 'dry_run_completed':     return 'dry_run_completed'
    default:                      return null
  }
}

export function orderOutcomeLines(orders: AlpacaOrderResult[]): OrderOutcomeLine[] {
  return orders.map(o => {
    const filledValue = typeof o.filled_qty === 'number' && typeof o.filled_avg_price === 'number'
      ? o.filled_qty * o.filled_avg_price
      : null
    const amount = filledValue ?? (typeof o.notional === 'number' && o.notional > 0 ? o.notional : o.estimated_value)
    return {
      ticker:           o.ticker,
      action:           o.action,
      amount_usd:       Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100,
      qty:              typeof o.filled_qty === 'number' && o.filled_qty > 0 ? o.filled_qty : (o.qty > 0 ? o.qty : null),
      status:           o.status,
      filled_avg_price: typeof o.filled_avg_price === 'number' ? o.filled_avg_price : null,
      note:             o.error_message ?? o.risk_note ?? null,
    }
  })
}

/** Change in account value over the 1W equity history (first → last valid point). Null with < 2 points. */
export function computeWeeklyChange(equity: Array<number | null>): WeeklySummaryPayload['pnl'] {
  const points = equity.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (points.length < 2) return null
  const start = points[0]
  const end = points[points.length - 1]
  const change = Math.round((end - start) * 100) / 100
  return {
    start_equity: start,
    end_equity:   end,
    change_usd:   change,
    change_pct:   start > 0 ? Math.round(((end - start) / start) * 10000) / 100 : null,
  }
}

/** Current Shariah status of HOLDINGS from the latest complete recommendation's screening. */
export function shariahHoldingsStatus(screening: ShariahScreeningResult | null): WeeklySummaryPayload['shariah'] {
  if (!screening) return null
  // No Shariah section when the latest screening ran with Islamic screening off (specs/030).
  if (screening.config && !screening.config.islamic) return null
  const holdings = screening.tickers.filter(t => t.is_holding)
  return {
    screened_at:   screening.screened_at,
    compliant:     holdings.filter(t => t.verdict === 'compliant').map(t => t.ticker).sort(),
    non_compliant: holdings
      .filter(t => t.verdict === 'non_compliant')
      .map(t => ({ ticker: t.ticker, reason: t.reasons[0] ?? 'Failed Shariah screening' }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker)),
  }
}

/** Redact secrets from an error string and cap its length (stored in notification_log). */
export function sanitizeNotificationError(message: string, secrets: Array<string | undefined>): string {
  let out = message
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join('[REDACTED]')
  return out.slice(0, 300)
}
