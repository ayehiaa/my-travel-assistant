import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { fetchLivePortfolio, loadAlpacaCredentials, type AlpacaCredentials } from '@/lib/alpacaLivePortfolio'
import { executionBlocksNewRequest, normalizeExecution } from '@/lib/tradeExecution'
import { isAwaitingApproval, msUntilExpiry, readAutopilotInfo } from '@/lib/autopilot'
import { getAiKeyStatus, type AiKeyStatus } from '@/lib/aiKeyStore'
import { buildSetupChecklist } from '@/lib/setupChecklist'
import type { LivePortfolio, NormalizedExecution } from '@/types/database'

/**
 * Server-only data loaders for the Portfolio hub (specs/025-portfolio-trading-hub).
 * Wrapped in React cache() so sections rendered in separate Suspense boundaries share one fetch per request.
 * Callers must have checked auth, role and the ToS gate first.
 */

/** portfolio_settings row via select('*') so every pre-migration column set works (readers apply defaults). */
export const getSettingsRow = cache(async (userId: string): Promise<Record<string, unknown> | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from('portfolio_settings').select('*').eq('user_id', userId).maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
})

/** Latest complete recommendation (select('*') so autopilot / screening columns are read when migrated). */
export const getLatestCompleteRecommendation = cache(async (userId: string): Promise<Record<string, unknown> | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('recommendations')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'complete')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
})

export const getCredentials = cache(async (userId: string): Promise<AlpacaCredentials | null> => {
  try {
    return await loadAlpacaCredentials(userId)
  } catch {
    return null
  }
})

export interface LiveState {
  connected: boolean
  portfolio: LivePortfolio | null
  liveError: boolean
}

/** The whole account is read live from Alpaca — nothing about holdings or cash is stored in the app. */
export const getLiveState = cache(async (userId: string): Promise<LiveState> => {
  const creds = await getCredentials(userId)
  if (!creds) return { connected: false, portfolio: null, liveError: false }
  try {
    return { connected: true, portfolio: await fetchLivePortfolio(creds), liveError: false }
  } catch {
    return { connected: true, portfolio: null, liveError: true }
  }
})

/** Recent executions (newest first), normalized. */
export const getRecentExecutions = cache(async (userId: string, limit: number): Promise<NormalizedExecution[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('alpaca_executions')
    .select('*')
    .eq('user_id', userId)
    .order('executed_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(row => normalizeExecution(row as Parameters<typeof normalizeExecution>[0]))
})

/** The latest complete recommendation, when it is a scheduled run still awaiting approval. */
export const getPendingApproval = cache(async (userId: string): Promise<{ recommendationId: string; expiresInMs: number } | null> => {
  const rec = await getLatestCompleteRecommendation(userId)
  if (!rec) return null
  const info = readAutopilotInfo(rec)
  if (info.trigger !== 'schedule' || info.approval_status !== 'pending') return null
  const supabase = await createClient()
  const { data: exec } = await supabase
    .from('alpaca_executions')
    .select('orders')
    .eq('recommendation_id', rec.id as string)
    .maybeSingle()
  const now = new Date()
  const blocking = exec !== null && executionBlocksNewRequest(exec.orders)
  if (!isAwaitingApproval(info, now, blocking)) return null
  return { recommendationId: rec.id as string, expiresInMs: msUntilExpiry(info, now) }
})

/** Claude API key status (never throws — see getAiKeyStatus). */
export const getAiKey = cache(async (userId: string, email: string): Promise<AiKeyStatus> => getAiKeyStatus(userId, email))

/**
 * Getting-started checklist. The hub only renders after the terms gate, so step ① is always done.
 * "Alpaca connected" means credentials are stored (no live Alpaca call).
 */
export const getSetupChecklist = cache(async (userId: string, email: string) => {
  const [creds, aiKey, latestRec] = await Promise.all([
    getCredentials(userId),
    getAiKey(userId, email),
    getLatestCompleteRecommendation(userId),
  ])
  return buildSetupChecklist({
    tosAccepted:     true,
    alpacaConnected: creds !== null,
    aiKey:           aiKey.connected ? 'own' : aiKey.usingOwnerFallback ? 'app_owner' : 'none',
    hasCompletedRun: !!latestRec,
  })
})
