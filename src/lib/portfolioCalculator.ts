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
