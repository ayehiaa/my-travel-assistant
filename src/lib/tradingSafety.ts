import { createAdminClient } from '@/lib/supabase/admin'
import { fetchEquitySnapshot, fetchWeeklyEquityHistory } from '@/lib/alpacaClient'
import {
  evaluateLossStops,
  pickWeekStartEquity,
  readSafetySettings,
  type LossStopResult,
  type RiskLimits,
  type SafetySettings,
} from '@/lib/riskLimits'
import {
  buildEnvelope,
  haltOrders,
  isTerminalExecutionStatus,
  parseStoredOrders,
  type TradingCredentials,
} from '@/lib/tradeExecution'

import {
  FULL_SCREENING_CONFIG,
  effectiveScreeningConfig,
  readScreeningSettings,
  type EffectiveScreeningConfig,
} from '@/lib/screeningConfig'

/**
 * Server-only I/O for the safety layer (kill switch, loss stops, safety settings).
 * Every function tolerates the 20261120c migration not being applied. See specs/021-risk-limits-kill-switch.
 */

export const MIGRATION_MISSING_WARNING =
  'Safety settings could not be saved — the database migration 20261120c_risk_limits_kill_switch has not been applied yet.'

/**
 * The user's CURRENT effective screening config (specs/030) for the buy guard. Missing row / column / a read error →
 * everything on (the most conservative config).
 */
export async function loadScreeningConfig(userId: string): Promise<EffectiveScreeningConfig> {
  try {
    const { data, error } = await createAdminClient()
      .from('portfolio_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return FULL_SCREENING_CONFIG
    return effectiveScreeningConfig(readScreeningSettings(data as Record<string, unknown> | null))
  } catch {
    return FULL_SCREENING_CONFIG
  }
}

/** Safety settings for a user (admin client). Missing row / columns → defaults (dry run ON, not paused). */
export async function loadSafetySettings(userId: string): Promise<SafetySettings> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return readSafetySettings(data as Record<string, unknown> | null)
}

/**
 * Persist the trading pause (paused=true) or clear it. Best effort: returns false when the columns do not exist
 * (migration missing) or the write failed — callers must surface that the pause did not persist.
 */
export async function setTradingPause(userId: string, paused: boolean, reason: string | null): Promise<boolean> {
  const admin = createAdminClient()
  await admin
    .from('portfolio_settings')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
  const { data, error } = await admin
    .from('portfolio_settings')
    .update({
      trading_paused: paused,
      paused_reason:  paused ? (reason ?? 'Paused') : null,
      paused_at:      paused ? new Date().toISOString() : null,
    })
    .eq('user_id', userId)
    .select('user_id')
  return !error && Array.isArray(data) && data.length > 0
}

/**
 * Mark every non-terminal execution of the user as cancelled (unsubmitted orders → skipped). The engine sees the
 * cancelled row between steps and stops. Returns the number of executions cancelled.
 */
export async function cancelInFlightExecutions(userId: string, reason: string): Promise<number> {
  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('alpaca_executions')
    .select('id, orders')
    .eq('user_id', userId)
    .order('executed_at', { ascending: false })
    .limit(50)
  if (error || !rows) return 0

  let cancelled = 0
  const nowIso = new Date().toISOString()
  for (const row of rows) {
    const current = parseStoredOrders(row.orders)
    if (isTerminalExecutionStatus(current.status)) continue
    const envelope = buildEnvelope('cancelled', haltOrders(current.orders, reason, nowIso), nowIso, {
      error_message: `Cancelled — ${reason}`,
      dry_run:       current.dry_run,
    })
    const { error: updateError } = await admin
      .from('alpaca_executions')
      .update({ orders: envelope })
      .eq('id', row.id)
      .eq('user_id', userId)
    if (!updateError) cancelled++
  }
  return cancelled
}

/** Read equity, last_equity and the 1W/1D history and evaluate the loss stops. Never throws (fails closed). */
export async function checkLossStops(creds: TradingCredentials, limits: RiskLimits): Promise<LossStopResult> {
  let snapshot: { equity: number | null; last_equity: number | null } = { equity: null, last_equity: null }
  try {
    snapshot = await fetchEquitySnapshot(creds.keyId, creds.secret, creds.isPaper)
  } catch {
    // equity stays null → blocked (unverified)
  }
  let weekStart: number | null = null
  let historyAvailable = true
  try {
    weekStart = pickWeekStartEquity(await fetchWeeklyEquityHistory(creds.keyId, creds.secret, creds.isPaper))
  } catch {
    historyAvailable = false
  }
  return evaluateLossStops(
    { equity: snapshot.equity, last_equity: snapshot.last_equity, week_start_equity: weekStart, week_history_available: historyAvailable },
    limits,
  )
}
