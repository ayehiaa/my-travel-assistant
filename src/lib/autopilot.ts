import { z } from 'zod'
import { parseAutopilotMode, type AutopilotMode, type RunTrigger } from '@/lib/schedule'

/**
 * Pure autopilot / approval logic (specs/022-scheduler-autopilot).
 *
 * Autopilot data for a recommendation lives in dedicated columns (migration 20261120d: run_trigger, approval_status,
 * approval_expires_at, approval_decided_at) with a copy in agent_outputs.autopilot that works before the migration.
 * A recommendation without either is a manual run.
 */

export const APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export type AutoExecutionOutcome = {
  status: 'requested' | 'skipped'
  reason: string | null
  execution_id: string | null
  at: string
}

export interface AutopilotInfo {
  trigger: RunTrigger
  /** Autopilot mode when the scheduled run completed. */
  mode: AutopilotMode
  /** Stored status — use effectiveApprovalStatus() to account for expiry. */
  approval_status: ApprovalStatus | null
  approval_expires_at: string | null
  approval_decided_at: string | null
  execution_id: string | null
  auto_execution: AutoExecutionOutcome | null
}

export const AutopilotInfoSchema = z.object({
  trigger:             z.enum(['manual', 'schedule']).catch('manual'),
  mode:                z.unknown().transform(parseAutopilotMode),
  approval_status:     z.enum(APPROVAL_STATUSES).nullable().catch(null),
  approval_expires_at: z.string().nullable().catch(null),
  approval_decided_at: z.string().nullable().catch(null),
  execution_id:        z.string().nullable().catch(null),
  auto_execution:      z.object({
    status:       z.enum(['requested', 'skipped']),
    reason:       z.string().nullable(),
    execution_id: z.string().nullable(),
    at:           z.string(),
  }).nullable().catch(null),
})

export const MANUAL_RUN_INFO: AutopilotInfo = {
  trigger:             'manual',
  mode:                'off',
  approval_status:     null,
  approval_expires_at: null,
  approval_decided_at: null,
  execution_id:        null,
  auto_execution:      null,
}

/**
 * Read autopilot info from a recommendation row: agent_outputs.autopilot (always written), overlaid by the dedicated
 * columns when present and non-null (they win — they are the canonical store once migrated).
 */
export function readAutopilotInfo(rec: Record<string, unknown> | null | undefined): AutopilotInfo {
  if (!rec) return MANUAL_RUN_INFO
  let info: AutopilotInfo = MANUAL_RUN_INFO
  const outputs = rec.agent_outputs
  if (outputs && typeof outputs === 'object' && 'autopilot' in outputs) {
    const parsed = AutopilotInfoSchema.safeParse((outputs as Record<string, unknown>).autopilot)
    if (parsed.success) info = { ...MANUAL_RUN_INFO, ...parsed.data } as AutopilotInfo
  }
  if (rec.run_trigger === 'schedule') info = { ...info, trigger: 'schedule' }
  if (typeof rec.approval_status === 'string' && (APPROVAL_STATUSES as readonly string[]).includes(rec.approval_status)) {
    info = { ...info, approval_status: rec.approval_status as ApprovalStatus }
  }
  if (typeof rec.approval_expires_at === 'string') info = { ...info, approval_expires_at: rec.approval_expires_at }
  if (typeof rec.approval_decided_at === 'string') info = { ...info, approval_decided_at: rec.approval_decided_at }
  return info
}

/** Autopilot info written when a scheduled run completes, for the mode in force at that moment. */
export function buildScheduledRunInfo(mode: AutopilotMode, completedAt: Date): AutopilotInfo {
  return {
    ...MANUAL_RUN_INFO,
    trigger:             'schedule',
    mode,
    approval_status:     mode === 'approval' ? 'pending' : null,
    approval_expires_at: mode === 'approval' ? new Date(completedAt.getTime() + APPROVAL_WINDOW_MS).toISOString() : null,
  }
}

/** 'pending' past its expiry reads as 'expired' (computed on read — no cron needed). */
export function effectiveApprovalStatus(info: AutopilotInfo, now: Date): ApprovalStatus | null {
  if (info.approval_status !== 'pending') return info.approval_status
  if (!info.approval_expires_at) return 'expired'
  const exp = new Date(info.approval_expires_at).getTime()
  if (!Number.isFinite(exp) || now.getTime() >= exp) return 'expired'
  return 'pending'
}

