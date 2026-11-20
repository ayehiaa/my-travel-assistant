import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential } from '@/lib/alpacaCrypto'
import { fetchAccount, fetchAllPositions, fetchAssetNames } from '@/lib/alpacaClient'
import type { LiveHolding, LivePortfolio } from '@/types/database'

export interface AlpacaCredentials {
  keyId: string
  secret: string
  isPaper: boolean
}

interface RawPosition {
  symbol: string
  qty: string
  market_value: string
  avg_entry_price?: string | null
  current_price?: string | null
  cost_basis?: string | null
  unrealized_pl?: string | null
  unrealized_plpc?: string | null
}

const PNL_FIELDS = ['avg_entry_price', 'current_price', 'cost_basis', 'unrealized_pl', 'unrealized_plpc'] as const

/** Copy the P&L fields Alpaca returned as parseable numbers (missing / unparseable ones are left out). */
function pnlFields(pos: RawPosition): Partial<Pick<LiveHolding, (typeof PNL_FIELDS)[number]>> {
  const out: Partial<Pick<LiveHolding, (typeof PNL_FIELDS)[number]>> = {}
  for (const key of PNL_FIELDS) {
    const raw = pos[key]
    if (raw === undefined || raw === null || raw === '') continue
    const n = parseFloat(raw)
    if (Number.isFinite(n)) out[key] = n
  }
  return out
}

/**
 * Pure: turn raw Alpaca positions + cash into the app's live portfolio shape.
 * Skips zero/negative market values (short positions, unsettled rows). P&L fields are copied when present.
 * Holdings are sorted by value, largest first.
 */
export function buildLiveSnapshot(
  positions: RawPosition[],
  cash: number,
  names: Record<string, string>,
): { holdings: LiveHolding[]; cash_usd: number; total_value_usd: number } {
  const holdings: LiveHolding[] = []
  for (const pos of positions) {
    const value = parseFloat(pos.market_value)
    if (!Number.isFinite(value) || value <= 0) continue
    const qty = parseFloat(pos.qty)
    holdings.push({
      ticker:          pos.symbol,
      company_name:    names[pos.symbol] ?? pos.symbol,
      qty:             Number.isFinite(qty) ? qty : 0,
      total_value_usd: value,
      ...pnlFields(pos),
    })
  }
  holdings.sort((a, b) => b.total_value_usd - a.total_value_usd)

  const cash_usd = Number.isFinite(cash) ? cash : 0
  const holdingsTotal = holdings.reduce((s, h) => s + h.total_value_usd, 0)
  return { holdings, cash_usd, total_value_usd: holdingsTotal + cash_usd }
}

/**
 * Load and decrypt the user's Alpaca credentials. Server only.
 * Returns null when no account is connected.
 */
export async function loadAlpacaCredentials(userId: string): Promise<AlpacaCredentials | null> {
  const admin = createAdminClient()
  const { data: cred } = await admin
    .from('alpaca_credentials')
    .select('encrypted_key_id, key_id_iv, encrypted_secret, secret_iv, is_paper')
    .eq('user_id', userId)
    .maybeSingle()

  if (!cred) return null

  return {
    keyId:   decryptCredential(cred.encrypted_key_id as string, cred.key_id_iv as string),
    secret:  decryptCredential(cred.encrypted_secret as string, cred.secret_iv as string),
    isPaper: cred.is_paper as boolean,
  }
}

/**
 * Read the whole account live from Alpaca: positions, company names and cash.
 * Throws if positions or account cannot be fetched; name lookups fall back to the ticker.
 */
export async function fetchLivePortfolio(creds: AlpacaCredentials): Promise<LivePortfolio> {
  const [positions, account] = await Promise.all([
    fetchAllPositions(creds.keyId, creds.secret, creds.isPaper),
    fetchAccount(creds.keyId, creds.secret, creds.isPaper),
  ])

  const names = await fetchAssetNames(
    positions.map(p => p.symbol),
    creds.keyId,
    creds.secret,
    creds.isPaper,
  )

  return {
    ...buildLiveSnapshot(positions, account.cash, names),
    is_paper:        creds.isPaper,
    fetched_at:      new Date().toISOString(),
    equity_usd:      Number.isFinite(account.equity) ? account.equity : null,
    last_equity_usd: account.last_equity,
  }
}
