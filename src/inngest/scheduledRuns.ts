import { z } from 'zod'
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAlpacaCredentials } from '@/lib/alpacaLivePortfolio'
import { fetchMarketCalendar } from '@/lib/alpacaClient'
import { logAudit } from '@/lib/auditLogger'
import { startAnalysisRun } from '@/lib/startAnalysisRun'
import {
  SCHEDULER_CRON,
  computeNextRunAt,
  isScheduledRunDue,
  isTradingDayFromCalendar,
  nyDateString,
  readAutopilotSettings,
} from '@/lib/schedule'

/**
 * Scheduled analysis runs (specs/022-scheduler-autopilot).
 *
 * 1. `scheduledRunsCron` fires on weekdays at 10:30 New York time, finds users with autopilot on (mode ≠ 'off'),
 *    a run due, the premium_plus role and Alpaca connected, and fans out one event per user (event id = user + date).
 * 2. `scheduledUserRun` handles one user: re-checks everything, confirms today is a trading day with the user's OWN
 *    Alpaca credentials (/v2/calendar — skips holidays), then starts the run through startAnalysisRun() (the same code
 *    as POST /api/portfolio/run) and moves next_run_at forward. Idempotent per user per date; one at a time per user.
 *
 * startAnalysisRun() also refuses users without an Anthropic API key (reason 'no_ai_key', specs/026) — skipped, stays due.
 *
 * Nothing here places orders. What happens after the run completes depends on the mode — see autopilotExecute.ts.
 */

export const SCHEDULED_RUN_EVENT = 'portfolio/scheduled-run.requested'

const UserRunEventSchema = z.object({
  user_id: z.string().uuid(),
  date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const scheduledRunsCron = inngest.createFunction(
  {
    id:          'scheduled-runs-cron',
    triggers:    [{ cron: SCHEDULER_CRON }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    const date = nyDateString(new Date())

    const userIds = await step.run('find-due-users', async (): Promise<string[]> => {
      const admin = createAdminClient()
      const now = new Date()
      // select('*') so this works before migration 20261120d (missing autopilot_mode → 'off' → nobody runs).
      const { data: rows, error } = await admin.from('portfolio_settings').select('*')
      if (error || !rows) return []

      const due = rows
        .filter(r => isScheduledRunDue(readAutopilotSettings(r as Record<string, unknown>), now))
        .map(r => r.user_id as string)
      if (due.length === 0) return []

      const [roles, creds] = await Promise.all([
        admin.from('user_roles').select('user_id').in('user_id', due).eq('role', 'premium_plus'),
        admin.from('alpaca_credentials').select('user_id').in('user_id', due),
      ])
      const premium = new Set((roles.data ?? []).map(r => r.user_id as string))
      const connected = new Set((creds.data ?? []).map(r => r.user_id as string))
      return due.filter(id => premium.has(id) && connected.has(id))
    })

    if (userIds.length === 0) return { date, users: 0 }

    await step.sendEvent('fan-out', userIds.map(user_id => ({
      id:   `scheduled-run-${user_id}-${date}`,
      name: SCHEDULED_RUN_EVENT,
      data: { user_id, date },
    })))

    return { date, users: userIds.length }
  },
)

type UserRunOutcome =
  | { started: true; run_id: string; next_run_at: string }
  | { started: false; reason: string }

export const scheduledUserRun = inngest.createFunction(
  {
    id:          'scheduled-user-run',
    triggers:    [{ event: SCHEDULED_RUN_EVENT }],
    retries:     1,
    idempotency: 'event.data.user_id + "-" + event.data.date',
    concurrency: { key: 'event.data.user_id', limit: 1 },
  },
  async ({ event, step }) => {
    const parsed = UserRunEventSchema.safeParse(event.data)
    if (!parsed.success) return { started: false, reason: 'invalid_event' }
    const { user_id, date } = parsed.data

    // One step for the whole start so an Inngest retry can never create a second run.
    const outcome = await step.run('start-scheduled-run', async (): Promise<UserRunOutcome> => {
      const admin = createAdminClient()
      const now = new Date()

      // Only today's event may start a run (a delayed event from a previous day is dropped).
      if (nyDateString(now) !== date) return { started: false, reason: 'stale_event' }

      const { data: settingsRow } = await admin
        .from('portfolio_settings')
        .select('*')
        .eq('user_id', user_id)
        .maybeSingle()
      const settings = readAutopilotSettings(settingsRow as Record<string, unknown> | null)
      if (!isScheduledRunDue(settings, now)) return { started: false, reason: 'not_due' }

      const { data: role } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', user_id)
        .maybeSingle()
      if (role?.role !== 'premium_plus') return { started: false, reason: 'not_premium_plus' }

      const creds = await loadAlpacaCredentials(user_id)
      if (!creds) return { started: false, reason: 'no_credentials' }

      // NYSE holiday check with the user's own credentials. Any failure → skip (stays due for the next fire).
      try {
        const calendar = await fetchMarketCalendar(creds.keyId, creds.secret, creds.isPaper, date, date)
        if (!isTradingDayFromCalendar(calendar, date)) return { started: false, reason: 'market_closed' }
      } catch {
        return { started: false, reason: 'calendar_unavailable' }
      }

      const result = await startAnalysisRun({ userId: user_id, trigger: 'schedule', now })
      if (!result.ok) return { started: false, reason: result.reason }

      const nextRunAt = computeNextRunAt(now, settings.run_interval_days).toISOString()
      await admin.from('portfolio_settings').update({ next_run_at: nextRunAt }).eq('user_id', user_id)
      await logAudit({ performedBy: user_id, action: 'run_triggered', tripId: null })
      return { started: true, run_id: result.runId, next_run_at: nextRunAt }
    })

    return outcome
  },
)
