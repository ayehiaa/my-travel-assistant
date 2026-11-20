import { z } from 'zod'
import type { ActionItem, AlpacaOrderResult } from '@/types/database'
import type { ShariahScreeningResult } from '@/types/shariah'

/**
 * Hard risk limits applied to every execution plan (preview and engine) — pure and unit tested.
 * See specs/021-risk-limits-kill-switch/spec.md.
 */

// ── Limits ───────────────────────────────────────────────────────────────────

export interface RiskLimits {
  /** Σ |order $| / portfolio value per execution, in %. */
  max_turnover_pct: number
  /** No single stock above this weight after the trades, in %. */
  max_position_pct: number
  /** Buys never spend cash below this share of the portfolio, in %. */
  min_cash_buffer_pct: number
  /** Orders whose |current% − target%| is below this are dropped (forced Shariah sells excepted). */
  drift_threshold_pct: number
  /** Each order is trimmed to this USD amount; null = no cap. */
  max_single_order_usd: number | null
  /** Block when equity fell more than this % vs last_equity (previous close). */
  daily_loss_stop_pct: number
  /** Block when equity fell more than this % vs the start of the last 5 trading days. */
  weekly_loss_stop_pct: number
}

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  max_turnover_pct:     20,
  max_position_pct:     20,
  min_cash_buffer_pct:  2,
  drift_threshold_pct:  3,
  max_single_order_usd: null,
  daily_loss_stop_pct:  3,
  weekly_loss_stop_pct: 7,
}

const pct = z.number().finite().min(1).max(100)

/** Bounded schema for user input (settings API). */
export const RiskLimitsSchema = z.object({
  max_turnover_pct:     pct,
  max_position_pct:     pct,
  min_cash_buffer_pct:  pct,
  drift_threshold_pct:  pct,
  max_single_order_usd: z.number().finite().min(1).max(10_000_000).nullable(),
  daily_loss_stop_pct:  pct,
  weekly_loss_stop_pct: pct,
})

/** Merge stored (possibly partial / invalid) limits over the defaults, field by field. */
export function resolveRiskLimits(raw: unknown): RiskLimits {
  const out: RiskLimits = { ...DEFAULT_RISK_LIMITS }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const obj = raw as Record<string, unknown>
  const shape = RiskLimitsSchema.shape
  for (const key of Object.keys(shape) as Array<keyof RiskLimits>) {
    if (!(key in obj)) continue
    const parsed = shape[key].safeParse(obj[key])
    if (parsed.success) (out as unknown as Record<string, unknown>)[key] = parsed.data
  }
  return out
}

// ── Safety settings stored on portfolio_settings ─────────────────────────────

/** Typed confirmation required to lift the trading pause. */
export const RESUME_CONFIRM_TEXT = 'RESUME'
/** Typed confirmation required to turn dry run off (live orders). */
export const LIVE_TRADING_CONFIRM_TEXT = 'ENABLE LIVE TRADING'

export interface SafetySettings {
  limits: RiskLimits
  dry_run: boolean
  trading_paused: boolean
  paused_reason: string | null
  paused_at: string | null
  /** False when the safety columns do not exist yet (migration 20261120c not applied). */
  migration_applied: boolean
}

/**
 * Read safety settings from a portfolio_settings row (select('*')) defensively.
 * Missing row / columns → defaults: dry run ON, not paused, default limits.
 */
export function readSafetySettings(row: Record<string, unknown> | null | undefined): SafetySettings {
  const r = row ?? {}
  const migrationApplied = 'dry_run' in r && 'trading_paused' in r
  return {
    limits:            resolveRiskLimits(r.risk_limits),
    dry_run:           r.dry_run === false ? false : true,
    trading_paused:    r.trading_paused === true,
    paused_reason:     typeof r.paused_reason === 'string' ? r.paused_reason : null,
    paused_at:         typeof r.paused_at === 'string' ? r.paused_at : null,
    migration_applied: migrationApplied,
  }
}

// ── Forced Shariah sells ─────────────────────────────────────────────────────

