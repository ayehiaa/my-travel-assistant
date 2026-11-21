import Link from 'next/link'
import RebalanceView from './RebalanceView'
import RunAnalysisPanel from './RunAnalysisPanel'
import { createClient } from '@/lib/supabase/server'
import { getLatestCompleteRecommendation, getLiveState, getSettingsRow } from '@/lib/portfolioHubData'
import { executionBlocksNewRequest, normalizeExecution } from '@/lib/tradeExecution'
import { readSafetySettings } from '@/lib/riskLimits'
import { readAutopilotSettings } from '@/lib/schedule'
import { AUTOPILOT_MODE_LABEL, formatNextRunShort } from '@/lib/portfolioStatusStrip'
import { computeAllocationDrift, inProgressRunId, settingsHref } from '@/lib/portfolioHub'
import type { Recommendation, TargetAllocationItem } from '@/types/database'

/**
 * Rebalance tab (specs/028 order): pending approval (inside the view) → latest recommendation → run analysis now +
 * a one-line autopilot status.
 */
export default async function RebalanceTab({ userId }: { userId: string }) {
  const supabase = await createClient()
  const [latest, settingsRow, latestAnyRes, credRes, live] = await Promise.all([
    getLatestCompleteRecommendation(userId),
    getSettingsRow(userId),
    supabase
      .from('recommendations')
      .select('id, status, run_at')
      .eq('user_id', userId)
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('alpaca_credentials').select('is_paper').eq('user_id', userId).maybeSingle(),
    getLiveState(userId),
  ])

  const execRes = latest
    ? await supabase.from('alpaca_executions').select('*').eq('recommendation_id', latest.id as string).maybeSingle()
    : { data: null }

  const safety = readSafetySettings(settingsRow)
  const autopilot = readAutopilotSettings(settingsRow)
  const lastRunAt = typeof settingsRow?.last_run_at === 'string' ? settingsRow.last_run_at : null
  const running = inProgressRunId(latestAnyRes.data as { id: string; status: string; run_at: string } | null, new Date())

  // Current vs target with live weights (moved here from the Overview); analysis-time weights when Alpaca is unreachable
  const target = (latest?.target_allocation as TargetAllocationItem[] | null | undefined) ?? null
  const liveAllocation = latest && target && live.portfolio
    ? {
        rows: computeAllocationDrift(live.portfolio.holdings, live.portfolio.cash_usd, target),
        note: 'Current weights live from Alpaca; target from this analysis.',
      }
    : null

  const nextRun = formatNextRunShort(autopilot.next_run_at)

  return (
    <div className="min-w-0 space-y-4">
      {latest ? (
        <RebalanceView
          recommendation={latest as unknown as Recommendation}
          isLatest
          hasCredentials={!!credRes.data}
          isPaper={credRes.data?.is_paper ?? true}
          execution={execRes.data ? normalizeExecution(execRes.data) : null}
          hasBlockingExecution={execRes.data !== null && executionBlocksNewRequest(execRes.data.orders)}
          safety={safety}
          liveAllocation={liveAllocation}
        />
      ) : (
        <div className="rounded-xl border-2 border-dashed border-[var(--rule)] px-6 py-10 text-center">
          <p className="font-semibold text-[var(--ink-2)]">No analysis yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--ink-3)]">
            Run one below to get a target allocation, proposed trades and Shariah screening.
          </p>
        </div>
      )}

      <section className="min-w-0 space-y-3 rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5" aria-labelledby="run-heading">
        <div>
          <h3 id="run-heading" className="text-sm font-semibold text-[var(--ink)]">Run analysis now</h3>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            7 specialist agents, a synthesizer and Shariah screening. Runs at most once every 24 hours.
          </p>
        </div>
        <RunAnalysisPanel lastRunAt={lastRunAt} initialRunId={running} />
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-[var(--rule-soft)] pt-3 text-xs text-[var(--ink-3)]">
          <span>
            <span className="font-semibold text-[var(--ink-2)]">Autopilot:</span> {AUTOPILOT_MODE_LABEL[autopilot.mode]}
            {autopilot.mode !== 'off' && ` · next run ${nextRun ?? 'next trading day 10:30 NY'}`}
          </span>
          <Link href={settingsHref('automation')} className="font-semibold text-[var(--blue-700)]">
            Change in Settings → Automation
          </Link>
        </p>
      </section>
    </div>
  )
}
