import { z } from 'zod'
import { NonRetriableError } from 'inngest'
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAlpacaCredentials } from '@/lib/alpacaLivePortfolio'
import { fetchWeeklyEquityHistory } from '@/lib/alpacaClient'
import { readShariahScreening } from '@/lib/shariahRules'
import { effectiveApprovalStatus, readAutopilotInfo } from '@/lib/autopilot'
import { executionBlocksNewRequest, normalizeExecution, isTerminalExecutionStatus } from '@/lib/tradeExecution'
import { loadSafetySettings } from '@/lib/tradingSafety'
import { EXECUTION_COMPLETED_EVENT } from '@/lib/tradeExecutionRequest'
import { nyDateString } from '@/lib/schedule'
import { sendNotification, type SendResult } from '@/lib/notifications/send'
import { notificationEvent } from '@/lib/notifications/emit'
import { writeNotificationLog } from '@/lib/notifications/log'
import { detectDivestments } from '@/lib/notifications/divest'
import { isNotificationEnabled, readNotificationPrefs } from '@/lib/notifications/prefs'
import {
  computeWeeklyChange,
  executionNotificationType,
  orderOutcomeLines,
  shariahHoldingsStatus,
  topTrades,
  tradeCount,
} from '@/lib/notifications/summary'
import {
  APPROVAL_PENDING_EVENT,
  NOTIFICATION_SEND_EVENT,
  NOTIFICATION_TYPES,
  WEEKLY_SUMMARY_EVENT,
  type NotificationPayloads,
  type NotificationType,
  type WeeklySummaryPayload,
} from '@/lib/notifications/types'
import type { ActionItem, ExecutionStatus, PortfolioSnapshot } from '@/types/database'

/**
 * Email notifications (specs/023-trading-notifications).
 *
 * Producers (run/execution/approval/pause events, weekly cron) only SEND `notifications/send` events; the single
 * `deliverNotification` function delivers them with retries and an idempotency key per (type, entity). Every function
 * here is separate from the analysis run and the execution engine, so a notification failure can never fail either.
 */

type SendEvent = ReturnType<typeof notificationEvent>

const DeliverEventSchema = z.object({
  user_id:         z.string().uuid(),
  type:            z.enum(NOTIFICATION_TYPES),
  entity_id:       z.string().min(1).max(200),
  idempotency_key: z.string().min(1).max(256),
  payload:         z.record(z.string(), z.unknown()),
})

// ── Delivery ────────────────────────────────────────────────────────────────

export const deliverNotification = inngest.createFunction(
  {
    id:          'deliver-notification',
    triggers:    [{ event: NOTIFICATION_SEND_EVENT }],
    retries:     4,
    idempotency: 'event.data.user_id + "-" + event.data.idempotency_key',
    concurrency: { key: 'event.data.user_id', limit: 2 },
    onFailure: async ({ event }) => {
      const original = (event.data as { event?: { data?: unknown } } | undefined)?.event?.data
      const parsed = DeliverEventSchema.safeParse(original)
      if (!parsed.success) return
      await writeNotificationLog({
        userId:   parsed.data.user_id,
        type:     parsed.data.type,
        entityId: parsed.data.entity_id,
        status:   'failed',
        error:    'Delivery failed after retries',
      })
    },
  },
  async ({ event, step }) => {
    const parsed = DeliverEventSchema.safeParse(event.data)
    if (!parsed.success) throw new NonRetriableError('Invalid notification event')
    const { user_id, type, entity_id, payload } = parsed.data
    return step.run('send-email', async (): Promise<SendResult> => sendNotification(
      user_id,
      type,
      payload as unknown as NotificationPayloads[NotificationType],
      { entityId: entity_id },
    ))
  },
)

// ── Run completed → run_completed, approval_needed (+ expiry watch), shariah_status_change ──

const RunCompletedSchema = z.object({
  run_id:  z.string().uuid(),
  user_id: z.string().uuid(),
  trigger: z.enum(['manual', 'schedule']).optional().default('manual'),
})