export const SHARIAH_SELL_NOTE_PREFIX = 'Not Shariah-compliant'

/** A SELL of a holding that failed Shariah screening — always allowed, never trimmed. */
export function isForcedShariahSell(item: ActionItem, screening: ShariahScreeningResult | null): boolean {
  if (item.action !== 'sell') return false
  if (item.note?.startsWith(SHARIAH_SELL_NOTE_PREFIX)) return true
  if (!screening) return false
  if (screening.excluded.some(e => e.ticker === item.ticker)) return true
  const s = screening.tickers.find(t => t.ticker === item.ticker)
  return !!s && (s.verdict === 'non_compliant' || s.excluded)
}

export function forcedSellTickers(items: ActionItem[], screening: ShariahScreeningResult | null): string[] {
  return [...new Set(items.filter(i => isForcedShariahSell(i, screening)).map(i => i.ticker))]
}

// ── Order sizing helpers ─────────────────────────────────────────────────────

const MIN_NOTIONAL_USD = 1
const QTY_DP = 6
const SLIPPAGE = 0.01

function floorTo(value: number, dp: number): number {
  if (!Number.isFinite(value)) return 0
  const f = 10 ** dp
  return Math.floor(value * f + 1e-9) / f
}

function isNotionalBuy(o: AlpacaOrderResult): boolean {
  return o.action === 'buy' && typeof o.notional === 'number' && o.notional > 0
}

/** USD value of a planned order (notional for notional buys, qty × price otherwise). */
export function orderValueUsd(o: AlpacaOrderResult): number {
  if (o.status !== 'planned') return 0
  if (isNotionalBuy(o)) return o.notional as number
  return Math.max(0, o.qty * o.price_at_execution)
}

/** Cash a planned buy may consume (whole-share market buys reserve 1% slippage). */
function buyCostUsd(o: AlpacaOrderResult): number {
  if (o.action !== 'buy' || o.status !== 'planned') return 0
  return isNotionalBuy(o) ? (o.notional as number) : o.qty * o.price_at_execution * (1 + SLIPPAGE)
}

function blockOrder(o: AlpacaOrderResult, reason: string): AlpacaOrderResult {
  return { ...o, qty: 0, notional: null, estimated_value: 0, status: 'skipped', error_message: reason, risk_note: null }
}

/**
 * Shrink a planned order to at most `targetUsd`. Never increases an order. Notional buys floor to cents,
 * fractional sells to 6dp, everything else to whole shares; anything that falls below Alpaca's $1 minimum
 * (or to zero shares) is blocked with `blockReason`. Non-planned orders pass through unchanged.
 */
export function resizeOrder(
  o: AlpacaOrderResult,
  targetUsd: number,
  trimNote: string,
  blockReason: string,
): AlpacaOrderResult {
  if (o.status !== 'planned') return o
  const current = orderValueUsd(o)
  const target = Math.max(0, Number.isFinite(targetUsd) ? targetUsd : 0)
  if (target >= current - 1e-9) return o
  const price = o.price_at_execution

  if (isNotionalBuy(o)) {
    const notional = Math.min(floorTo(target, 2), o.notional as number)
    if (notional < MIN_NOTIONAL_USD) return blockOrder(o, blockReason)
    const qty = price > 0 ? floorTo(notional / price, QTY_DP) : 0
    return { ...o, notional, qty, estimated_value: notional, risk_note: trimNote }
  }

  if (!(price > 0)) return blockOrder(o, blockReason)
  const fractionalSell = o.action === 'sell' && o.fractionable === true
  let qty = fractionalSell ? floorTo(target / price, QTY_DP) : Math.floor(target / price + 1e-9)
  qty = Math.min(qty, o.qty)
  if (qty <= 0 || (fractionalSell && qty * price < MIN_NOTIONAL_USD)) return blockOrder(o, blockReason)
  return { ...o, qty, estimated_value: qty * price, risk_note: trimNote }
}

// ── applyRiskLimits ──────────────────────────────────────────────────────────

export type RiskRule = 'drift' | 'turnover' | 'position' | 'cash_buffer' | 'single_order'

