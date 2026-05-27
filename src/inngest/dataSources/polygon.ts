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
