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
  // parseFloat — Alpaca positions can be fractional
  const qty = parseFloat(data.qty)
  return Number.isFinite(qty) ? qty : 0
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
      cache: 'no-store',
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

/** The subset of an Alpaca order object the execution engine reads. */
export interface AlpacaOrderSnapshot {
  id: string
  client_order_id: string
  symbol: string
  side: string
  status: string
  qty: string | null
  notional: string | null
  filled_qty: string | null
  filled_avg_price: string | null
  filled_at: string | null
  submitted_at: string | null
  created_at: string | null
  updated_at: string | null
}

function toSnapshot(data: Record<string, unknown>): AlpacaOrderSnapshot {
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : String(v))
  return {
    id:               String(data.id ?? ''),
    client_order_id:  String(data.client_order_id ?? ''),
    symbol:           String(data.symbol ?? ''),
    side:             String(data.side ?? ''),
    status:           String(data.status ?? ''),
    qty:              str(data.qty),
    notional:         str(data.notional),
    filled_qty:       str(data.filled_qty),
    filled_avg_price: str(data.filled_avg_price),
    filled_at:        str(data.filled_at),
    submitted_at:     str(data.submitted_at),
    created_at:       str(data.created_at),
    updated_at:       str(data.updated_at),
  }
}

/** Broker error text is safe to show (no credentials) but is truncated. */
async function readBrokerMessage(response: Response): Promise<string | null> {
  try {
    const body = await response.json() as { message?: unknown }
    return typeof body.message === 'string' ? body.message.slice(0, 200) : null
  } catch {
    return null
  }
}

/**
 * Submit a market DAY order to Alpaca, by share `qty` or by USD `notional` (fractional buys).
 * `client_order_id` makes the submission idempotent at the broker.
 * NEVER throws — always returns the result shape so the caller can record
 * partial failures without aborting the whole execution.
 */
