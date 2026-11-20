import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/inngest/client'
import { buildEnvelope } from '@/lib/tradeExecution'
import { loadSafetySettings } from '@/lib/tradingSafety'

export const EXECUTION_REQUESTED_EVENT = 'portfolio/execution.requested'
export const EXECUTION_COMPLETED_EVENT = 'portfolio/execution.completed'

export type RequestExecutionResult =
  | { ok: true; executionId: string; executedAt: string }
  | { ok: false; reason: 'already_executed' | 'db_error' | 'event_failed' | 'trading_paused' }

/**
 * Server only. Create the alpaca_executions row (status "pending") FIRST, then send the Inngest event.
 * The UNIQUE (recommendation_id) constraint makes this the real double-execution guard: a concurrent
 * second request fails the insert (23505) → already_executed. If the event cannot be sent, the row is
 * deleted again (no orders exist yet) so the caller may retry.
 *
 * Refuses while the trading pause (kill switch) is engaged. A finished dry-run row for the same recommendation is
 * deleted first (conditionally — only while it is still dry_run_completed) so a real run can follow a simulation.
 *
 * Callers must already have checked auth, role, ownership of the recommendation and credentials.
 */
export async function requestExecution(params: {
  userId: string
  recommendationId: string
  isPaper: boolean
}): Promise<RequestExecutionResult> {
  const safety = await loadSafetySettings(params.userId)
  if (safety.trading_paused) return { ok: false, reason: 'trading_paused' }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  await admin
    .from('alpaca_executions')
    .delete()
    .eq('recommendation_id', params.recommendationId)
    .eq('user_id', params.userId)
    .eq('orders->>status', 'dry_run_completed')

  const { data: row, error } = await admin
    .from('alpaca_executions')
    .insert({
      recommendation_id: params.recommendationId,
      user_id:           params.userId,
      is_paper:          params.isPaper,
      orders:            buildEnvelope('pending', [], nowIso, { dry_run: safety.dry_run }),
    })
    .select('id, executed_at')
    .single()

  if (error || !row) {
    return { ok: false, reason: error?.code === '23505' ? 'already_executed' : 'db_error' }
  }

  try {
    await inngest.send({
      name: EXECUTION_REQUESTED_EVENT,
      data: { execution_id: row.id, user_id: params.userId, recommendation_id: params.recommendationId },
    })
  } catch {
    await admin.from('alpaca_executions').delete().eq('id', row.id).eq('user_id', params.userId)
    return { ok: false, reason: 'event_failed' }
  }

  return { ok: true, executionId: row.id as string, executedAt: row.executed_at as string }
}
