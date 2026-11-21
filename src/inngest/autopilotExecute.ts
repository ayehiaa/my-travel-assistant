import { z } from 'zod'
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { userHasPortfolio } from '@/lib/accessServer'
import { logAudit } from '@/lib/auditLogger'
import { requestExecution } from '@/lib/tradeExecutionRequest'
import { executionBlocksNewRequest } from '@/lib/tradeExecution'
import { readAutopilotSettings } from '@/lib/schedule'
import { readAutopilotInfo, shouldAutoExecute, type AutopilotInfo } from '@/lib/autopilot'
import { latestCompleteRecommendationId, saveAutopilotInfo } from '@/lib/autopilotStore'

/**
 * Autopilot 'auto' mode (specs/022-scheduler-autopilot): when a SCHEDULED run completes and the user's mode is (still)
 * 'auto', request the execution through requestExecution() — the only programmatic entry point, which enforces the
 * trading pause, dry run, risk limits, loss stops and the Shariah buy guard (via the execution engine).
 * Manual runs are never executed automatically. Idempotent per run; one at a time per user.
 */

const RunCompletedSchema = z.object({
  run_id:  z.string().uuid(),
  user_id: z.string().uuid(),
  trigger: z.enum(['manual', 'schedule']).optional().default('manual'),
})

type AutoOutcome = { status: 'requested'; execution_id: string } | { status: 'skipped'; reason: string }

export const autopilotExecute = inngest.createFunction(
  {
    id:          'autopilot-execute',
    triggers:    [{ event: 'portfolio/run.completed' }],
    retries:     1,
    idempotency: 'event.data.run_id',
    concurrency: { key: 'event.data.user_id', limit: 1 },
  },
  async ({ event, step }) => {
    const parsed = RunCompletedSchema.safeParse(event.data)
    if (!parsed.success) return { status: 'skipped', reason: 'invalid_event' }
    const { run_id, user_id, trigger } = parsed.data
    if (trigger !== 'schedule') return { status: 'skipped', reason: 'manual_run' }

    // Single step: an Inngest retry can never request a second execution (and the UNIQUE constraint would refuse it).
    return step.run('auto-execute', async (): Promise<AutoOutcome> => {
      const admin = createAdminClient()

      const { data: rec } = await admin
        .from('recommendations')
        .select('*')
        .eq('id', run_id)
        .eq('user_id', user_id)
        .maybeSingle()
      if (!rec || rec.status !== 'complete') return { status: 'skipped', reason: 'not_complete' }

      const info = readAutopilotInfo(rec as Record<string, unknown>)
      const { data: settingsRow } = await admin
        .from('portfolio_settings')
        .select('*')
        .eq('user_id', user_id)
        .maybeSingle()
      const currentMode = readAutopilotSettings(settingsRow as Record<string, unknown> | null).mode
      if (!shouldAutoExecute(info, currentMode)) return { status: 'skipped', reason: 'not_auto_mode' }

      const record = async (outcome: AutoOutcome): Promise<AutoOutcome> => {
        const next: AutopilotInfo = {
          ...info,
          execution_id:   outcome.status === 'requested' ? outcome.execution_id : info.execution_id,
          auto_execution: {
            status:       outcome.status,
            reason:       outcome.status === 'skipped' ? outcome.reason : null,
            execution_id: outcome.status === 'requested' ? outcome.execution_id : null,
            at:           new Date().toISOString(),
          },
        }
        await saveAutopilotInfo(run_id, user_id, next)
        return outcome
      }

      if (!(await userHasPortfolio(user_id, admin))) return record({ status: 'skipped', reason: 'Portfolio access is not enabled for this account' })

      if ((await latestCompleteRecommendationId(user_id)) !== run_id) {
        return record({ status: 'skipped', reason: 'A newer recommendation exists' })
      }

      const { data: existing } = await admin
        .from('alpaca_executions')
        .select('id, orders')
        .eq('recommendation_id', run_id)
        .eq('user_id', user_id)
        .maybeSingle()
      if (existing && executionBlocksNewRequest(existing.orders)) {
        return record({ status: 'skipped', reason: 'Already executed' })
      }

      const { data: cred } = await admin
        .from('alpaca_credentials')
        .select('is_paper')
        .eq('user_id', user_id)
        .maybeSingle()
      if (!cred) return record({ status: 'skipped', reason: 'No Alpaca account connected' })

      const result = await requestExecution({ userId: user_id, recommendationId: run_id, isPaper: cred.is_paper })
      if (!result.ok) {
        const reason = result.reason === 'trading_paused' ? 'Trading is paused' : `Execution not requested (${result.reason})`
        return record({ status: 'skipped', reason })
      }

      await logAudit({
        performedBy:   user_id,
        action:        'alpaca_executed',
        tripId:        null,
        changedFields: { autopilot: { before: null, after: { mode: 'auto', recommendation_id: run_id, execution_id: result.executionId } } },
      })
      return record({ status: 'requested', execution_id: result.executionId })
    })
  },
)
