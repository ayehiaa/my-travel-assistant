import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential } from '@/lib/alpacaCrypto'
import { fetchAllPositions } from '@/lib/alpacaClient'

interface AlpacaPosition {
  asset_id: string
  symbol: string
  exchange: string
  asset_class: string
  avg_entry_price: string
  qty: string
  qty_available: string
  side: 'long' | 'short'
  market_value: string
  cost_basis: string
  unrealized_pl: string
  unrealized_plpc: string
  unrealized_intraday_pl: string
  unrealized_intraday_plpc: string
  current_price: string
  lastday_price: string
  change_today: string
}

async function lookupCompanyName(ticker: string): Promise<string> {
  const key = process.env.POLYGON_API_KEY
  if (!key) return ticker

  try {
    const res = await fetch(
      `https://api.polygon.io/v3/reference/tickers?ticker=${encodeURIComponent(ticker)}&active=true&market=stocks&limit=1&apiKey=${key}`
    )
    if (!res.ok) return ticker
    const json = await res.json() as { results?: Array<{ name: string }> }
    return json.results?.[0]?.name ?? ticker
  } catch {
    return ticker
  }
}

export async function syncAlpacaPositions(
  userId: string,
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<{ ok: true; lastSyncedAt: string } | { ok: false; error: string }> {
  try {
    // Step 1: Fetch all positions from Alpaca
    let positions: AlpacaPosition[]
    try {
      const raw = await fetchAllPositions(keyId, secret, isPaper)
      positions = raw as AlpacaPosition[]
    } catch {
      return { ok: false, error: 'Alpaca unreachable' }
    }

    // Step 2: Load existing DB holdings for this user
    const admin = createAdminClient()
    const { data: dbHoldings } = await admin
      .from('portfolio_holdings')
      .select('id, ticker, qty')
      .eq('user_id', userId)

    // Step 3: Build ticker → row id map
    const tickerToId = new Map<string, string>()
    for (const row of (dbHoldings ?? [])) {
      tickerToId.set(row.ticker as string, row.id as string)
    }

    // Step 4 & 5: Reconcile positions
    const now = new Date().toISOString()

    // Separate positions into updates and inserts
    const updateRows: Array<{
      id: string
      total_value_usd: number
      qty: number
      updated_at: string
    }> = []

    const newTickers: string[] = []
    const newPositions: AlpacaPosition[] = []

    for (const pos of positions) {
      const total_value_usd = parseFloat(pos.market_value)
      // Guard: skip zero or negative market value (unsettled trades or short positions)
      if (total_value_usd <= 0) continue

      const qty = parseFloat(pos.qty)
      const existingId = tickerToId.get(pos.symbol)

      if (existingId) {
        updateRows.push({ id: existingId, total_value_usd, qty, updated_at: now })
      } else {
        newTickers.push(pos.symbol)
        newPositions.push(pos)
      }
    }

    // Look up company names for new tickers in parallel
    const companyNames = await Promise.all(newTickers.map(lookupCompanyName))

    const insertRows = newPositions.map((pos, i) => ({
      user_id: userId,
      ticker: pos.symbol,
      company_name: companyNames[i],
      total_value_usd: parseFloat(pos.market_value),
      qty: parseFloat(pos.qty),
    }))

    // Execute updates one by one (no compound upsert on id + user to avoid touching DB-only rows)
    for (const row of updateRows) {
      await admin
        .from('portfolio_holdings')
        .update({ total_value_usd: row.total_value_usd, qty: row.qty, updated_at: row.updated_at })
        .eq('id', row.id)
        .eq('user_id', userId)
    }

    // Execute inserts via upsert on (user_id, ticker) — only for new positions
    if (insertRows.length > 0) {
      await admin
        .from('portfolio_holdings')
        .upsert(insertRows, { onConflict: 'user_id,ticker' })
    }

    // Step 6: Update last_synced_at in portfolio_settings
    await admin
      .from('portfolio_settings')
      .upsert({ user_id: userId, last_synced_at: now }, { onConflict: 'user_id' })

    // Step 7: Return success
    return { ok: true, lastSyncedAt: now }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sync failed' }
  }
}

export async function syncAlpacaPositionsForUser(userId: string): Promise<
  | { hasAlpaca: false }
  | { hasAlpaca: true; ok: true; lastSyncedAt: string }
  | { hasAlpaca: true; ok: false; error: string }
> {
  const admin = createAdminClient()
  const { data: cred } = await admin
    .from('alpaca_credentials')
    .select('encrypted_key_id, key_id_iv, encrypted_secret, secret_iv, is_paper')
    .eq('user_id', userId)
    .maybeSingle()

  if (!cred) return { hasAlpaca: false }

  const keyId = decryptCredential(cred.encrypted_key_id as string, cred.key_id_iv as string)
  const secret = decryptCredential(cred.encrypted_secret as string, cred.secret_iv as string)
  const result = await syncAlpacaPositions(userId, keyId, secret, cred.is_paper as boolean)

  return { hasAlpaca: true, ...result }
}
