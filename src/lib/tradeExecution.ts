import { z } from 'zod'
import { getBuyBlockReason } from '@/lib/shariahRules'
import { FULL_SCREENING_CONFIG, type EffectiveScreeningConfig } from '@/lib/screeningConfig'
import {
  applyRiskLimits,
  forcedSellTickers,
  type RiskAccount,
  type RiskAdjustment,
  type RiskLimits,
  type RiskSummary,
} from '@/lib/riskLimits'
import {
  fetchAllPositions,
  fetchAsset,
  fetchEquitySnapshot,
  fetchPosition,
  fetchQuotes,
  fetchRecentBuySymbols,
  type AlpacaOrderSnapshot,
} from '@/lib/alpacaClient'
import type {
  ActionItem,
  AlpacaOrderResult,
  AlpacaOrderStatus,
  ExecutionEnvelope,
  ExecutionStatus,
  NormalizedExecution,
} from '@/types/database'
import type { ShariahScreeningResult } from '@/types/shariah'

/**
 * Trade execution planning + state logic shared by the preview route, the Inngest execution engine
 * (src/inngest/executeTrades.ts) and later phases (risk limits, autopilot). Everything above the
 * "Alpaca inputs" section is pure and unit tested. See specs/020-order-execution-engine/spec.md.
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Alpaca rejects notional (fractional) orders below $1. */
export const ALPACA_MIN_NOTIONAL_USD = 1
export const MAX_CLIENT_ORDER_ID_LENGTH = 48
/** Wait this long after the open before submitting (opening auction volatility). */
export const MARKET_OPEN_BUFFER_MS = 5 * 60_000
/** Do not start an execution this close to the close — sells must fill before buys are sized. */
export const MIN_TIME_BEFORE_CLOSE_MS = 35 * 60_000
/** Give up when the market has not opened within 4 days of the request. */
export const MAX_MARKET_WAIT_MS = 4 * 24 * 60 * 60_000
export const ORDER_POLL_INTERVAL = '15s'
export const ORDER_POLL_INTERVAL_MS = 15_000
export const ORDER_POLL_TIMEOUT_MS = 30 * 60_000
/** T+1 settlement plus one day of margin (weekends skipped; holidays not modelled). */
export const SETTLEMENT_LOOKBACK_BUSINESS_DAYS = 2
/** Whole-share market buys may fill above the ask — reserve 1% when sizing to buying power. */
export const WHOLE_SHARE_SLIPPAGE_BUFFER = 0.01
/** Qty precision for fractional sells (Alpaca accepts up to 9dp; 6dp avoids float noise). */
export const FRACTIONAL_QTY_DP = 6

export const SKIP_REASONS = {
  notTradeable:      (t: string) => `${t} is not a tradeable asset on Alpaca`,
  noQuote:           'No live quote available',
  belowMinNotional:  `Below Alpaca's $${ALPACA_MIN_NOTIONAL_USD} minimum order`,
  tooSmallWhole:     'Too small to buy one whole share (asset is not fractionable)',
  noPosition:        'No position held',
  tooSmallSell:      'Sell amount too small to execute',
  unsettledBuy:      'Bought within the settlement window — selling now could cause a good-faith violation',
  settlementUnknown: 'Could not verify recent purchases — sell skipped to avoid a good-faith violation',
  noBuyingPower:     'Insufficient settled buying power',
} as const

// ── Small numeric helpers ────────────────────────────────────────────────────

export function floorTo(value: number, dp: number): number {
  if (!Number.isFinite(value)) return 0
  const f = 10 ** dp
  // The epsilon absorbs binary noise such as 0.29 * 100 = 28.999999999999996.
  return Math.floor(value * f + 1e-9) / f
}

// ── client_order_id ──────────────────────────────────────────────────────────

/** 32-bit FNV-1a as 8 hex chars — deterministic and dependency-free. */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Deterministic Alpaca client_order_id: `${executionId}-${ticker}-${side}`, or
 * `${executionId}-${fnv1a(ticker-side)}` when that would exceed 48 characters.
 * The same execution/ticker/side always yields the same id, so retries can never double-submit.
 */