export async function submitOrder(
  params: { symbol: string; side: 'buy' | 'sell'; qty?: number; notional?: number; client_order_id?: string },
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<{
  alpaca_order_id: string | null
  status: 'submitted' | 'rejected' | 'error'
  error_message: string | null
  http_status: number | null
  order: AlpacaOrderSnapshot | null
}> {
  try {
    const base = getAlpacaBaseUrl(isPaper)
    const body: Record<string, string> = {
      symbol:        params.symbol,
      side:          params.side,
      type:          'market',
      time_in_force: 'day',
    }
    if (params.notional !== undefined) body.notional = params.notional.toFixed(2)
    else body.qty = String(params.qty ?? 0)
    if (params.client_order_id) body.client_order_id = params.client_order_id

    const response = await fetch(`${base}/v2/orders`, {
      method: 'POST',
      headers: alpacaHeaders(keyId, secret),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    })

    if (response.status === 200 || response.status === 201) {
      const data = await response.json() as Record<string, unknown>
      const order = toSnapshot(data)
      return { alpaca_order_id: order.id, status: 'submitted', error_message: null, http_status: response.status, order }
    }

    if (response.status >= 400 && response.status < 500) {
      const message = await readBrokerMessage(response)
      return {
        alpaca_order_id: null,
        status: 'rejected',
        error_message: message ? `Order rejected by broker: ${message}` : 'Order rejected by broker',
        http_status: response.status,
        order: null,
      }
    }

    // 5xx or unexpected status
    return { alpaca_order_id: null, status: 'error', error_message: 'Alpaca unreachable', http_status: response.status, order: null }
  } catch {
    return { alpaca_order_id: null, status: 'error', error_message: 'Alpaca unreachable', http_status: null, order: null }
  }
}

/** GET /v2/orders/{id}. Throws on non-2xx. */
export async function fetchOrder(
  orderId: string,
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<AlpacaOrderSnapshot> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(`${base}/v2/orders/${encodeURIComponent(orderId)}`, {
    headers: alpacaHeaders(keyId, secret),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Alpaca order fetch failed: ${response.status}`)
  return toSnapshot(await response.json() as Record<string, unknown>)
}

/** GET /v2/orders:by_client_order_id. Returns null when no such order exists (404). Throws on other errors. */
export async function fetchOrderByClientId(
  clientOrderId: string,
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<AlpacaOrderSnapshot | null> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(
    `${base}/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`,
    { headers: alpacaHeaders(keyId, secret), signal: AbortSignal.timeout(10000), cache: 'no-store' }
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Alpaca order lookup failed: ${response.status}`)
  return toSnapshot(await response.json() as Record<string, unknown>)
}

/** DELETE /v2/orders/{id}. Returns true when the cancel was accepted (204) or the order is already final (422). */
export async function cancelOrder(
  orderId: string,
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<boolean> {
  const base = getAlpacaBaseUrl(isPaper)
  try {
    const response = await fetch(`${base}/v2/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
      headers: alpacaHeaders(keyId, secret),
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    })
    return response.ok || response.status === 422
  } catch {
    return false
  }
}

/** Alpaca market clock. Throws on non-2xx. */
export async function fetchClock(
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<{ timestamp: string; is_open: boolean; next_open: string; next_close: string }> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(`${base}/v2/clock`, {
    headers: alpacaHeaders(keyId, secret),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Alpaca clock fetch failed: ${response.status}`)
  const data = await response.json() as { timestamp: string; is_open: boolean; next_open: string; next_close: string }
  return { timestamp: data.timestamp, is_open: data.is_open === true, next_open: data.next_open, next_close: data.next_close }
}

/**
 * Asset tradability + fractionability. Returns null for any 4xx (unknown symbol); throws on 5xx.
 */
export async function fetchAsset(
  ticker: string,
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<{ tradable: boolean; fractionable: boolean } | null> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(`${base}/v2/assets/${encodeURIComponent(ticker)}`, {
    headers: alpacaHeaders(keyId, secret),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  })
  if (response.status >= 400 && response.status < 500) return null
  if (!response.ok) throw new Error(`Alpaca asset lookup failed: ${response.status}`)
  const data = await response.json() as { status?: string; tradable?: boolean; fractionable?: boolean }
  return {
    tradable:     data.status === 'active' && data.tradable === true,
    fractionable: data.fractionable === true,
  }
}

/**
 * Cash-account buying inputs. Never returns margin buying_power.
 * Throws on non-2xx.
 */
export async function fetchBuyingInputs(
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<{ cash: number | null; non_marginable_buying_power: number | null; equity: number | null }> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(`${base}/v2/account`, {
    headers: alpacaHeaders(keyId, secret),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Alpaca account fetch failed: ${response.status}`)
  const data = await response.json() as { cash?: string; non_marginable_buying_power?: string; equity?: string }
  return {
    cash:                        parseOptionalNum(data.cash),
    non_marginable_buying_power: parseOptionalNum(data.non_marginable_buying_power),
    equity:                      parseOptionalNum(data.equity),
  }
}

function parseOptionalNum(v: string | number | null | undefined): number | null {
  if (v === undefined || v === null) return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Equity snapshot for the loss stops and risk limits: equity, last_equity (previous close) and cash.
 * Missing / unparseable values are null. Throws on non-2xx.
 */
export async function fetchEquitySnapshot(
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<{ equity: number | null; last_equity: number | null; cash: number | null }> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(`${base}/v2/account`, {
    headers: alpacaHeaders(keyId, secret),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Alpaca account fetch failed: ${response.status}`)
  const data = await response.json() as { equity?: string; last_equity?: string; cash?: string }
  return {
    equity:      parseOptionalNum(data.equity),
    last_equity: parseOptionalNum(data.last_equity),
    cash:        parseOptionalNum(data.cash),
  }
}

/**
 * Daily equity points for the last week (GET /v2/account/portfolio/history?period=1W&timeframe=1D).
 * Throws on non-2xx.
 */
export async function fetchWeeklyEquityHistory(
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<Array<number | null>> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(`${base}/v2/account/portfolio/history?period=1W&timeframe=1D`, {
    headers: alpacaHeaders(keyId, secret),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Alpaca portfolio history fetch failed: ${response.status}`)
  const data = await response.json() as { equity?: Array<number | string | null> }
  return Array.isArray(data.equity) ? data.equity.map(v => parseOptionalNum(v)) : []
}

/**
 * Kill switch: cancel EVERY open order on the account (DELETE /v2/orders).
 * Returns true when Alpaca accepted the request (207 multi-status counts as accepted). Never throws.
 */
export async function cancelAllOpenOrders(
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<boolean> {
  const base = getAlpacaBaseUrl(isPaper)
  try {
    const response = await fetch(`${base}/v2/orders`, {
      method: 'DELETE',
      headers: alpacaHeaders(keyId, secret),
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Symbols (from `symbols`) the account BOUGHT since `afterIso` — any buy order that filled (fully or partly)
 * or is still working. Used to avoid good-faith violations (selling before the purchase has settled).
 * Throws on non-2xx so the caller can decide (the engine treats a failure as "skip the sells").
 */
export async function fetchRecentBuySymbols(
  symbols: string[],
  afterIso: string,
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<string[]> {
  if (symbols.length === 0) return []
  const base = getAlpacaBaseUrl(isPaper)
  const params = new URLSearchParams({
    status:    'all',
    after:     afterIso,
    symbols:   symbols.join(','),
    limit:     '500',
    direction: 'desc',
  })
  const response = await fetch(`${base}/v2/orders?${params.toString()}`, {
    headers: alpacaHeaders(keyId, secret),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Alpaca orders list failed: ${response.status}`)
  const data = await response.json() as Array<{ symbol?: string; side?: string; status?: string; filled_qty?: string }>
  const bought = new Set<string>()
  for (const o of data) {
    if (o.side !== 'buy' || !o.symbol) continue
    const filled = parseFloat(o.filled_qty ?? '0')
    const dead = o.status === 'canceled' || o.status === 'expired' || o.status === 'rejected'
    if ((Number.isFinite(filled) && filled > 0) || !dead) bought.add(o.symbol)
  }
  return [...bought]
}

/**
 * Fetch the account summary (cash, equity) from Alpaca.
 * Throws on non-2xx so the caller can surface an error.
 */
export async function fetchAccount(
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<{ cash: number; equity: number }> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(`${base}/v2/account`, {
    headers: alpacaHeaders(keyId, secret),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Alpaca account fetch failed: ${response.status}`)
  }

  const data = await response.json() as { cash: string; equity: string }
  return { cash: parseFloat(data.cash), equity: parseFloat(data.equity) }
}

/**
 * Look up display names for a set of symbols via Alpaca's assets endpoint.
 * Never throws — a symbol whose lookup fails is simply missing from the map.
 */
export async function fetchAssetNames(
  symbols: string[],
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<Record<string, string>> {
  const base = getAlpacaBaseUrl(isPaper)
  const entries = await Promise.all(
    symbols.map(async (symbol): Promise<[string, string] | null> => {
      try {
        const response = await fetch(`${base}/v2/assets/${encodeURIComponent(symbol)}`, {
          headers: alpacaHeaders(keyId, secret),
          signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) return null
        const data = await response.json() as { name?: string }
        return data.name ? [symbol, data.name] : null
      } catch {
        return null
      }
    })
  )
  return Object.fromEntries(entries.filter((e): e is [string, string] => e !== null))
}

/** Account configuration that disables short selling and margin (cash account behaviour). */
export const SAFE_ACCOUNT_CONFIGURATION = {
  no_shorting:           true,
  max_margin_multiplier: '1',
} as const

/**
 * Apply SAFE_ACCOUNT_CONFIGURATION via PATCH /v2/account/configurations.
 * Returns the resulting settings. Throws on non-2xx (message carries only the status code).
 */
export async function applyAccountSafeguards(
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<{ no_shorting: boolean; max_margin_multiplier: string }> {
  const base = getAlpacaBaseUrl(isPaper)
  const response = await fetch(`${base}/v2/account/configurations`, {
    method: 'PATCH',
    headers: alpacaHeaders(keyId, secret),
    body: JSON.stringify(SAFE_ACCOUNT_CONFIGURATION),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Alpaca account configuration update failed: ${response.status}`)
  }

  const data = await response.json() as { no_shorting?: boolean; max_margin_multiplier?: string }
  return {
    no_shorting:           data.no_shorting === true,
    max_margin_multiplier: String(data.max_margin_multiplier ?? ''),
  }
}
