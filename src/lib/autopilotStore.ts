import { createAdminClient } from '@/lib/supabase/admin'
import { autopilotColumns, type AutopilotInfo } from '@/lib/autopilot'

/**
 * Server only. Persist autopilot info on a recommendation: agent_outputs.autopilot (always available) together with
 * the dedicated columns from migration 20261120d in ONE update so they never disagree. If that update fails (columns
 * missing) it is retried with agent_outputs only. Returns false when nothing could be written.
 */
export async function saveAutopilotInfo(recommendationId: string, userId: string, info: AutopilotInfo): Promise<boolean> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('recommendations')
    .select('agent_outputs')
    .eq('id', recommendationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!row) return false

  const current = row.agent_outputs && typeof row.agent_outputs === 'object'
    ? (row.agent_outputs as Record<string, unknown>)
    : {}
  const agentOutputs = { ...current, autopilot: info }
  const updatedAt = new Date().toISOString()

  const { data: full, error: fullError } = await admin
    .from('recommendations')
    .update({ agent_outputs: agentOutputs, ...autopilotColumns(info), updated_at: updatedAt })
    .eq('id', recommendationId)
    .eq('user_id', userId)
    .select('id')
  if (!fullError && Array.isArray(full) && full.length > 0) return true

  const { data: fallback, error: fallbackError } = await admin
    .from('recommendations')
    .update({ agent_outputs: agentOutputs, updated_at: updatedAt })
    .eq('id', recommendationId)
    .eq('user_id', userId)
    .select('id')
  return !fallbackError && Array.isArray(fallback) && fallback.length > 0
}

/** The user's latest complete recommendation id (admin client), or null. */
export async function latestCompleteRecommendationId(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('recommendations')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'complete')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}