type ApprovalPendingData = { run_id: string; user_id: string; expires_at: string }

export const notifyRunCompleted = inngest.createFunction(
  {
    id:          'notify-run-completed',
    triggers:    [{ event: 'portfolio/run.completed' }],
    retries:     2,
    idempotency: 'event.data.run_id',
  },
  async ({ event, step }) => {
    const parsed = RunCompletedSchema.safeParse(event.data)
    if (!parsed.success) return { sent: 0 }
    const { run_id, user_id, trigger } = parsed.data

    const plan = await step.run('build-notifications', async (): Promise<{ events: SendEvent[]; approval: ApprovalPendingData | null }> => {
      const admin = createAdminClient()
      const { data: rec } = await admin
        .from('recommendations')
        .select('*')
        .eq('id', run_id)
        .eq('user_id', user_id)
        .maybeSingle()
      if (!rec || rec.status !== 'complete') return { events: [], approval: null }

      const actionList = (rec.action_list ?? []) as ActionItem[]
      const snapshot = rec.portfolio_snapshot as PortfolioSnapshot | null
      const trades = topTrades(actionList, 5)
      const count = tradeCount(actionList)
      const events: SendEvent[] = []

      events.push(notificationEvent(user_id, 'run_completed', run_id, {
        recommendation_id: run_id,
        trigger,
        summary:           typeof rec.summary_text === 'string' ? rec.summary_text : null,
        total_value_usd:   typeof snapshot?.total_value_usd === 'number' ? snapshot.total_value_usd : null,
        top_trades:        trades,
        trade_count:       count,
      }))

      let approval: ApprovalPendingData | null = null
      const info = readAutopilotInfo(rec as Record<string, unknown>)
      if (info.trigger === 'schedule' && info.approval_expires_at && effectiveApprovalStatus(info, new Date()) === 'pending') {
        const safety = await loadSafetySettings(user_id)
        events.push(notificationEvent(user_id, 'approval_needed', run_id, {
          recommendation_id: run_id,
          expires_at:        info.approval_expires_at,
          trade_count:       count,
          top_trades:        trades,
          dry_run:           safety.dry_run,
        }))
        approval = { run_id, user_id, expires_at: info.approval_expires_at }
      }

      // Divest: compare this run's screening with the previous complete recommendation's stored screening.
      const current = readShariahScreening(rec as Record<string, unknown>)
      if (current) {
        const { data: prev } = await admin
          .from('recommendations')
          .select('*')
          .eq('user_id', user_id)
          .eq('status', 'complete')
          .neq('id', run_id)
          .lt('run_at', rec.run_at as string)
          .order('run_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const items = detectDivestments(readShariahScreening(prev as Record<string, unknown> | null), current, actionList)
        if (items.length > 0) {
          events.push(notificationEvent(user_id, 'shariah_status_change', run_id, { recommendation_id: run_id, items }))
        }
      }

      return { events, approval }
    })

    if (plan.events.length > 0) await step.sendEvent('send-notifications', plan.events)
    if (plan.approval) {
      await step.sendEvent('watch-approval-expiry', {
        id:   `approval-pending-${plan.approval.run_id}`,
        name: APPROVAL_PENDING_EVENT,
        data: plan.approval,
      })
    }
    return { sent: plan.events.length }
  },
)

// ── Approval expiry ─────────────────────────────────────────────────────────

const ApprovalPendingSchema = z.object({
  run_id:     z.string().uuid(),
  user_id:    z.string().uuid(),
  expires_at: z.string().refine(s => Number.isFinite(Date.parse(s)), 'invalid date'),
})

export const approvalExpiryWatch = inngest.createFunction(
  {
    id:          'approval-expiry-watch',
    triggers:    [{ event: APPROVAL_PENDING_EVENT }],
    retries:     2,
    idempotency: 'event.data.run_id',
  },
  async ({ event, step }) => {
    const parsed = ApprovalPendingSchema.safeParse(event.data)
    if (!parsed.success) return { status: 'invalid_event' }
    const { run_id, user_id, expires_at } = parsed.data

    await step.sleepUntil('wait-for-expiry', new Date(expires_at))

    const evt = await step.run('check-still-pending', async (): Promise<SendEvent | null> => {
      const admin = createAdminClient()
      const { data: rec } = await admin
        .from('recommendations')
        .select('*')
        .eq('id', run_id)
        .eq('user_id', user_id)
        .maybeSingle()
      if (!rec) return null
      const info = readAutopilotInfo(rec as Record<string, unknown>)
      // Stored status still 'pending' = nobody approved or rejected it in time.
      if (info.approval_status !== 'pending') return null
      if (effectiveApprovalStatus(info, new Date()) !== 'expired') return null
      const { data: existing } = await admin
        .from('alpaca_executions')
        .select('id, orders')
        .eq('recommendation_id', run_id)
        .eq('user_id', user_id)
        .maybeSingle()
      if (existing && executionBlocksNewRequest(existing.orders)) return null
      return notificationEvent(user_id, 'approval_expired', run_id, {
        recommendation_id: run_id,
        expired_at:        info.approval_expires_at ?? expires_at,
      })
    })

    if (!evt) return { status: 'not_pending' }
    await step.sendEvent('send-expired', evt)
    return { status: 'notified' }
  },
)

// ── Execution finished ──────────────────────────────────────────────────────

const ExecutionCompletedSchema = z.object({
  execution_id:      z.string().uuid(),
  user_id:           z.string().uuid(),
  recommendation_id: z.string().uuid(),
  status:            z.string(),
})

export const notifyExecutionCompleted = inngest.createFunction(
  {
    id:          'notify-execution-completed',
    triggers:    [{ event: EXECUTION_COMPLETED_EVENT }],
    retries:     2,
    idempotency: 'event.data.execution_id + "-" + event.data.status',
  },
  async ({ event, step }) => {
    const parsed = ExecutionCompletedSchema.safeParse(event.data)
    if (!parsed.success) return { sent: false }
    const { execution_id, user_id, recommendation_id, status } = parsed.data

    const evt = await step.run('build-notification', async (): Promise<SendEvent | null> => {
      const { data: row } = await createAdminClient()
        .from('alpaca_executions')
        .select('id, recommendation_id, user_id, executed_at, is_paper, orders')
        .eq('id', execution_id)
        .eq('user_id', user_id)
        .maybeSingle()
      if (!row || row.recommendation_id !== recommendation_id) return null
      const exec = normalizeExecution(row)
      // The stored status wins when it is terminal; otherwise trust the event.
      const finalStatus: string = isTerminalExecutionStatus(exec.status) ? exec.status : status
      const type = executionNotificationType(finalStatus as ExecutionStatus)
      if (!type) return null
      return notificationEvent(user_id, type, execution_id, {
        execution_id,
        recommendation_id,
        status:        finalStatus,
        dry_run:       exec.dry_run,
        is_paper:      exec.is_paper,
        error_message: exec.error_message,
        orders:        orderOutcomeLines(exec.orders),
      })
    })

    if (!evt) return { sent: false }
    await step.sendEvent('send-execution-notification', evt)
    return { sent: true }
  },
)

// ── Weekly summary ──────────────────────────────────────────────────────────

/** Fridays 17:00 New York time — after the 16:00 close (DST handled by the TZ prefix). */
export const WEEKLY_SUMMARY_CRON = 'TZ=America/New_York 0 17 * * 5'

export const weeklySummaryCron = inngest.createFunction(
  {
    id:          'weekly-summary-cron',
    triggers:    [{ cron: WEEKLY_SUMMARY_CRON }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    const date = nyDateString(new Date())
    const userIds = await step.run('find-users', async (): Promise<string[]> => {
      const admin = createAdminClient()
      const { data: creds } = await admin.from('alpaca_credentials').select('user_id')
      const connected = (creds ?? []).map(c => c.user_id as string)
      if (connected.length === 0) return []
      const [roles, settings] = await Promise.all([
        admin.from('user_roles').select('user_id').in('user_id', connected).eq('role', 'premium_plus'),
        admin.from('portfolio_settings').select('*').in('user_id', connected),
      ])
      const premium = new Set((roles.data ?? []).map(r => r.user_id as string))
      const prefsByUser = new Map((settings.data ?? []).map(r => [r.user_id as string, readNotificationPrefs(r as Record<string, unknown>)]))
      return connected.filter(id => premium.has(id) && isNotificationEnabled(prefsByUser.get(id) ?? readNotificationPrefs(null), 'weekly_summary'))
    })
    if (userIds.length === 0) return { date, users: 0 }
    await step.sendEvent('fan-out', userIds.map(user_id => ({
      id:   `weekly-summary-${user_id}-${date}`,
      name: WEEKLY_SUMMARY_EVENT,
      data: { user_id, date },
    })))
    return { date, users: userIds.length }
  },
)

const WeeklyUserSchema = z.object({
  user_id: z.string().uuid(),
  date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const weeklySummaryUser = inngest.createFunction(
  {
    id:          'weekly-summary-user',
    triggers:    [{ event: WEEKLY_SUMMARY_EVENT }],
    retries:     2,
    idempotency: 'event.data.user_id + "-" + event.data.date',
    concurrency: { limit: 5 },
  },
  async ({ event, step }) => {
    const parsed = WeeklyUserSchema.safeParse(event.data)
    if (!parsed.success) return { sent: false }
    const { user_id, date } = parsed.data

    const evt = await step.run('gather', async (): Promise<SendEvent | null> => {
      const admin = createAdminClient()
      const now = new Date()
      const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [recsRes, execRes, latestRes] = await Promise.all([
        admin.from('recommendations').select('*').eq('user_id', user_id).gte('run_at', since).order('run_at', { ascending: true }).limit(50),
        admin.from('alpaca_executions').select('id, recommendation_id, user_id, executed_at, is_paper, orders').eq('user_id', user_id).gte('executed_at', since).order('executed_at', { ascending: true }).limit(50),
        admin.from('recommendations').select('*').eq('user_id', user_id).eq('status', 'complete').order('run_at', { ascending: false }).limit(1).maybeSingle(),
      ])

      const runs: WeeklySummaryPayload['runs'] = (recsRes.data ?? []).map(r => ({
        id:      r.id as string,
        run_at:  r.run_at as string,
        trigger: readAutopilotInfo(r as Record<string, unknown>).trigger,
        status:  String(r.status),
      }))
      const executions: WeeklySummaryPayload['executions'] = (execRes.data ?? []).map(row => {
        const e = normalizeExecution(row)
        return { id: e.id, executed_at: e.executed_at, status: e.status, dry_run: e.dry_run, order_count: e.orders.length }
      })

      // P&L from Alpaca 1W portfolio history. Credentials never leave this step; only equity numbers are used.
      let pnl: WeeklySummaryPayload['pnl'] = null
      try {
        const creds = await loadAlpacaCredentials(user_id)
        if (creds) pnl = computeWeeklyChange(await fetchWeeklyEquityHistory(creds.keyId, creds.secret, creds.isPaper))
      } catch {
        pnl = null
      }

      const shariah = shariahHoldingsStatus(readShariahScreening(latestRes.data as Record<string, unknown> | null))

      return notificationEvent(user_id, 'weekly_summary', `${user_id}-${date}`, {
        week_ending: now.toISOString(),
        runs,
        executions,
        pnl,
        shariah,
      })
    })

    if (!evt) return { sent: false }
    await step.sendEvent('send-weekly-summary', evt)
    return { sent: true }
  },
)