export function buildClientOrderId(executionId: string, ticker: string, side: 'buy' | 'sell'): string {
  const plain = `${executionId}-${ticker}-${side}`
  if (plain.length <= MAX_CLIENT_ORDER_ID_LENGTH) return plain
  const hashed = `${executionId}-${fnv1aHex(`${ticker}-${side}`)}`
  return hashed.slice(0, MAX_CLIENT_ORDER_ID_LENGTH)
}

// ── Order status classification ──────────────────────────────────────────────

/**
 * Map a raw Alpaca order status to the app's lifecycle status and whether it is final.
 * done_for_day counts as final (a DAY order cannot fill any further) and is reported as expired.
 */
export function classifyAlpacaOrderStatus(raw: string): { status: AlpacaOrderStatus; terminal: boolean } {
  switch (raw) {
    case 'filled':           return { status: 'filled', terminal: true }
    case 'partially_filled': return { status: 'partially_filled', terminal: false }
    case 'canceled':
    case 'replaced':         return { status: 'canceled', terminal: true }
    case 'expired':
    case 'done_for_day':     return { status: 'expired', terminal: true }
    case 'rejected':         return { status: 'rejected', terminal: true }
    default:                 return { status: 'submitted', terminal: false }
  }
}

/** True while the order may still change (needs polling / cancelling). */
export function isOrderOpen(order: AlpacaOrderResult): boolean {
  return order.status === 'submitted' || order.status === 'partially_filled'
}

function parseNum(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

/** Merge an Alpaca order snapshot into the stored order result. */
export function applyOrderSnapshot(order: AlpacaOrderResult, snap: AlpacaOrderSnapshot, nowIso: string): AlpacaOrderResult {
  const { status } = classifyAlpacaOrderStatus(snap.status)
  return {
    ...order,
    alpaca_order_id:  snap.id || order.alpaca_order_id,
    client_order_id:  snap.client_order_id || order.client_order_id || null,
    alpaca_status:    snap.status,
    status,
    filled_qty:       parseNum(snap.filled_qty),
    filled_avg_price: parseNum(snap.filled_avg_price),
    filled_at:        snap.filled_at,
    submitted_at:     snap.submitted_at ?? order.submitted_at ?? null,
    updated_at:       nowIso,
    error_message:    status === 'rejected' && !order.error_message ? 'Order rejected by broker' : order.error_message,
  }
}

// ── Market clock ─────────────────────────────────────────────────────────────

export interface MarketClock {
  timestamp: string
  is_open: boolean
  next_open: string
  next_close: string
}

export type MarketWaitDecision =
  | { action: 'proceed' }
  | { action: 'wait'; until: string }
  | { action: 'give_up' }

/**
 * Decide whether to trade now, sleep, or give up.
 * - open with ≥ 35 minutes to the close → proceed
 * - otherwise sleep until next_open + 5 minutes (when open, Alpaca's next_open is the following session)
 * - never sleep past waitStartedMs + 4 days; at/after that deadline → give up
 */
export function decideMarketWait(clock: MarketClock, nowMs: number, waitStartedMs: number): MarketWaitDecision {
  const nextClose = Date.parse(clock.next_close)
  if (clock.is_open && Number.isFinite(nextClose) && nextClose - nowMs >= MIN_TIME_BEFORE_CLOSE_MS) {
    return { action: 'proceed' }
  }
  const deadline = waitStartedMs + MAX_MARKET_WAIT_MS
  if (nowMs >= deadline) return { action: 'give_up' }

  const nextOpen = Date.parse(clock.next_open)
  // Unparseable clock → re-check in an hour rather than trading blind.
  const target = Number.isFinite(nextOpen) ? nextOpen + MARKET_OPEN_BUFFER_MS : nowMs + 60 * 60_000
  const until = Math.max(nowMs + 60_000, Math.min(target, deadline))
  return { action: 'wait', until: new Date(until).toISOString() }
}

// ── Settlement (good-faith violation) window ─────────────────────────────────

/** Start (00:00 UTC) of the day `businessDays` weekdays before `now`. */
export function settlementLookbackStart(now: Date, businessDays = SETTLEMENT_LOOKBACK_BUSINESS_DAYS): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  let remaining = businessDays
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() - 1)
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6) remaining--
  }
  return d
}

// ── Planning ─────────────────────────────────────────────────────────────────

export interface AssetInfo {
  tradable: boolean
  fractionable: boolean
}

