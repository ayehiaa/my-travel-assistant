export function getAlpacaBaseUrl(isPaper: boolean): string {
  return isPaper
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets'
}

// Market data always goes through data.alpaca.markets regardless of paper/live
const ALPACA_DATA_URL = 'https://data.alpaca.markets'

function alpacaHeaders(keyId: string, secret: string): Record<string, string> {
  return {
    'APCA-API-KEY-ID': keyId,
    'APCA-API-SECRET-KEY': secret,
    'Content-Type': 'application/json',
  }
}

/**
 * Fetch latest ask prices for multiple tickers in a single call.
 * Returns a map of ticker → ask price.
 * Throws on non-2xx so the caller can return 502.
 */
export async function fetchQuotes(
  tickers: string[],
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<Record<string, number>> {
  const symbols = tickers.join(',')
  const response = await fetch(
    `${ALPACA_DATA_URL}/v2/stocks/quotes/latest?symbols=${encodeURIComponent(symbols)}`,
    { headers: alpacaHeaders(keyId, secret) }
  )

  if (!response.ok) {
    throw new Error(`Alpaca quotes fetch failed: ${response.status}`)
  }

  const data = await response.json() as { quotes: Record<string, { ap: number }> }
  const result: Record<string, number> = {}
  for (const ticker of tickers) {
    result[ticker] = data.quotes[ticker]?.ap ?? 0
  }
  return result
}

/**
 * Fetch the quantity held for a single ticker position.
 * Returns 0 when the ticker is not held (404 from Alpaca).
 * Throws on other non-2xx errors.
 */
export async function fetchPosition(
  ticker: string,
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<number> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(
    `${base}/v2/positions/${encodeURIComponent(ticker)}`,
    { headers: alpacaHeaders(keyId, secret) }
  )

  if (response.status === 404) return 0

  if (!response.ok) {
    throw new Error(`Alpaca position fetch failed: ${response.status}`)
  }

  const data = await response.json() as { qty: string }
  return parseInt(data.qty, 10)
}

/**
 * Fetch all open positions from Alpaca.
 * Returns an array of positions with symbol, qty (decimal string), and market_value (decimal string).
 * Throws on non-2xx so the caller can handle the error.
 * Uses parseFloat — not parseInt — because Alpaca supports fractional shares.
 */
export async function fetchAllPositions(
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<Array<{ symbol: string; qty: string; market_value: string }>> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(
    `${base}/v2/positions`,
    {
      headers: alpacaHeaders(keyId, secret),
      signal: AbortSignal.timeout(5000),
    }
  )

  if (!response.ok) {
    throw new Error(`Alpaca positions fetch failed: ${response.status}`)
  }

  const data = await response.json() as Array<{ symbol: string; qty: string; market_value: string }>
  return data
}

/**
 * Check whether a ticker is a tradeable asset on Alpaca.
 * Returns true if the asset exists, is active, and is tradeable.
 * Returns false for any 4xx (not found, not tradeable) — throws on 5xx.
 */
export async function isTradeableAsset(
  ticker: string,
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<boolean> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(
    `${base}/v2/assets/${encodeURIComponent(ticker)}`,
    { headers: alpacaHeaders(keyId, secret) }
  )

  if (response.status === 404) return false
  if (response.status >= 400 && response.status < 500) return false
  if (!response.ok) throw new Error(`Alpaca asset lookup failed: ${response.status}`)

  const data = await response.json() as { status: string; tradable: boolean }
  return data.status === 'active' && data.tradable === true
}

/**
 * Submit a market order to Alpaca.
 * NEVER throws — always returns the result shape so the caller can record
 * partial failures without aborting the whole execution.
 */
export async function submitOrder(
  params: { symbol: string; qty: number; side: 'buy' | 'sell' },
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<{
  alpaca_order_id: string | null
  status: 'submitted' | 'rejected' | 'error'
  error_message: string | null
}> {
  try {
    const base = getAlpacaBaseUrl(isPaper)
    const response = await fetch(`${base}/v2/orders`, {
      method: 'POST',
      headers: alpacaHeaders(keyId, secret),
      body: JSON.stringify({
        symbol: params.symbol,
        qty: String(params.qty),
        side: params.side,
        type: 'market',
        time_in_force: 'day',
      }),
    })

    if (response.status === 200 || response.status === 201) {
      const data = await response.json() as { id: string }
      return {
        alpaca_order_id: data.id,
        status: 'submitted',
        error_message: null,
      }
    }

    if (response.status >= 400 && response.status < 500) {
      return {
        alpaca_order_id: null,
        status: 'rejected',
        error_message: 'Order rejected by broker',
      }
    }

    // 5xx or unexpected status
    return {
      alpaca_order_id: null,
      status: 'error',
      error_message: 'Alpaca unreachable',
    }
  } catch {
    return {
      alpaca_order_id: null,
      status: 'error',
      error_message: 'Alpaca unreachable',
    }
  }
}
