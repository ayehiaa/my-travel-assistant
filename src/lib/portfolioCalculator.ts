import type { ActionItem, TargetHorizon } from '@/types/database'

export interface HoldingSummary {
  ticker: string
  company_name: string
  total_value_usd: number
  pct_of_portfolio: number
}

export interface PortfolioTotals {
  holdings_usd: number
  cash_usd: number
  grand_total_usd: number
}

/**
 * Given an array of holdings and a cash amount, compute per-holding
 * percentage of the grand total (holdings + cash).
 * If grand_total is 0, all pct_of_portfolio values are 0.
 */
export function computeHoldingSummaries(
  holdings: Array<{ ticker: string; company_name: string; total_value_usd: number }>,
  cash_usd: number
): { summaries: HoldingSummary[]; totals: PortfolioTotals } {
  const holdings_usd = holdings.reduce((sum, h) => sum + h.total_value_usd, 0)
  const grand_total_usd = holdings_usd + cash_usd

  const summaries: HoldingSummary[] = holdings.map(h => ({
    ticker: h.ticker,
    company_name: h.company_name,
    total_value_usd: h.total_value_usd,
    pct_of_portfolio:
      grand_total_usd > 0
        ? Math.round((h.total_value_usd / grand_total_usd) * 10000) / 100
        : 0,
  }))

  return {
    summaries,
    totals: { holdings_usd, cash_usd, grand_total_usd },
  }
}

/**
 * Format a USD number as a locale string: "$12,345.67"
 * Uses en-US locale, minimumFractionDigits: 2, maximumFractionDigits: 2.
 */
export function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export interface PortfolioReturnMetrics {
  weighted_30d_return_pct: number  // value-weighted return over the price data window
  annualized_return_pct:   number  // ×12 approximation
  target_annual_pct:       number  // user target converted to annual terms
  annual_gap_pct:          number  // annualized − target_annual (negative = underperforming)
  data_coverage_pct:       number  // percentage of portfolio value with usable price data
}

/**
 * Computes how the portfolio has actually performed versus the stated target.
 * Uses the first and last close of each holding's price data window (typically 30 days).
 * Pure function — no network calls, safe for Vitest.
 */
export function computePortfolioReturnMetrics(
  holdings: Array<{ ticker: string; total_value_usd: number }>,
  priceData: Record<string, Array<{ close: number }>>,
  target_return_pct: number,
  target_horizon: TargetHorizon,
): PortfolioReturnMetrics {
  const totalValue = holdings.reduce((s, h) => s + h.total_value_usd, 0)
  const target_annual_pct = target_horizon === 'annual' ? target_return_pct : target_return_pct * 12

  if (totalValue === 0) {
    return {
      weighted_30d_return_pct: 0,
      annualized_return_pct:   0,
      target_annual_pct,
      annual_gap_pct:          -target_annual_pct,
      data_coverage_pct:       0,
    }
  }

  let weightedReturnSum = 0
  let coveredValue      = 0

  for (const h of holdings) {
    const candles = priceData[h.ticker]
    if (!candles || candles.length < 2) continue
    const first = candles[0].close
    if (first === 0) continue
    const last   = candles[candles.length - 1].close
    const ret30d = ((last - first) / first) * 100
    weightedReturnSum += ret30d * h.total_value_usd
    coveredValue      += h.total_value_usd
  }

  const weighted_30d_return_pct = coveredValue > 0 ? weightedReturnSum / coveredValue : 0
  const annualized_return_pct   = weighted_30d_return_pct * 12
  const annual_gap_pct          = annualized_return_pct - target_annual_pct
  const data_coverage_pct       = Math.round((coveredValue / totalValue) * 100)

  return {
    weighted_30d_return_pct,
    annualized_return_pct,
    target_annual_pct,
    annual_gap_pct,
    data_coverage_pct,
  }
}

/**
 * Given current holdings, cash, and a target allocation, compute a list of
 * buy/sell/hold actions needed to reach the target allocation.
 * Pure deterministic function — no network calls, safe for Vitest.
 */
export function computeActionList(
  holdings: Array<{ ticker: string; company_name: string; total_value_usd: number }>,
  cash_usd: number,
  targetAllocation: Array<{ ticker: string; target_pct: number }>
): ActionItem[] {
  const grand_total = holdings.reduce((s, h) => s + h.total_value_usd, 0) + cash_usd

  const holdingMap = new Map<string, number>()
  for (const h of holdings) {
    holdingMap.set(h.ticker, h.total_value_usd)
  }

  const allocationMap = new Map<string, number>()
  for (const a of targetAllocation) {
    allocationMap.set(a.ticker, a.target_pct)
  }

  const allTickers = new Set<string>([
    ...holdings.map(h => h.ticker),
    ...targetAllocation.map(a => a.ticker),
  ])

  const actions: ActionItem[] = []
  for (const ticker of allTickers) {
    const current_usd = holdingMap.get(ticker) ?? 0
    const target_pct = allocationMap.get(ticker) ?? 0
    const target_usd = (target_pct / 100) * grand_total
    const delta_usd = target_usd - current_usd
    const action: 'buy' | 'sell' | 'hold' =
      delta_usd > 0 ? 'buy' : delta_usd < 0 ? 'sell' : 'hold'
    const current_pct =
      grand_total > 0 ? Math.round((current_usd / grand_total) * 10000) / 100 : 0

    actions.push({ ticker, action, current_pct, target_pct, current_usd, target_usd, delta_usd })
  }

  return actions
}
