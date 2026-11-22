import type { EffectiveScreeningConfig } from '@/lib/screeningConfig'

export type RatioKey = 'debt' | 'cash_and_securities' | 'receivables'
export type RatioStatus = 'pass' | 'fail' | 'unknown'
export type RatioSource = 'polygon' | 'ai_estimate' | 'unavailable'
export type RatioBasis = 'exact' | 'upper_bound'

/** One AAOIFI ratio for a ticker, as a percentage of market cap. */
export interface ScreeningRatio {
  value_pct: number | null
  status:    RatioStatus
  source:    RatioSource
  basis:     RatioBasis | null
}

export type ReviewerVerdict = 'compliant' | 'non_compliant' | 'uncertain'

export type ScreeningCheckKey = 'stocks_only' | 'business' | 'financial'
export type ScreeningCheckOutcome = 'pass' | 'fail' | 'unknown'

/**
 * One part of the screen for one ticker (specs/030). `applied: false` → the part was disabled for that run: it is
 * recorded for display only and never a failure reason. An applied check is always pass or fail (unknown fails).
 */
export interface ScreeningCheck {
  applied: boolean
  outcome: ScreeningCheckOutcome
  reasons: string[]
}
export type ReviewerConfidence = 'low' | 'medium' | 'high'

/** Final, code-decided screening result for one ticker. */
export interface TickerScreening {
  ticker:                     string
  name:                       string | null
  verdict:                    'compliant' | 'non_compliant'
  /** Every reason the ticker failed; for a compliant ticker, the reviewer's one-line reason. */
  reasons:                    string[]
  security_type:              string | null
  sic_code:                   string | null
  sic_description:            string | null
  reviewer_verdict:           ReviewerVerdict | null
  reviewer_reason:            string | null
  non_permissible_income_pct: number | null
  ratios:                     Record<RatioKey, ScreeningRatio>
  /** Ratio data came from Polygon for every ratio, or the reviewer had to estimate at least one. */
  ratio_source:               'polygon' | 'ai_estimate'
  is_holding:                 boolean
  /** True when the ticker was removed from the allocation (or set to 0% if held). */
  excluded:                   boolean
  screened_at:                string
  /** Per-part results (specs/030). Absent on screenings created before configurable screening. */
  checks?:                    Record<ScreeningCheckKey, ScreeningCheck>
}

export interface ShariahScreeningResult {
  version:     1
  screened_at: string
  tickers:     TickerScreening[]
  excluded:    Array<{ ticker: string; reasons: string[] }>
  /** The effective screening config the run used (specs/030). Absent → legacy: every part applied. */
  config?:     EffectiveScreeningConfig
}

/** Latest reported financials (USD) used for the AAOIFI ratio screen. Any field may be unknown. */
export interface CompanyFinancials {
  period_end:          string | null
  total_liabilities:   number | null
  long_term_debt:      number | null
  current_debt:        number | null
  current_assets:      number | null
  cash:                number | null
  short_term_investments: number | null
  accounts_receivable: number | null
  revenues:            number | null
}