export interface PlanInput {
  executionId: string
  items: ActionItem[]
  screening: ShariahScreeningResult | null
  /** The user's CURRENT effective screening config for the buy guard (specs/030). Missing → everything on. */
  screeningConfig?: EffectiveScreeningConfig
  /** null / missing → not tradeable */
  assets: Record<string, AssetInfo | null>
  /** ticker → ask price */
  quotes: Record<string, number>
  /** ticker → held qty (sell tickers) */
  positions: Record<string, number>
  /** Symbols bought within the settlement window; null when the lookup failed (sells are then skipped). */
  recentBuys: string[] | null
}

function skipped(base: Omit<AlpacaOrderResult, 'status' | 'error_message'>, reason: string): AlpacaOrderResult {
  return { ...base, qty: 0, notional: null, estimated_value: 0, status: 'skipped', error_message: reason }
}

/**
 * Turn an action list into planned orders (status "planned") or skipped rows with reasons.
 * - BUY: Shariah guard first; notional USD (2dp, ≥ $1) when fractionable, else whole shares.
 * - SELL: never if bought within the settlement window; full held qty when the target is 0%;
 *         otherwise |delta| / ask (6dp when fractionable, whole shares otherwise), capped at the held qty.
 * Output order: sells first, then buys (execution order).
 */
export function planOrders(input: PlanInput): AlpacaOrderResult[] {
  const sells: AlpacaOrderResult[] = []
  const buys: AlpacaOrderResult[] = []
  const recent = input.recentBuys === null ? null : new Set(input.recentBuys)

  for (const item of input.items) {
    if (item.action !== 'buy' && item.action !== 'sell') continue
    const side = item.action
    const ask = input.quotes[item.ticker] ?? 0
    const asset = input.assets[item.ticker] ?? null
    const base: Omit<AlpacaOrderResult, 'status' | 'error_message'> = {
      ticker:             item.ticker,
      action:             side,
      qty:                0,
      notional:           null,
      price_at_execution: ask,
      estimated_value:    0,
      alpaca_order_id:    null,
      client_order_id:    buildClientOrderId(input.executionId, item.ticker, side),
      fractionable:       asset?.fractionable ?? false,
    }

    if (side === 'buy') {
      const block = getBuyBlockReason(item.ticker, input.screening, input.screeningConfig ?? FULL_SCREENING_CONFIG)
      if (block) { buys.push(skipped({ ...base, price_at_execution: 0 }, block)); continue }
      if (!asset || !asset.tradable) { buys.push(skipped(base, SKIP_REASONS.notTradeable(item.ticker))); continue }
      if (!(ask > 0)) { buys.push(skipped(base, SKIP_REASONS.noQuote)); continue }
      const delta = Math.max(0, item.delta_usd)
      if (asset.fractionable) {
        const notional = floorTo(delta, 2)
        if (notional < ALPACA_MIN_NOTIONAL_USD) { buys.push(skipped(base, SKIP_REASONS.belowMinNotional)); continue }
        buys.push({
          ...base, notional, qty: floorTo(notional / ask, FRACTIONAL_QTY_DP), estimated_value: notional,
          status: 'planned', error_message: null,
        })
      } else {
        const qty = Math.floor(delta / ask + 1e-9)
        if (qty < 1) { buys.push(skipped(base, SKIP_REASONS.tooSmallWhole)); continue }
        buys.push({ ...base, qty, estimated_value: qty * ask, status: 'planned', error_message: null })
      }
      continue
    }

    // SELL
    if (!asset || !asset.tradable) { sells.push(skipped(base, SKIP_REASONS.notTradeable(item.ticker))); continue }
    const held = Math.max(0, input.positions[item.ticker] ?? 0)
    if (held <= 0) { sells.push(skipped(base, SKIP_REASONS.noPosition)); continue }
    if (recent === null) { sells.push(skipped(base, SKIP_REASONS.settlementUnknown)); continue }
    if (recent.has(item.ticker)) { sells.push(skipped(base, SKIP_REASONS.unsettledBuy)); continue }

    const fullExit = item.target_pct <= 0 || item.target_usd <= 0
    let qty: number
    if (fullExit) {
      qty = held
    } else {
      if (!(ask > 0)) { sells.push(skipped(base, SKIP_REASONS.noQuote)); continue }
      const raw = Math.abs(item.delta_usd) / ask
      qty = asset.fractionable ? floorTo(raw, FRACTIONAL_QTY_DP) : Math.floor(raw + 1e-9)
      qty = Math.min(qty, held)
      if (qty <= 0 || (asset.fractionable && qty * ask < ALPACA_MIN_NOTIONAL_USD)) {
        sells.push(skipped(base, SKIP_REASONS.tooSmallSell)); continue
      }
    }
    sells.push({ ...base, qty, estimated_value: qty * ask, status: 'planned', error_message: null })
  }

  return [...sells, ...buys]
}

