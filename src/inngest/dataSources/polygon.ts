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
}

export type TickerDetailsMap = Record<string, TickerDetail>

interface PolygonTickerDetailResponse {
  results?: {
    ticker:           string
    name:             string
    sic_description:  string | null
    primary_exchange: string | null
  }
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
        result[ticker] = { ticker, name: ticker, sic_description: null, primary_exchange: null }
        continue
      }

      const json = await res.json() as PolygonTickerDetailResponse
      if (!json.results) {
        result[ticker] = { ticker, name: ticker, sic_description: null, primary_exchange: null }
        continue
      }

      result[ticker] = {
        ticker:           json.results.ticker,
        name:             json.results.name,
        sic_description:  json.results.sic_description ?? null,
        primary_exchange: json.results.primary_exchange ?? null,
      }
    } catch {
      // IMPORTANT: Do not log `url` or error here — the URL contains POLYGON_API_KEY in plaintext.
      result[ticker] = { ticker, name: ticker, sic_description: null, primary_exchange: null }
    }
  }

  return result
}
