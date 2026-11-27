import { z } from 'zod'
import type { TargetHorizon } from '@/types/database'

/**
 * Real account return vs the user's target (specs/031). Pure functions — no network, safe for Vitest.
 *
 * Source: Alpaca GET /v2/account/portfolio/history (period 3M, timeframe 1D), fetched inside the analysis step.
 *
 * Return method (time-weighted, deposits / withdrawals excluded), in order of preference:
 *  0. `cash_flows` — daily equity change minus the account's actual deposits / withdrawals (Alpaca activities
 *     CSD/CSW/JNLC). Independent of how Alpaca defines its P/L baseline, and matches the account value the user sees.
 *  1. `profit_loss` — cumulative P/L in USD (excludes deposits / withdrawals). Daily returns are chained from the
 *     first FUNDED point: r_i = (pl_i − pl_{i−1}) / equity_{i−1}; window return = Π(1 + r_i) − 1. Preferred because
 *     Alpaca's `profit_loss_pct` is measured against the period's base value, which is wrong for an account funded
 *     part-way through the period (base 0). The hub's Performance card uses the same function, so the UI and AI agree.
 *  2. `profit_loss_pct` — Alpaca's cumulative return per point (fraction). The window return between points a and b
 *     is (1 + c_b) / (1 + c_a) − 1.
 *  3. `equity` only — last / first − 1. NOT deposit-adjusted; flagged as such (only when Alpaca sends no P/L data).
 *
 * Window: from the later of (the user's first complete recommendation = programme start, today − 3 months) to the
 * latest point. Fewer than MIN_HISTORY_DAYS calendar days → "insufficient_history". No complete recommendation yet →
 * "insufficient_history" (the programme has not started; there is nothing to measure against the target).
 *
 * Comparison: with ≥ ANNUALISE_MIN_DAYS days the period return is annualised by compounding, (1 + r)^(365/days) − 1,
 * and compared to the annual target. With fewer days the period return is compared to the target prorated by
 * compounding, (1 + annual)^(days/365) − 1 (annualising a short window is too noisy).
 * Monthly targets convert to annual by compounding: (1 + m)^12 − 1 (the old code used m × 12).
 */

export const MIN_HISTORY_DAYS = 21
export const ANNUALISE_MIN_DAYS = 60
export const RETURN_WINDOW_MONTHS = 3
const DAY_SECONDS = 86_400
const DAYS_PER_YEAR = 365

export type ReturnMethod = 'cash_flows' | 'profit_loss_pct' | 'profit_loss' | 'equity'
export type ReturnWindow = 'programme_start' | 'three_months'

export interface PortfolioHistoryInput {
  /** Unix seconds per point. */
  timestamp: number[]
  equity: Array<number | null>
  profit_loss?: Array<number | null>
  profit_loss_pct?: Array<number | null>
  /**
   * External deposits (+) / withdrawals (−) by date (YYYY-MM-DD, New York), from Alpaca account activities. When
   * present (even empty) the return is computed from equity adjusted for these flows — the most reliable method.
   */
  cash_flows?: Array<{ date: string; amount: number }>
}

/** Trading date of a history point (Alpaca timestamps are US market time). */
function nyDate(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

// ── Target conversion ───────────────────────────────────────────────────────

/** The user's target as an annual percentage, compounded for monthly targets: (1 + m)^12 − 1. */
export function targetAnnualPct(targetPct: number, horizon: TargetHorizon): number {
  if (!Number.isFinite(targetPct)) return 0
  if (horizon === 'monthly') return (Math.pow(1 + targetPct / 100, 12) - 1) * 100
  return targetPct
}

/** Annual target compounded down to `days`: (1 + annual)^(days/365) − 1, in percent. */
export function proratedAnnualPct(annualPct: number, days: number): number {
  if (!Number.isFinite(annualPct) || !Number.isFinite(days) || days <= 0) return 0
  return (Math.pow(1 + annualPct / 100, days / DAYS_PER_YEAR) - 1) * 100
}

/** Period return compounded up to a year: (1 + r)^(365/days) − 1, in percent. */
export function annualisePct(periodPct: number, days: number): number {
  if (!Number.isFinite(periodPct) || !Number.isFinite(days) || days <= 0) return 0
  const base = 1 + periodPct / 100
  if (base <= 0) return -100
  return (Math.pow(base, DAYS_PER_YEAR / days) - 1) * 100
}

// ── Window ──────────────────────────────────────────────────────────────────

/**
 * Start of the measurement window: the later of programme start and now − 3 months (i.e. the SHORTER window).
 * Null when there is no programme start yet.
 */
export function chooseReturnWindow(
  now: Date,
  programmeStart: Date | null,
): { start: Date; window: ReturnWindow } | null {
  if (!programmeStart || Number.isNaN(programmeStart.getTime())) return null
  const threeMonthsAgo = new Date(now.getTime())
  threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - RETURN_WINDOW_MONTHS)
  return programmeStart.getTime() > threeMonthsAgo.getTime()
    ? { start: programmeStart, window: 'programme_start' }
    : { start: threeMonthsAgo, window: 'three_months' }
}

