import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { logAudit } from '@/lib/auditLogger'
import { loadAlpacaCredentials } from '@/lib/alpacaLivePortfolio'
import { cancelAllOpenOrders } from '@/lib/alpacaClient'
import { MIGRATION_MISSING_WARNING, cancelInFlightExecutions, setTradingPause } from '@/lib/tradingSafety'

const PauseSchema = z.object({
  reason: z.string().trim().max(200).optional(),
})

// ── POST ──────────────────────────────────────────────────────────────────────
// Kill switch: persist the trading pause, cancel every open Alpaca order (DELETE /v2/orders) and mark in-flight
// executions cancelled. Cancelling still happens when the pause itself cannot persist (migration missing).

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let raw: unknown = {}
  try {
    const text = await request.text()
    raw = text.trim() ? JSON.parse(text) : {}
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = PauseSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const reason = parsed.data.reason || 'Paused manually'

  const persisted = await setTradingPause(user.id, true, reason)

  let ordersCancelled: boolean | null = null
  const creds = await loadAlpacaCredentials(user.id)
  if (creds) {
    ordersCancelled = await cancelAllOpenOrders(creds.keyId, creds.secret, creds.isPaper)
  }

  const executionsCancelled = await cancelInFlightExecutions(user.id, `trading paused (${reason})`)

  await logAudit({
    performedBy:   user.id,
    action:        'trading_paused',
    tripId:        null,
    changedFields: { trading_paused: { before: null, after: true }, paused_reason: { before: null, after: reason } },
  })

  const warnings: string[] = []
  if (!persisted) warnings.push(`${MIGRATION_MISSING_WARNING} Open orders and in-flight executions were still cancelled, but new executions are not blocked.`)
  if (ordersCancelled === false) warnings.push('Alpaca did not confirm that open orders were cancelled — check your Alpaca account.')

  return NextResponse.json({
    paused:               persisted,
    orders_cancelled:     ordersCancelled,
    executions_cancelled: executionsCancelled,
    warning:              warnings.length > 0 ? warnings.join(' ') : null,
  })
}
