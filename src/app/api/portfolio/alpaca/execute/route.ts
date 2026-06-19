import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential } from '@/lib/alpacaCrypto'
import { fetchQuotes, fetchPosition, submitOrder } from '@/lib/alpacaClient'
import { computeOrderQty } from '@/lib/alpacaOrderCalculator'
import { logAudit } from '@/lib/auditLogger'
import type { ActionItem, AlpacaOrderResult } from '@/types/database'

const ExecuteSchema = z.object({
  recommendation_id: z.string().uuid(),
})

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

  const parsed = ExecuteSchema.safeParse(raw)
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

  // Extract non-hold items from action_list
  const actionList = (rec.action_list ?? []) as ActionItem[]
  const nonHoldItems = actionList.filter((item) => item.action !== 'hold')
  const tickers = nonHoldItems.map((item) => item.ticker)

  // Fetch live quotes
  let quotes: Record<string, number>
  try {
    quotes = await fetchQuotes(tickers, keyId, secret, cred.is_paper)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch quotes from Alpaca' }, { status: 502 })
  }

  // Fetch positions for sell items
  const sellItems = nonHoldItems.filter((item) => item.action === 'sell')
  const positionEntries = await Promise.all(
    sellItems.map(async (item) => {
      const qty = await fetchPosition(item.ticker, keyId, secret, cred.is_paper)
      return [item.ticker, qty] as [string, number]
    })
  )
  const positions = Object.fromEntries(positionEntries)

  // Compute qty for every non-hold item and categorise
  type CategorisedItem = {
    item: ActionItem
    qty: number
    askPrice: number
  }

  const categorised: CategorisedItem[] = nonHoldItems.map((item) => {
    const askPrice = quotes[item.ticker] ?? 0
    const positionQty = item.action === 'sell' ? (positions[item.ticker] ?? 0) : 0
    const qty = computeOrderQty(item.delta_usd, askPrice, positionQty, item.action as 'buy' | 'sell')
    return { item, qty, askPrice }
  })

  const skippedItems = categorised.filter((c) => c.qty === 0)
  const submittableItems = categorised.filter((c) => c.qty > 0)
  const submittableSells = submittableItems.filter((c) => c.item.action === 'sell')
  const submittableBuys = submittableItems.filter((c) => c.item.action === 'buy')

  // Submit sells sequentially first, then buys sequentially
  type SubmittedResult = {
    item: ActionItem
    qty: number
    askPrice: number
    result: Awaited<ReturnType<typeof submitOrder>>
  }

  const submittedResults: SubmittedResult[] = []

  for (const c of submittableSells) {
    const result = await submitOrder(
      { symbol: c.item.ticker, qty: c.qty, side: 'sell' },
      keyId,
      secret,
      cred.is_paper
    )
    submittedResults.push({ item: c.item, qty: c.qty, askPrice: c.askPrice, result })
  }

  for (const c of submittableBuys) {
    const result = await submitOrder(
      { symbol: c.item.ticker, qty: c.qty, side: 'buy' },
      keyId,
      secret,
      cred.is_paper
    )
    submittedResults.push({ item: c.item, qty: c.qty, askPrice: c.askPrice, result })
  }

  // Build the orders JSONB array — include ALL non-hold items (skipped + submitted)
  const orders: AlpacaOrderResult[] = [
    ...skippedItems.map((c) => ({
      ticker:              c.item.ticker,
      action:              c.item.action as 'buy' | 'sell',
      qty:                 0,
      price_at_execution:  c.askPrice,
      estimated_value:     0,
      alpaca_order_id:     null,
      status:              'skipped' as const,
      error_message:       null,
    })),
    ...submittedResults.map((s) => ({
      ticker:              s.item.ticker,
      action:              s.item.action as 'buy' | 'sell',
      qty:                 s.qty,
      price_at_execution:  s.askPrice,
      estimated_value:     s.qty * s.askPrice,
      alpaca_order_id:     s.result.alpaca_order_id,
      status:              s.result.status,
      error_message:       s.result.error_message,
    })),
  ]

  // Insert execution record using admin client (no INSERT RLS policy on this table)
  const { data: execution, error: insertError } = await admin
    .from('alpaca_executions')
    .insert({
      recommendation_id: rec.id,
      user_id:           user.id,
      is_paper:          cred.is_paper,
      orders,
    })
    .select()
    .single()

  if (insertError || !execution) {
    return NextResponse.json({ error: 'Failed to save execution record' }, { status: 500 })
  }

  await logAudit({ performedBy: user.id, action: 'alpaca_executed', tripId: null })

  return NextResponse.json({
    execution_id: execution.id,
    executed_at:  execution.executed_at,
    is_paper:     execution.is_paper,
    orders:       execution.orders,
  })
}