// ── Buying power ─────────────────────────────────────────────────────────────

/**
 * Settled cash available for buys in a cash (Islamic, no-margin) account:
 * min(cash, non_marginable_buying_power), ignoring missing values. Never margin buying_power.
 */
export function computeBuyingCapacity(account: { cash: number | null; non_marginable_buying_power: number | null }): number {
  const values = [account.cash, account.non_marginable_buying_power]
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (values.length === 0) return 0
  return Math.max(0, Math.min(...values))
}

export function estimatedBuyCost(order: AlpacaOrderResult): number {
  if (typeof order.notional === 'number' && order.notional > 0) return order.notional
  return order.qty * order.price_at_execution * (1 + WHOLE_SHARE_SLIPPAGE_BUFFER)
}

/**
 * Scale planned buys down proportionally so their total cost fits `capacity`.
 * Notional buys floor to cents; whole-share buys floor to shares. Anything that drops below the
 * minimum becomes skipped ("Insufficient settled buying power"). Non-planned rows pass through.
 */
export function scaleBuysToCapacity(orders: AlpacaOrderResult[], capacity: number): AlpacaOrderResult[] {
  const planned = orders.filter(o => o.action === 'buy' && o.status === 'planned')
  const total = planned.reduce((s, o) => s + estimatedBuyCost(o), 0)
  if (total <= capacity + 1e-9) return orders
  const factor = capacity > 0 ? capacity / total : 0

  return orders.map((o) => {
    if (o.action !== 'buy' || o.status !== 'planned') return o
    if (typeof o.notional === 'number' && o.notional > 0) {
      const notional = floorTo(o.notional * factor, 2)
      if (notional < ALPACA_MIN_NOTIONAL_USD) {
        return { ...o, qty: 0, notional: null, estimated_value: 0, status: 'skipped', error_message: SKIP_REASONS.noBuyingPower }
      }
      const qty = o.price_at_execution > 0 ? floorTo(notional / o.price_at_execution, FRACTIONAL_QTY_DP) : 0
      return { ...o, notional, qty, estimated_value: notional }
    }
    const qty = Math.floor(o.qty * factor + 1e-9)
    if (qty < 1) {
      return { ...o, qty: 0, estimated_value: 0, status: 'skipped', error_message: SKIP_REASONS.noBuyingPower }
    }
    return { ...o, qty, estimated_value: qty * o.price_at_execution }
  })
}

// ── Execution status ─────────────────────────────────────────────────────────

export const TERMINAL_EXECUTION_STATUSES: ExecutionStatus[] = [
  'completed', 'completed_with_errors', 'failed', 'cancelled', 'dry_run_completed',
]

export function isTerminalExecutionStatus(status: ExecutionStatus): boolean {
  return TERMINAL_EXECUTION_STATUSES.includes(status)
}

/**
 * Final execution status from per-order outcomes. Skipped rows are planned outcomes, not errors.
 * - nothing actionable or everything filled → completed
 * - something filled (fully or partly) but not everything → completed_with_errors
 * - nothing filled at all → failed
 */
export function deriveExecutionStatus(orders: AlpacaOrderResult[]): ExecutionStatus {
  const actionable = orders.filter(o => o.status !== 'skipped')
  if (actionable.length === 0) return 'completed'
  if (actionable.every(o => o.status === 'filled')) return 'completed'
  const anyFill = actionable.some(o => o.status === 'filled' || (o.filled_qty ?? 0) > 0)
  return anyFill ? 'completed_with_errors' : 'failed'
}

