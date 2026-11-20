import type { CompanyFinancials } from '@/types/shariah'

export interface Candle {
  date:   string
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

export type PriceHistory = Record<string, Candle[]>

interface PolygonAggResponse {
  results?: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>
}

const MAX_TICKERS = 50

export async function fetchPriceHistory(tickers: string[]): Promise<PriceHistory> {
  if (tickers.length === 0) return {}
  if (!process.env.POLYGON_API_KEY) return {}

  const capped = tickers.slice(0, MAX_TICKERS)

  const key  = process.env.POLYGON_API_KEY
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const to   = new Date().toISOString().split('T')[0]

  const result: PriceHistory = {}

  for (let i = 0; i < capped.length; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, 200))
    }

    const ticker = capped[i]
    const url =
      `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}` +
      `?adjusted=true&sort=asc&limit=30&apiKey=${key}`

    try {
      const res = await fetch(url)
      if (!res.ok) {
        result[ticker] = []
        continue
      }

      const json = await res.json() as PolygonAggResponse
      result[ticker] = (json.results ?? []).map(bar => ({
        date:   new Date(bar.t).toISOString().split('T')[0],
        open:   bar.o,
        high:   bar.h,
        low:    bar.l,
        close:  bar.c,
        volume: bar.v,
      }))
    } catch {
      // IMPORTANT: Do not log `url` or error here — the URL contains POLYGON_API_KEY in plaintext.
      result[ticker] = []
    }
  }

  return result
}

export interface TickerDetail {
  ticker:           string
  name:             string
  sic_description:  string | null
  primary_exchange: string | null
  /** Polygon security type, e.g. "CS" (common stock), "ETF", "PFD", "ADRC". */
  type:             string | null
  sic_code:         string | null
  market_cap:       number | null
}

export type TickerDetailsMap = Record<string, TickerDetail>

interface PolygonTickerDetailResponse {
  results?: {
    ticker:           string
    name:             string
    sic_description?: string | null
    primary_exchange?: string | null
    type?:            string | null
    sic_code?:        string | null
    market_cap?:      number | null
  }
}

function emptyDetail(ticker: string): TickerDetail {
  return { ticker, name: ticker, sic_description: null, primary_exchange: null, type: null, sic_code: null, market_cap: null }
}

/** Map a Polygon ticker-details payload to a TickerDetail. Pure; exported for tests. */
export function parseTickerDetail(ticker: string, json: PolygonTickerDetailResponse | null | undefined): TickerDetail {
  const r = json?.results
  if (!r) return emptyDetail(ticker)
  return {
    ticker:           r.ticker ?? ticker,
    name:             r.name ?? ticker,
    sic_description:  r.sic_description ?? null,
    primary_exchange: r.primary_exchange ?? null,
    type:             typeof r.type === 'string' ? r.type : null,
    sic_code:         r.sic_code != null ? String(r.sic_code) : null,
    market_cap:       typeof r.market_cap === 'number' && Number.isFinite(r.market_cap) ? r.market_cap : null,
  }
}

/**
 * Confirms which tickers actually exist in Polygon's reference database.
 * Returns a Set of tickers that got a valid 200 response with results.
 * Tickers absent from the returned Set should be treated as invalid/unrecognised.
 * Falls back to treating all tickers as valid when POLYGON_API_KEY is absent.
 */
