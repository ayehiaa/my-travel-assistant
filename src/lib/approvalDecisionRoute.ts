import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { hasFeature } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/auditLogger'
import { requestExecution } from '@/lib/tradeExecutionRequest'
import { executionBlocksNewRequest } from '@/lib/tradeExecution'
import { loadSafetySettings } from '@/lib/tradingSafety'
import {
  applyApprovalDecision,
  checkApprovalDecision,
  readAutopilotInfo,
  type ApprovalDecision,
} from '@/lib/autopilot'
import { latestCompleteRecommendationId, saveAutopilotInfo } from '@/lib/autopilotStore'

const IdSchema = z.string().uuid()

/**
 * Server only. Shared body of POST /api/portfolio/recommendations/[id]/approve and /reject.
 * Auth → 401, Portfolio add-on → 403, Zod id → 400, ownership → 404, state machine (checkApprovalDecision) → 409/423.
 * Approve re-checks expiry, latest, existing execution and the trading pause, then calls requestExecution() — which
 * applies fresh quotes, risk limits, loss stops, the Shariah buy guard and dry run in the execution engine.
 */
export async function handleApprovalDecision(rawId: string, decision: ApprovalDecision): Promise<NextResponse> {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasFeature(user.access, 'portfolio')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const idParse = IdSchema.safeParse(rawId)
  if (!idParse.success) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  const id = idParse.data

  const supabase = await createClient()
  const { data: rec } = await supabase
    .from('recommendations')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!rec) return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 })
  if (rec.status !== 'complete') return NextResponse.json({ error: 'Recommendation is not complete' }, { status: 409 })

  const info = readAutopilotInfo(rec as Record<string, unknown>)
  const now = new Date()

  const [latestId, existingRes, safety] = await Promise.all([
    latestCompleteRecommendationId(user.id),
    supabase
      .from('alpaca_executions')
      .select('id, orders')
      .eq('recommendation_id', id)
      .eq('user_id', user.id)
      .maybeSingle(),
    loadSafetySettings(user.id),
  ])
  const existing = existingRes.data

  const check = checkApprovalDecision(decision, {
    info,
    now,
    isLatest:             latestId === id,
    hasBlockingExecution: existing !== null && executionBlocksNewRequest(existing.orders),
    tradingPaused:        safety.trading_paused,
  })
  if (!check.ok) return NextResponse.json({ error: check.message, reason: check.reason }, { status: check.httpStatus })

  if (check.next === 'rejected') {
    const saved = await saveAutopilotInfo(id, user.id, applyApprovalDecision(info, 'rejected', now, null))
    if (!saved) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    await logAudit({
      performedBy:   user.id,
      action:        'recommendation_rejected',
      tripId:        null,
      changedFields: { approval_status: { before: 'pending', after: 'rejected' } },
    })
    return NextResponse.json({ approval_status: 'rejected' })
  }

  const admin = createAdminClient()
  const { data: cred } = await admin
    .from('alpaca_credentials')
    .select('is_paper')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!cred) return NextResponse.json({ error: 'No Alpaca credentials connected' }, { status: 400 })

  const result = await requestExecution({ userId: user.id, recommendationId: id, isPaper: cred.is_paper })
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

  // The execution is queued; recording 'approved' is best-effort (the execution row is the source of truth).
  await saveAutopilotInfo(id, user.id, applyApprovalDecision(info, 'approved', now, result.executionId))
  await logAudit({
    performedBy:   user.id,
    action:        'recommendation_approved',
    tripId:        null,
    changedFields: {
      approval_status: { before: 'pending', after: 'approved' },
      execution_id:    { before: null, after: result.executionId },
    },
  })
  await logAudit({ performedBy: user.id, action: 'alpaca_executed', tripId: null })

  return NextResponse.json(
    {
      approval_status: 'approved',
      execution_id:    result.executionId,
      executed_at:     result.executedAt,
      is_paper:        cred.is_paper,
      dry_run:         safety.dry_run,
      status:          'pending',
    },
    { status: 202 },
  )
}
