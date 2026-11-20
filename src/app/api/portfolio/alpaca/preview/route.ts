import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential } from '@/lib/alpacaCrypto'
import { fetchClock } from '@/lib/alpacaClient'
import { isNYSEOpen } from '@/lib/alpacaOrderCalculator'
import { readShariahScreening, NO_SCREENING_SKIP_REASON } from '@/lib/shariahRules'
import { loadPlanInputs, planOrders } from '@/lib/tradeExecution'
import type { ActionItem } from '@/types/database'

const PreviewSchema = z.object({
  recommendation_id: z.string().uuid(),
})

export interface OrderPreviewItem {
  ticker: string
  action: 'buy' | 'sell'
  /** Shares (sells, whole-share buys). For notional buys: estimated shares at the current ask. */
  qty: number
  /** USD amount for notional (fractional) buys; null for qty orders. */
  notional: number | null
  ask_price: number
  estimated_value: number
  skipped: boolean
  skip_reason: string | null
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = PreviewSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = await createClient()

  // Load recommendation (must belong to this user).
  // select('*') so a missing shariah_screening column (migration not applied) cannot break the query.
  const { data: rec } = await supabase
    .from('recommendations')
    .select('*')
    .eq('id', parsed.data.recommendation_id)
    .eq('user_id', user.id)
    .single()

  if (!rec) {
    return NextResponse.json({ error: 'Recommendation not found' }, { status: 400 })
  }

  // Guard: no existing execution for this recommendation
  const { data: existing } = await supabase
    .from('alpaca_executions')
    .select('id')
    .eq('recommendation_id', rec.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing !== null) {
    return NextResponse.json({ error: 'Recommendation already executed' }, { status: 409 })
  }

  // Load credentials via admin client
  const admin = createAdminClient()
  const { data: cred } = await admin
    .from('alpaca_credentials')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!cred) {
    return NextResponse.json({ error: 'No Alpaca credentials connected' }, { status: 404 })
  }

  const keyId = decryptCredential(cred.encrypted_key_id, cred.key_id_iv)
  const secret = decryptCredential(cred.encrypted_secret, cred.secret_iv)

  const creds = { keyId, secret, isPaper: cred.is_paper }
  const items = ((rec.action_list ?? []) as ActionItem[]).filter((item) => item.action !== 'hold')
  const screening = readShariahScreening(rec)

  // Same planner as the execution engine (Shariah guard, notional buys, settlement check on sells).
  // The engine sizes buys again to settled cash after the sells have filled.
  let planned
  try {
    const inputs = await loadPlanInputs(creds, items, screening)
    planned = planOrders({ executionId: 'preview', items, screening, ...inputs })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch quotes from Alpaca' }, { status: 502 })
  }

  const previewItems: OrderPreviewItem[] = planned.map((o) => ({
    ticker:          o.ticker,
    action:          o.action,
    qty:             o.qty,
    notional:        o.notional ?? null,
    ask_price:       o.price_at_execution,
    estimated_value: o.estimated_value,
    skipped:         o.status === 'skipped',
    skip_reason:     o.status === 'skipped' ? o.error_message : null,
  }))

  let isMarketOpen: boolean
  try {
    isMarketOpen = (await fetchClock(keyId, secret, cred.is_paper)).is_open
  } catch {
    isMarketOpen = isNYSEOpen()
  }

  return NextResponse.json({
    is_market_open: isMarketOpen,
    is_paper:       cred.is_paper,
    preview:        previewItems,
    shariah_notice: screening ? null : NO_SCREENING_SKIP_REASON,
  })
}