export interface RiskAdjustment {
  ticker: string
  action: 'buy' | 'sell'
  rule: RiskRule
  outcome: 'blocked' | 'trimmed'
  before_usd: number
  after_usd: number
  reason: string
}

export interface RiskAccount {
  /** Total account equity (portfolio value). */
  equity: number
  cash: number
  /** ticker → current market value in USD. */
  positions: Record<string, number>
}

export interface RiskPlan {
  /** Planned orders from planOrders (skipped rows pass through). */
  orders: AlpacaOrderResult[]
  /** The action list the orders came from (for current / target weights). */
  items: ActionItem[]
  /** Tickers whose SELL is a forced Shariah sell. */
  forcedSellTickers: string[]
}

export interface RiskSummary {
  portfolio_value: number
  turnover_before_usd: number
  turnover_after_usd: number
  turnover_before_pct: number
  turnover_after_pct: number
  blocked_count: number
  trimmed_count: number
  forced_sell_count: number
  limits: RiskLimits
}

export interface RiskResult {
  orders: AlpacaOrderResult[]
  adjustments: RiskAdjustment[]
  summary: RiskSummary
}

const fmtPct = (n: number) => `${Math.round(n * 10) / 10}%`
const fmtUsd = (n: number) => `$${(Math.round(n * 100) / 100).toLocaleString('en-US')}`

/**
 * Apply the hard limits to a plan, in order: forced Shariah sells (always allowed, exempt) → drift filter →
 * turnover cap (proportional) → position cap → cash buffer (proportional, buys only) → single-order cap.
 * Each step can only shrink or block orders. Blocked orders become `skipped` with the reason.
 */