export function buildEnvelope(
  status: ExecutionStatus,
  orders: AlpacaOrderResult[],
  nowIso: string,
  extra: { error_message?: string | null; wait_until?: string | null; dry_run?: boolean } = {},
): ExecutionEnvelope {
  return {
    version:       2,
    status,
    updated_at:    nowIso,
    error_message: extra.error_message ?? null,
    wait_until:    extra.wait_until ?? null,
    ...(extra.dry_run ? { dry_run: true } : {}),
    orders,
  }
}

/** Dry run: every still-planned order is recorded as "simulated" (never submitted). */
export function markSimulated(orders: AlpacaOrderResult[], nowIso: string): AlpacaOrderResult[] {
  return orders.map(o => (o.status === 'planned' ? { ...o, status: 'simulated' as const, updated_at: nowIso } : o))
}

/** Halt: every not-yet-submitted order becomes skipped with the halt reason. Submitted orders are kept as-is. */
export function haltOrders(orders: AlpacaOrderResult[], reason: string, nowIso: string): AlpacaOrderResult[] {
  return orders.map(o => (o.status === 'planned'
    ? { ...o, qty: 0, notional: null, estimated_value: 0, status: 'skipped' as const, error_message: `Not submitted — ${reason}`, updated_at: nowIso }
    : o))
}

const OrderResultSchema = z.object({
  ticker:             z.string(),
  action:             z.enum(['buy', 'sell']),
  qty:                z.number(),
  price_at_execution: z.number(),
  estimated_value:    z.number(),
  alpaca_order_id:    z.string().nullable(),
  status:             z.enum(['planned', 'submitted', 'partially_filled', 'filled', 'canceled', 'expired', 'rejected', 'error', 'skipped', 'simulated']),
  error_message:      z.string().nullable(),
}).passthrough()

const EnvelopeSchema = z.object({
  version:       z.literal(2),
  status:        z.enum([
    'pending', 'waiting_for_market', 'executing', 'completed', 'completed_with_errors', 'failed',
    'cancelled', 'dry_run_completed',
  ]),
  updated_at:    z.string(),
  error_message: z.string().nullable().optional(),
  wait_until:    z.string().nullable().optional(),
  dry_run:       z.boolean().optional(),
  orders:        z.array(OrderResultSchema),
})

/** Parse whatever is stored in alpaca_executions.orders — a legacy array or a v2 envelope. */
export function parseStoredOrders(stored: unknown): {
  status: ExecutionStatus
  updated_at: string | null
  error_message: string | null
  wait_until: string | null
  dry_run: boolean
  orders: AlpacaOrderResult[]
} {
  if (Array.isArray(stored)) {
    const orders = stored
      .map(o => OrderResultSchema.safeParse(o))
      .filter(r => r.success)
      .map(r => r.data as AlpacaOrderResult)
    // Legacy synchronous executions were finished when the row was written.
    return { status: 'completed', updated_at: null, error_message: null, wait_until: null, dry_run: false, orders }
  }
  const env = EnvelopeSchema.safeParse(stored)
  if (env.success) {
    return {
      status:        env.data.status,
      updated_at:    env.data.updated_at,
      error_message: env.data.error_message ?? null,
      wait_until:    env.data.wait_until ?? null,
      dry_run:       env.data.dry_run === true || env.data.status === 'dry_run_completed',
      orders:        env.data.orders as AlpacaOrderResult[],
    }
  }
  return { status: 'failed', updated_at: null, error_message: 'Unreadable execution record', wait_until: null, dry_run: false, orders: [] }
}

/**
 * True when an existing execution row blocks a new request. Only a finished DRY RUN (nothing was ever submitted)
 * may be replaced; every real execution keeps blocking (409).
 */
export function executionBlocksNewRequest(storedOrders: unknown): boolean {
  return parseStoredOrders(storedOrders).status !== 'dry_run_completed'
}

export function normalizeExecution(row: {
  id: string
  recommendation_id: string
  user_id: string
  executed_at: string
  is_paper: boolean
  orders: unknown
}): NormalizedExecution {
  const parsed = parseStoredOrders(row.orders)
  return {
    id:                row.id,
    recommendation_id: row.recommendation_id,
    user_id:           row.user_id,
    executed_at:       row.executed_at,
    is_paper:          row.is_paper,
    ...parsed,
  }
}

// ── Alpaca inputs (I/O) ──────────────────────────────────────────────────────