/** Milliseconds until the approval window closes (0 when closed or not pending). */
export function msUntilExpiry(info: AutopilotInfo, now: Date): number {
  if (effectiveApprovalStatus(info, now) !== 'pending' || !info.approval_expires_at) return 0
  return Math.max(0, new Date(info.approval_expires_at).getTime() - now.getTime())
}

/** "5h 12m", "45m", "under 1m". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000)
  if (totalMinutes < 1) return 'under 1m'
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export type ApprovalDecision = 'approve' | 'reject'

export type ApprovalRefusal =
  | 'not_scheduled'
  | 'not_pending'
  | 'expired'
  | 'not_latest'
  | 'already_executed'
  | 'trading_paused'

export interface ApprovalContext {
  info: AutopilotInfo
  now: Date
  /** Still the user's latest complete recommendation. */
  isLatest: boolean
  /** An execution row (other than a finished dry run) already exists for this recommendation. */
  hasBlockingExecution: boolean
  tradingPaused: boolean
}

export type ApprovalCheck =
  | { ok: true; next: 'approved' | 'rejected' }
  | { ok: false; reason: ApprovalRefusal; httpStatus: number; message: string }

/**
 * Approval state machine. pending → approved (only if not expired, still latest, not executed, trading not paused)
 * pending → rejected (only if not expired). Everything else is refused. Expired is terminal.
 */
export function checkApprovalDecision(decision: ApprovalDecision, ctx: ApprovalContext): ApprovalCheck {
  if (ctx.info.trigger !== 'schedule' || ctx.info.approval_status === null) {
    return { ok: false, reason: 'not_scheduled', httpStatus: 409, message: 'This recommendation is not awaiting approval' }
  }
  const status = effectiveApprovalStatus(ctx.info, ctx.now)
  if (status === 'expired') {
    return { ok: false, reason: 'expired', httpStatus: 409, message: 'The approval window has expired' }
  }
  if (status !== 'pending') {
    return { ok: false, reason: 'not_pending', httpStatus: 409, message: `Already ${status}` }
  }
  if (decision === 'reject') return { ok: true, next: 'rejected' }

  if (!ctx.isLatest) {
    return { ok: false, reason: 'not_latest', httpStatus: 409, message: 'A newer recommendation exists — this one can no longer be executed' }
  }
  if (ctx.hasBlockingExecution) {
    return { ok: false, reason: 'already_executed', httpStatus: 409, message: 'Recommendation already executed' }
  }
  if (ctx.tradingPaused) {
    return { ok: false, reason: 'trading_paused', httpStatus: 423, message: 'Trading is paused — resume it in Portfolio Settings first' }
  }
  return { ok: true, next: 'approved' }
}

/** Info after a decision. */
export function applyApprovalDecision(
  info: AutopilotInfo,
  next: 'approved' | 'rejected',
  now: Date,
  executionId: string | null,
): AutopilotInfo {
  return { ...info, approval_status: next, approval_decided_at: now.toISOString(), execution_id: executionId ?? info.execution_id }
}

/** Auto mode executes only SCHEDULED runs that completed while the mode was 'auto' and the mode is still 'auto'. */
export function shouldAutoExecute(info: AutopilotInfo, currentMode: AutopilotMode): boolean {
  return info.trigger === 'schedule' && info.mode === 'auto' && currentMode === 'auto'
}

/** The pending approval card is shown only for a still-pending, unexecuted scheduled recommendation. */
export function isAwaitingApproval(info: AutopilotInfo, now: Date, hasBlockingExecution: boolean): boolean {
  return info.trigger === 'schedule' && effectiveApprovalStatus(info, now) === 'pending' && !hasBlockingExecution
}

/** Columns written best-effort alongside agent_outputs.autopilot. */
export function autopilotColumns(info: AutopilotInfo): Record<string, unknown> {
  return {
    run_trigger:         info.trigger,
    approval_status:     info.approval_status,
    approval_expires_at: info.approval_expires_at,
    approval_decided_at: info.approval_decided_at,
  }
}
