import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { hasFeature } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/auditLogger'
import { requestExecution } from '@/lib/tradeExecutionRequest'
import { executionBlocksNewRequest } from '@/lib/tradeExecution'

const ExecuteSchema = z.object({
  recommendation_id: z.string().uuid(),
})

// ── POST ──────────────────────────────────────────────────────────────────────
// Queues the execution: creates the alpaca_executions row (status "pending"), sends
// portfolio/execution.requested and returns 202. Orders are placed by src/inngest/executeTrades.ts.

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasFeature(user.access, 'portfolio')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
    .select('id')
    .eq('id', parsed.data.recommendation_id)
    .eq('user_id', user.id)
    .single()

  if (!rec) {
    return NextResponse.json({ error: 'Recommendation not found' }, { status: 400 })
  }

  // Fast-path guard: no existing execution for this recommendation.
  // The UNIQUE (recommendation_id) constraint in requestExecution() is the race-proof guard.
  // A finished dry run is the only row that may be replaced (requestExecution deletes it conditionally).
  const { data: existing } = await supabase
    .from('alpaca_executions')
    .select('id, orders')
    .eq('recommendation_id', rec.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing !== null && executionBlocksNewRequest(existing.orders)) {
    return NextResponse.json({ error: 'Recommendation already executed' }, { status: 409 })
  }

  // Credentials must exist before queuing (the engine re-loads them itself)
  const admin = createAdminClient()
  const { data: cred } = await admin
    .from('alpaca_credentials')
    .select('is_paper')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!cred) {
    return NextResponse.json({ error: 'No Alpaca credentials connected' }, { status: 404 })
  }

  const result = await requestExecution({
    userId:           user.id,
    recommendationId: rec.id,
    isPaper:          cred.is_paper,
  })

  if (!result.ok) {
    if (result.reason === 'already_executed') {
      return NextResponse.json({ error: 'Recommendation already executed' }, { status: 409 })
    }
    if (result.reason === 'trading_paused') {
      return NextResponse.json({ error: 'Trading is paused — resume it in Portfolio Settings first' }, { status: 423 })
    }
    if (result.reason === 'event_failed') {
      return NextResponse.json({ error: 'Could not start the execution — try again shortly' }, { status: 502 })
    }
    return NextResponse.json({ error: 'Failed to save execution record' }, { status: 500 })
  }

  await logAudit({ performedBy: user.id, action: 'alpaca_executed', tripId: null })

  return NextResponse.json(
    {
      execution_id: result.executionId,
      executed_at:  result.executedAt,
      is_paper:     cred.is_paper,
      status:       'pending',
    },
    { status: 202 },
  )
}