export interface TradingCredentials {
  keyId: string
  secret: string
  isPaper: boolean
}

/**
 * Fetch everything planOrders needs from Alpaca for the non-hold items.
 * BUYs blocked by the Shariah guard are not looked up at all. Throws if quotes cannot be fetched.
 */
export async function loadPlanInputs(
  creds: TradingCredentials,
  items: ActionItem[],
  screening: ShariahScreeningResult | null,
  now: Date = new Date(),
  screeningConfig: EffectiveScreeningConfig = FULL_SCREENING_CONFIG,
): Promise<Omit<PlanInput, 'executionId' | 'items' | 'screening' | 'screeningConfig'>> {
  const { keyId, secret, isPaper } = creds
  const relevant = items.filter(i =>
    i.action === 'sell' || (i.action === 'buy' && getBuyBlockReason(i.ticker, screening, screeningConfig) === null))
  const tickers = [...new Set(relevant.map(i => i.ticker))]
  const sellTickers = [...new Set(relevant.filter(i => i.action === 'sell').map(i => i.ticker))]

  const assetEntries = await Promise.all(tickers.map(async (t): Promise<[string, AssetInfo | null]> => {
    try {
      return [t, await fetchAsset(t, keyId, secret, isPaper)]
    } catch {
      return [t, null]
    }
  }))
  const assets = Object.fromEntries(assetEntries)
  const tradable = tickers.filter(t => assets[t]?.tradable)

  const quotes = tradable.length > 0 ? await fetchQuotes(tradable, keyId, secret, isPaper) : {}

  const positionEntries = await Promise.all(sellTickers.map(async (t): Promise<[string, number]> =>
    [t, await fetchPosition(t, keyId, secret, isPaper)]))
  const positions = Object.fromEntries(positionEntries)

  let recentBuys: string[] | null = []
  if (sellTickers.length > 0) {
    try {
      recentBuys = await fetchRecentBuySymbols(
        sellTickers, settlementLookbackStart(now).toISOString(), keyId, secret, isPaper)
    } catch {
      recentBuys = null
    }
  }

  return { assets, quotes, positions, recentBuys }
}

/** Live account inputs for the risk limits: equity, cash and the market value of every position. Throws on failure. */
export async function loadRiskAccount(creds: TradingCredentials): Promise<RiskAccount> {
  const [snapshot, positions] = await Promise.all([
    fetchEquitySnapshot(creds.keyId, creds.secret, creds.isPaper),
    fetchAllPositions(creds.keyId, creds.secret, creds.isPaper),
  ])
  const values: Record<string, number> = {}
  for (const p of positions) {
    const v = parseFloat(p.market_value)
    if (Number.isFinite(v) && v > 0) values[p.symbol] = (values[p.symbol] ?? 0) + v
  }
  return { equity: snapshot.equity ?? 0, cash: snapshot.cash ?? 0, positions: values }
}

export interface RiskCheckedPlan {
  orders: AlpacaOrderResult[]
  adjustments: RiskAdjustment[]
  summary: RiskSummary
}

/**
 * THE shared planner used by the preview route and the execution engine: Alpaca inputs → planOrders (Shariah guard,
 * settlement, sizing) → applyRiskLimits. What the preview shows is exactly what the engine enforces.
 * Throws when Alpaca inputs cannot be loaded.
 */
export async function buildRiskCheckedPlan(
  creds: TradingCredentials,
  params: {
    executionId: string
    items: ActionItem[]
    screening: ShariahScreeningResult | null
    /** Required: the user's CURRENT screening config, loaded at preview / execution time (specs/030). */
    screeningConfig: EffectiveScreeningConfig
    limits: RiskLimits
  },
  now: Date = new Date(),
): Promise<RiskCheckedPlan> {
  const [inputs, account] = await Promise.all([
    loadPlanInputs(creds, params.items, params.screening, now, params.screeningConfig),
    loadRiskAccount(creds),
  ])
  const planned = planOrders({ executionId: params.executionId, items: params.items, screening: params.screening, screeningConfig: params.screeningConfig, ...inputs })
  return applyRiskLimits(
    { orders: planned, items: params.items, forcedSellTickers: forcedSellTickers(params.items, params.screening) },
    account,
    params.limits,
  )
}
