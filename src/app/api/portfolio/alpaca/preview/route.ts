import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential } from '@/lib/alpacaCrypto'
import { fetchQuotes, fetchPosition } from '@/lib/alpacaClient'
import { computeOrderQty, isNYSEOpen } from '@/lib/alpacaOrderCalculator'
import type { ActionItem } from '@/types/database'

const PreviewSchema = z.object({
  recommendation_id: z.string().uuid(),
})

export interface OrderPreviewItem {
  ticker: string
  action: 'buy' | 'sell'
  qty: number
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

  // Load recommendation (must belong to this user)
  const { data: rec } = await supabase
    .from('recommendations')
    .select('id, action_list, user_id')
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

  // Extract non-hold tickers from action_list
  const actionList = (rec.action_list ?? []) as ActionItem[]
  const nonHoldItems = actionList.filter((item) => item.action !== 'hold')
  const tickers = nonHoldItems.map((item) => item.ticker)

  // Fetch live quotes from Alpaca
  let quotes: Record<string, number>
  try {
    quotes = await fetchQuotes(tickers, keyId, secret, cred.is_paper)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch quotes from Alpaca' }, { status: 502 })
  }

  // Fetch positions for sell items (can run in parallel)
  const sellItems = nonHoldItems.filter((item) => item.action === 'sell')
  const positionEntries = await Promise.all(
    sellItems.map(async (item) => {
      const qty = await fetchPosition(item.ticker, keyId, secret, cred.is_paper)
      return [item.ticker, qty] as [string, number]
    })
  )
  const positions = Object.fromEntries(positionEntries)

  // Compute preview items
  const previewItems: OrderPreviewItem[] = nonHoldItems.map((item) => {
    const askPrice = quotes[item.ticker] ?? 0
    const positionQty = item.action === 'sell' ? (positions[item.ticker] ?? 0) : 0
    const qty = computeOrderQty(item.delta_usd, askPrice, positionQty, item.action as 'buy' | 'sell')
    const skipped = qty === 0
    return {
      ticker:          item.ticker,
      action:          item.action as 'buy' | 'sell',
      qty,
      ask_price:       askPrice,
      estimated_value: qty * askPrice,
      skipped,
      skip_reason:     skipped ? 'Too small to execute' : null,
    }
  })

  return NextResponse.json({
    is_market_open: isNYSEOpen(),
    is_paper:       cred.is_paper,
    preview:        previewItems,
  })
}