// ── Time-weighted return ────────────────────────────────────────────────────

export interface TwrResult {
  start_ts: number
  end_ts: number
  days: number
  period_return_pct: number
  method: ReturnMethod
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Time-weighted return over the points at or after `startSec` (points with no positive equity — e.g. before the
 * account was funded — are ignored). Null with fewer than two usable points. Pure.
 */
export function computeTimeWeightedReturn(history: PortfolioHistoryInput, startSec: number): TwrResult | null {
  const idx: number[] = []
  for (let i = 0; i < history.timestamp.length; i++) {
    const ts = history.timestamp[i]
    const eq = history.equity[i]
    if (isNum(ts) && ts >= startSec && isNum(eq) && eq > 0) idx.push(i)
  }
  if (idx.length < 2) return null
  const first = idx[0]
  const last = idx[idx.length - 1]
  const start_ts = history.timestamp[first]
  const end_ts = history.timestamp[last]
  const days = (end_ts - start_ts) / DAY_SECONDS

  // 0. Equity adjusted for actual deposits / withdrawals: r_k = (equity_k − flows in (t_{k−1}, t_k]) / equity_{k−1} − 1
  if (history.cash_flows) {
    let growth = 1
    for (let k = 1; k < idx.length; k++) {
      const prevDate = nyDate(history.timestamp[idx[k - 1]])
      const date = nyDate(history.timestamp[idx[k]])
      const flow = history.cash_flows.reduce((sum, f) => (f.date > prevDate && f.date <= date ? sum + f.amount : sum), 0)
      growth *= ((history.equity[idx[k]] as number) - flow) / (history.equity[idx[k - 1]] as number)
    }
    return { start_ts, end_ts, days, period_return_pct: (growth - 1) * 100, method: 'cash_flows' }
  }

  // 1. Chain daily returns from cumulative P/L and the previous point's equity
  const pl = history.profit_loss ?? []
  if (idx.every(i => isNum(pl[i]))) {
    let growth = 1
    for (let k = 1; k < idx.length; k++) {
      const prevEq = history.equity[idx[k - 1]] as number
      const dayPl = (pl[idx[k]] as number) - (pl[idx[k - 1]] as number)
      growth *= 1 + dayPl / prevEq
    }
    return { start_ts, end_ts, days, period_return_pct: (growth - 1) * 100, method: 'profit_loss' }
  }

  // 2. Cumulative cash-flow-adjusted percentage
  const pct = history.profit_loss_pct ?? []
  const cFirst = pct[first]
  const cLast = pct[last]
  if (isNum(cFirst) && isNum(cLast) && 1 + cFirst > 0) {
    return { start_ts, end_ts, days, period_return_pct: ((1 + cLast) / (1 + cFirst) - 1) * 100, method: 'profit_loss_pct' }
  }

  // 3. Equity only (not deposit-adjusted)
  const eFirst = history.equity[first] as number
  const eLast = history.equity[last] as number
  return { start_ts, end_ts, days, period_return_pct: (eLast / eFirst - 1) * 100, method: 'equity' }
}

// ── Verdict ─────────────────────────────────────────────────────────────────

export interface RealReturnMetrics {
  version: 1
  status: 'ok' | 'insufficient_history' | 'unavailable'
  /** Why the status is not ok (plain English); null when ok. */
  reason: string | null
  window: ReturnWindow | null
  /** YYYY-MM-DD (UTC) of the first / last point used. */
  start_date: string | null
  end_date: string | null
  /** Calendar days between the first and last point used (1 decimal). */
  days: number
  method: ReturnMethod | null
  period_return_pct: number | null
  /** Only when days ≥ ANNUALISE_MIN_DAYS. */
  annualised_return_pct: number | null
  /** 'annualised' → gap = annualised − annual target; 'period' → gap = period return − prorated target. */
  basis: 'annualised' | 'period' | null
  target_pct: number
  target_horizon: TargetHorizon
  target_annual_pct: number
  /** Annual target prorated to the window (basis 'period'). */
  target_period_pct: number | null
  /** Positive = ahead of target, percentage points. */
  gap_pct: number | null
}

function isoDate(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10)
}

export interface BuildRealReturnInput {
  history: PortfolioHistoryInput | null
  now: Date
  /** run_at of the user's first complete recommendation; null when there is none yet. */
  programmeStart: Date | null
  targetPct: number
  horizon: TargetHorizon
  /** Set when the history could not be fetched. */
  unavailableReason?: string | null
}