export function applyRiskLimits(plan: RiskPlan, account: RiskAccount, limits: RiskLimits): RiskResult {
  const forced = new Set(plan.forcedSellTickers)
  const isForced = (o: AlpacaOrderResult) => o.action === 'sell' && forced.has(o.ticker)
  const items = new Map(plan.items.map(i => [`${i.ticker}|${i.action}`, i]))
  const adjustments: RiskAdjustment[] = []

  const positionsTotal = Object.values(account.positions).reduce((s, v) => s + (Number.isFinite(v) ? Math.max(0, v) : 0), 0)
  const portfolioValue = Number.isFinite(account.equity) && account.equity > 0
    ? account.equity
    : Math.max(0, (Number.isFinite(account.cash) ? account.cash : 0) + positionsTotal)

  let orders = plan.orders.map(o => ({ ...o }))
  const turnoverBefore = orders.reduce((s, o) => s + orderValueUsd(o), 0)

  const record = (before: AlpacaOrderResult, after: AlpacaOrderResult, rule: RiskRule, reason: string) => {
    const b = orderValueUsd(before)
    const blocked = after.status === 'skipped'
    const a = blocked ? 0 : orderValueUsd(after)
    if (!blocked && a >= b - 1e-9) return
    adjustments.push({
      ticker: before.ticker, action: before.action, rule,
      outcome: blocked ? 'blocked' : 'trimmed',
      before_usd: b, after_usd: a,
      reason: blocked ? (after.error_message ?? reason) : reason,
    })
  }

  const update = (
    rule: RiskRule,
    fn: (o: AlpacaOrderResult) => AlpacaOrderResult | null,
    noteFor: (o: AlpacaOrderResult) => string,
  ) => {
    orders = orders.map(o => {
      if (o.status !== 'planned' || isForced(o)) return o
      const next = fn(o)
      if (!next || next === o) return o
      record(o, next, rule, noteFor(o))
      return next
    })
  }

  // 0. Nothing can be sized against an empty / unknown portfolio.
  if (!(portfolioValue > 0)) {
    update('turnover', o => blockOrder(o, 'Portfolio value is unknown or zero — order blocked'), () => '')
  }

  // 1. Drift filter.
  update('drift', (o) => {
    const item = items.get(`${o.ticker}|${o.action}`)
    if (!item) return null
    const drift = Math.abs(item.current_pct - item.target_pct)
    if (drift >= limits.drift_threshold_pct) return null
    return blockOrder(o, `Drift of ${fmtPct(drift)} is below the ${fmtPct(limits.drift_threshold_pct)} threshold`)
  }, () => '')

  // 2. Turnover cap — forced sells consume the budget first; everything else is scaled proportionally.
  const capUsd = (limits.max_turnover_pct / 100) * portfolioValue
  const forcedUsd = orders.filter(o => isForced(o)).reduce((s, o) => s + orderValueUsd(o), 0)
  const scalableUsd = orders.filter(o => !isForced(o)).reduce((s, o) => s + orderValueUsd(o), 0)
  if (scalableUsd > 0 && forcedUsd + scalableUsd > capUsd + 1e-9) {
    const factor = Math.max(0, capUsd - forcedUsd) / scalableUsd
    const note = `Trimmed to keep this execution within the ${fmtPct(limits.max_turnover_pct)} turnover limit`
    const block = `Blocked — the ${fmtPct(limits.max_turnover_pct)} turnover limit is used up`
    update('turnover', o => resizeOrder(o, orderValueUsd(o) * factor, note, block), () => note)
  }

  // 3. Position cap (buys).
  const positionCapUsd = (limits.max_position_pct / 100) * portfolioValue
  update('position', (o) => {
    if (o.action !== 'buy') return null
    const held = Math.max(0, account.positions[o.ticker] ?? 0)
    const allowed = positionCapUsd - held
    const note = `Trimmed so ${o.ticker} stays at or below the ${fmtPct(limits.max_position_pct)} position cap`
    const block = held > 0
      ? `Blocked — ${o.ticker} is already ${fmtPct((held / portfolioValue) * 100)} of the portfolio (cap ${fmtPct(limits.max_position_pct)})`
      : `Blocked — would exceed the ${fmtPct(limits.max_position_pct)} position cap`
    return resizeOrder(o, allowed, note, block)
  }, o => `Trimmed so ${o.ticker} stays at or below the ${fmtPct(limits.max_position_pct)} position cap`)

  // 4. Cash buffer (buys) — planned sell proceeds count as incoming cash.
  const bufferUsd = (limits.min_cash_buffer_pct / 100) * portfolioValue
  const sellProceeds = orders.filter(o => o.action === 'sell').reduce((s, o) => s + orderValueUsd(o), 0)
  const spendable = Math.max(0, (Number.isFinite(account.cash) ? account.cash : 0) + sellProceeds - bufferUsd)
  const buyCost = orders.reduce((s, o) => s + buyCostUsd(o), 0)
  if (buyCost > spendable + 1e-9) {
    const factor = buyCost > 0 ? spendable / buyCost : 0
    const note = `Trimmed to keep a ${fmtPct(limits.min_cash_buffer_pct)} cash buffer`
    const block = `Blocked — not enough cash above the ${fmtPct(limits.min_cash_buffer_pct)} cash buffer`
    update('cash_buffer', o => (o.action === 'buy' ? resizeOrder(o, orderValueUsd(o) * factor, note, block) : null), () => note)
  }

  // 5. Single-order cap.
  const single = limits.max_single_order_usd
  if (single !== null && single > 0) {
    const note = `Trimmed to the ${fmtUsd(single)} single-order cap`
    const block = `Blocked — cannot be sized within the ${fmtUsd(single)} single-order cap`
    update('single_order', o => resizeOrder(o, single, note, block), () => note)
  }

  // Keep the last trim note when an order was trimmed by several rules; blocked rows carry error_message.
  const turnoverAfter = orders.reduce((s, o) => s + orderValueUsd(o), 0)
  const touched = new Set(adjustments.map(a => `${a.ticker}|${a.action}`))
  const blocked = orders.filter(o => o.status === 'skipped' && touched.has(`${o.ticker}|${o.action}`)).length
  const trimmed = orders.filter(o => o.status === 'planned' && touched.has(`${o.ticker}|${o.action}`)).length
  const toPct = (usd: number) => (portfolioValue > 0 ? (usd / portfolioValue) * 100 : 0)

  return {
    orders,
    adjustments,
    summary: {
      portfolio_value:     portfolioValue,
      turnover_before_usd: turnoverBefore,
      turnover_after_usd:  turnoverAfter,
      turnover_before_pct: toPct(turnoverBefore),
      turnover_after_pct:  toPct(turnoverAfter),
      blocked_count:       blocked,
      trimmed_count:       trimmed,
      forced_sell_count:   orders.filter(o => isForced(o) && o.status === 'planned').length,
      limits,
    },
  }
}

