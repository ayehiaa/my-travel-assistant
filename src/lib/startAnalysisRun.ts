import { createAdminClient } from '@/lib/supabase/admin'
import { loadAlpacaCredentials, fetchLivePortfolio } from '@/lib/alpacaLivePortfolio'
import { cooldownRemainingSeconds, type RunTrigger } from '@/lib/schedule'
import { inngest } from '@/inngest/client'

export const ANALYSIS_REQUESTED_EVENT = 'portfolio/analysis.requested'

export const AGENT_NAMES = [
  'macroeconomics',
  'fed_rates',
  'geopolitics',
  'sentiment',
  'fundamentals',
  'technical_analysis',
  'sector_analysis',
] as const

/** Every stage shown in the run progress list: the 7 agents, then the synthesizer and the Shariah screening. */
export const PIPELINE_STAGES = [...AGENT_NAMES, 'synthesizer', 'shariah_screening'] as const

export type StartRunResult =
  | { ok: true; runId: string }
  | { ok: false; reason: 'no_credentials' | 'alpaca_unreachable' | 'no_funds' | 'db_error' | 'event_failed' }
  | { ok: false; reason: 'cooldown'; retryAfterSeconds: number }

/**
 * Server only. Shared by POST /api/portfolio/run (trigger 'manual') and the scheduler (trigger 'schedule'):
 * credentials + live value checks, cooldown (24 h manual / 20 h scheduled), recommendations row, run_progress rows,
 * last_run_at, then the Inngest event. Callers must already have checked auth / role and log the audit entry.
 */
export async function startAnalysisRun(params: { userId: string; trigger: RunTrigger; now?: Date }): Promise<StartRunResult> {
  const { userId, trigger } = params
  const now = params.now ?? new Date()

  // The portfolio is read live from Alpaca — require a connected account with funds or positions
  const creds = await loadAlpacaCredentials(userId)
  if (!creds) return { ok: false, reason: 'no_credentials' }

  let live
  try {
    live = await fetchLivePortfolio(creds)
  } catch {
    return { ok: false, reason: 'alpaca_unreachable' }
  }
  if (live.total_value_usd <= 0) return { ok: false, reason: 'no_funds' }

  const admin = createAdminClient()

  const { data: settingsRow, error: settingsError } = await admin
    .from('portfolio_settings')
    .select('last_run_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (settingsError) return { ok: false, reason: 'db_error' }

  const retryAfterSeconds = cooldownRemainingSeconds(settingsRow?.last_run_at ?? null, now, trigger)
  if (retryAfterSeconds > 0) return { ok: false, reason: 'cooldown', retryAfterSeconds }

  const { data: recRow, error: recError } = await admin
    .from('recommendations')
    .insert({ user_id: userId, status: 'running' })
    .select('id')
    .single()
  if (recError || !recRow) return { ok: false, reason: 'db_error' }

  const runId: string = recRow.id

  const { error: progressError } = await admin
    .from('run_progress')
    .insert(PIPELINE_STAGES.map(name => ({ run_id: runId, agent_name: name, status: 'pending' })))
  if (progressError) return { ok: false, reason: 'db_error' }

  const { error: updateError } = await admin
    .from('portfolio_settings')
    .update({ last_run_at: now.toISOString() })
    .eq('user_id', userId)
  if (updateError) return { ok: false, reason: 'db_error' }

  // Best-effort: mark scheduled runs on the row itself (column from migration 20261120d). The authoritative marker
  // is the event's trigger, which the analysis function copies into agent_outputs.autopilot on completion.
  if (trigger === 'schedule') {
    try {
      await admin.from('recommendations').update({ run_trigger: 'schedule' }).eq('id', runId)
    } catch {
      // Ignored — column may not exist yet.
    }
  }

  try {
    await inngest.send({ name: ANALYSIS_REQUESTED_EVENT, data: { run_id: runId, user_id: userId, trigger } })
  } catch {
    await admin
      .from('recommendations')
      .update({ status: 'error', error_message: 'Could not start the analysis', updated_at: now.toISOString() })
      .eq('id', runId)
    // Undo the cooldown so the user (or the next scheduler fire) can retry.
    await admin
      .from('portfolio_settings')
      .update({ last_run_at: settingsRow?.last_run_at ?? null })
      .eq('user_id', userId)
    return { ok: false, reason: 'event_failed' }
  }

  return { ok: true, runId }
}