/** Real return vs target for the synthesizer and the Rebalance tab. Pure. */
export function buildRealReturnMetrics(input: BuildRealReturnInput): RealReturnMetrics {
  const target_annual_pct = targetAnnualPct(input.targetPct, input.horizon)
  const base: RealReturnMetrics = {
    version: 1,
    status: 'insufficient_history',
    reason: null,
    window: null,
    start_date: null,
    end_date: null,
    days: 0,
    method: null,
    period_return_pct: null,
    annualised_return_pct: null,
    basis: null,
    target_pct: input.targetPct,
    target_horizon: input.horizon,
    target_annual_pct,
    target_period_pct: null,
    gap_pct: null,
  }

  const win = chooseReturnWindow(input.now, input.programmeStart)
  if (!win) return { ...base, reason: 'No completed recommendation yet — the programme has not started.' }
  if (input.unavailableReason || !input.history) {
    return { ...base, status: 'unavailable', window: win.window, reason: input.unavailableReason ?? 'Account history unavailable.' }
  }

  const twr = computeTimeWeightedReturn(input.history, Math.floor(win.start.getTime() / 1000))
  if (!twr) {
    return { ...base, window: win.window, reason: `Fewer than ${MIN_HISTORY_DAYS} days of account history.` }
  }
  const days = Math.round(twr.days * 10) / 10
  const windowFields = {
    window: win.window,
    start_date: isoDate(twr.start_ts),
    end_date: isoDate(twr.end_ts),
    days,
    method: twr.method,
  }
  if (twr.days < MIN_HISTORY_DAYS) {
    return { ...base, ...windowFields, reason: `Only ${Math.floor(twr.days)} days of account history (minimum ${MIN_HISTORY_DAYS}).` }
  }

  const period = twr.period_return_pct
  if (twr.days >= ANNUALISE_MIN_DAYS) {
    const annualised = annualisePct(period, twr.days)
    return {
      ...base, ...windowFields, status: 'ok',
      period_return_pct: period, annualised_return_pct: annualised, basis: 'annualised',
      gap_pct: annualised - target_annual_pct,
    }
  }
  const prorated = proratedAnnualPct(target_annual_pct, twr.days)
  return {
    ...base, ...windowFields, status: 'ok',
    period_return_pct: period, basis: 'period', target_period_pct: prorated,
    gap_pct: period - prorated,
  }
}

// ── Per-holding momentum (input only — NOT the target verdict) ───────────────

export interface HoldingMomentum {
  ticker: string
  /** First-to-last close change over the price window (typically 30 days), percent. */
  return_pct: number
  /** Share of current holdings value, percent. */
  weight_pct: number
}

/**
 * Recent price change of each CURRENT holding (from the Polygon price window). Used by the synthesizer to see which
 * positions are weak / strong; it ignores cash, sold positions and timing, so it is never the target verdict. Pure.
 */
export function computeHoldingMomentum(
  holdings: Array<{ ticker: string; total_value_usd: number }>,
  priceData: Record<string, Array<{ close: number }>>,
): { rows: HoldingMomentum[]; coverage_pct: number } {
  const total = holdings.reduce((s, h) => s + (h.total_value_usd > 0 ? h.total_value_usd : 0), 0)
  const rows: HoldingMomentum[] = []
  let covered = 0
  for (const h of holdings) {
    const candles = priceData[h.ticker]
    if (!candles || candles.length < 2) continue
    const first = candles[0].close
    const last = candles[candles.length - 1].close
    if (!(first > 0) || !Number.isFinite(last)) continue
    rows.push({
      ticker: h.ticker,
      return_pct: (last / first - 1) * 100,
      weight_pct: total > 0 ? (h.total_value_usd / total) * 100 : 0,
    })
    covered += Math.max(0, h.total_value_usd)
  }
  rows.sort((a, b) => b.return_pct - a.return_pct)
  return { rows, coverage_pct: total > 0 ? Math.round((covered / total) * 100) : 0 }
}

// ── Stored on the recommendation (agent_outputs.return_metrics — no migration) ──────────────────────────────

const RealReturnMetricsSchema = z.object({
  version: z.literal(1),
  status: z.enum(['ok', 'insufficient_history', 'unavailable']),
  reason: z.string().nullable(),
  window: z.enum(['programme_start', 'three_months']).nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  days: z.number(),
  method: z.enum(['cash_flows', 'profit_loss_pct', 'profit_loss', 'equity']).nullable(),
  period_return_pct: z.number().nullable(),
  annualised_return_pct: z.number().nullable(),
  basis: z.enum(['annualised', 'period']).nullable(),
  target_pct: z.number(),
  target_horizon: z.enum(['annual', 'monthly']),
  target_annual_pct: z.number(),
  target_period_pct: z.number().nullable(),
  gap_pct: z.number().nullable(),
})

/** The real-return metrics the synthesizer saw for this recommendation; null for older recommendations. Pure. */
export function readReturnMetrics(rec: { agent_outputs?: unknown } | null | undefined): RealReturnMetrics | null {
  const outputs = rec?.agent_outputs
  if (!outputs || typeof outputs !== 'object') return null
  const parsed = RealReturnMetricsSchema.safeParse((outputs as Record<string, unknown>).return_metrics)
  return parsed.success ? parsed.data : null
}

/** Short label for the comparison target, e.g. "10.00% a year" or "1.62% over 45 days (prorated from 10.00% a year)". */
export function describeTarget(m: RealReturnMetrics): string {
  const annual = `${m.target_annual_pct.toFixed(2)}% a year`
  if (m.basis === 'period' && m.target_period_pct !== null) {
    return `${m.target_period_pct.toFixed(2)}% over ${Math.round(m.days)} days (prorated from ${annual})`
  }
  return annual
}