export async function checkTickersExist(tickers: string[]): Promise<Set<string>> {
  if (tickers.length === 0) return new Set()
  if (!process.env.POLYGON_API_KEY) return new Set(tickers)

  const key    = process.env.POLYGON_API_KEY
  const valid  = new Set<string>()

  for (let i = 0; i < tickers.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 200))

    const ticker = tickers[i]
    const url    = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${key}`

    try {
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json() as PolygonTickerDetailResponse
        if (json.results) valid.add(ticker)
      }
    } catch {
      // IMPORTANT: Do not log `url` or error here — the URL contains POLYGON_API_KEY in plaintext.
    }
  }

  return valid
}

export async function fetchTickerDetails(tickers: string[]): Promise<TickerDetailsMap> {
  if (tickers.length === 0) return {}
  if (!process.env.POLYGON_API_KEY) return {}

  const key    = process.env.POLYGON_API_KEY
  const result: TickerDetailsMap = {}

  for (let i = 0; i < tickers.length; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, 200))
    }

    const ticker = tickers[i]
    const url =
      `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}` +
      `?apiKey=${key}`

    try {
      const res = await fetch(url)
      if (!res.ok) {
        result[ticker] = emptyDetail(ticker)
        continue
      }

      const json = await res.json() as PolygonTickerDetailResponse
      result[ticker] = parseTickerDetail(ticker, json)
    } catch {
      // IMPORTANT: Do not log `url` or error here — the URL contains POLYGON_API_KEY in plaintext.
      result[ticker] = emptyDetail(ticker)
    }
  }

  return result
}

// ── Financials (AAOIFI ratio screen) ─────────────────────────────────────────

type PolygonFinancialSection = Record<string, { value?: unknown } | undefined>

interface PolygonFinancialsResponse {
  results?: Array<{
    end_date?: string
    financials?: {
      balance_sheet?:    PolygonFinancialSection
      income_statement?: PolygonFinancialSection
    }
  }>
}

function pick(section: PolygonFinancialSection | undefined, keys: string[]): number | null {
  if (!section) return null
  for (const key of keys) {
    const v = section[key]?.value
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

/** Map Polygon's /vX/reference/financials payload to CompanyFinancials. Pure; exported for tests. */
export function parseFinancialsResponse(json: PolygonFinancialsResponse | null | undefined): CompanyFinancials | null {
  const latest = json?.results?.[0]
  const bs = latest?.financials?.balance_sheet
  const is = latest?.financials?.income_statement
  if (!bs && !is) return null
  return {
    period_end:             latest?.end_date ?? null,
    total_liabilities:      pick(bs, ['liabilities']),
    long_term_debt:         pick(bs, ['long_term_debt', 'noncurrent_debt', 'long_term_debt_noncurrent']),
    current_debt:           pick(bs, ['current_debt', 'short_term_debt', 'long_term_debt_current', 'short_term_borrowings']),
    current_assets:         pick(bs, ['current_assets']),
    cash:                   pick(bs, ['cash', 'cash_and_cash_equivalents', 'cash_and_equivalents']),
    short_term_investments: pick(bs, ['short_term_investments', 'marketable_securities_current']),
    accounts_receivable:    pick(bs, ['accounts_receivable', 'accounts_receivable_net', 'receivables']),
    revenues:               pick(is, ['revenues', 'revenue']),
  }
}

export type FinancialsMap = Record<string, CompanyFinancials | null>

/**
 * Fetch the latest reported financials for each ticker. Never throws: a ticker whose financials are
 * unavailable (plan tier, 4xx/5xx, no filings) maps to null. Returns {} without POLYGON_API_KEY.
 */
export async function fetchLatestFinancials(tickers: string[]): Promise<FinancialsMap> {
  if (tickers.length === 0) return {}
  if (!process.env.POLYGON_API_KEY) return {}

  const key    = process.env.POLYGON_API_KEY
  const result: FinancialsMap = {}

  for (let i = 0; i < tickers.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 200))

    const ticker = tickers[i]
    const url =
      `https://api.polygon.io/vX/reference/financials?ticker=${encodeURIComponent(ticker)}` +
      `&limit=1&order=desc&sort=filing_date&apiKey=${key}`

    try {
      const res = await fetch(url)
      if (!res.ok) {
        result[ticker] = null
        continue
      }
      result[ticker] = parseFinancialsResponse(await res.json() as PolygonFinancialsResponse)
    } catch {
      // IMPORTANT: Do not log `url` or error here — the URL contains POLYGON_API_KEY in plaintext.
      result[ticker] = null
    }
  }

  return result
}