// ── Loss stops ───────────────────────────────────────────────────────────────

/** First positive equity point of a portfolio-history series (the start of the window), or null. */
export function pickWeekStartEquity(equity: Array<number | null> | null | undefined): number | null {
  if (!equity) return null
  for (const v of equity) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  }
  return null
}

export interface LossStopInput {
  equity: number | null
  last_equity: number | null
  /** Start-of-window equity; null when the history has no positive point (e.g. a new account). */
  week_start_equity: number | null
  /** False when the portfolio history request failed. */
  week_history_available: boolean
}

export interface LossStopResult {
  /** True → no new orders may be submitted. */
  blocked: boolean
  /** Which stop was breached (an actual loss). null for verification failures or no breach. */
  triggered: 'daily' | 'weekly' | null
  reason: string | null
  daily_change_pct: number | null
  weekly_change_pct: number | null
}

const changePct = (now: number, base: number) => ((now - base) / base) * 100

/**
 * Evaluate the daily / weekly loss stops. Fails closed: unknown equity → blocked (but not "triggered", so the
 * caller does not engage the pause on a data outage).
 */
export function evaluateLossStops(input: LossStopInput, limits: RiskLimits): LossStopResult {
  const ok = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n)
  if (!ok(input.equity) || !ok(input.last_equity)) {
    return { blocked: true, triggered: null, reason: "Could not verify today's account equity — no orders placed", daily_change_pct: null, weekly_change_pct: null }
  }
  const daily = input.last_equity > 0 ? changePct(input.equity, input.last_equity) : null
  const weekly = ok(input.week_start_equity) && input.week_start_equity > 0 ? changePct(input.equity, input.week_start_equity) : null

  if (daily !== null && -daily > limits.daily_loss_stop_pct) {
    return {
      blocked: true, triggered: 'daily',
      reason: `Daily loss stop: equity is down ${fmtPct(-daily)} since the previous close (limit ${fmtPct(limits.daily_loss_stop_pct)})`,
      daily_change_pct: daily, weekly_change_pct: weekly,
    }
  }
  if (weekly !== null && -weekly > limits.weekly_loss_stop_pct) {
    return {
      blocked: true, triggered: 'weekly',
      reason: `Weekly loss stop: equity is down ${fmtPct(-weekly)} over the last 5 trading days (limit ${fmtPct(limits.weekly_loss_stop_pct)})`,
      daily_change_pct: daily, weekly_change_pct: weekly,
    }
  }
  if (!input.week_history_available) {
    return { blocked: true, triggered: null, reason: 'Could not verify the weekly account history — no orders placed', daily_change_pct: daily, weekly_change_pct: null }
  }
  return { blocked: false, triggered: null, reason: null, daily_change_pct: daily, weekly_change_pct: weekly }
}

// ── Engine buy sizing ────────────────────────────────────────────────────────

/** Settled buying capacity reduced so cash never drops below the buffer. */
export function bufferedBuyingCapacity(capacity: number, cash: number | null, equity: number | null, limits: RiskLimits): number {
  const cap = Math.max(0, Number.isFinite(capacity) ? capacity : 0)
  if (typeof cash !== 'number' || !Number.isFinite(cash)) return 0
  const eq = typeof equity === 'number' && Number.isFinite(equity) && equity > 0 ? equity : Math.max(0, cash)
  const buffer = (limits.min_cash_buffer_pct / 100) * eq
  return Math.max(0, Math.min(cap, cash - buffer))
}
