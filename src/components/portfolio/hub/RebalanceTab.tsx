import RebalanceView from './RebalanceView'
import RunAnalysisPanel from './RunAnalysisPanel'
import { createClient } from '@/lib/supabase/server'
import { getLatestCompleteRecommendation, getSettingsRow } from '@/lib/portfolioHubData'
import { executionBlocksNewRequest, normalizeExecution } from '@/lib/tradeExecution'
import { readSafetySettings } from '@/lib/riskLimits'
import { inProgressRunId } from '@/lib/portfolioHub'
import type { Recommendation } from '@/types/database'

/** Rebalance tab: run a new analysis, then review / approve / execute the latest complete recommendation. */
export default async function RebalanceTab({ userId }: { userId: string }) {
  const supabase = await createClient()
  const [latest, settingsRow, latestAnyRes, credRes] = await Promise.all([
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
  ])

  const execRes = latest
    ? await supabase.from('alpaca_executions').select('*').eq('recommendation_id', latest.id as string).maybeSingle()
    : { data: null }

  const safety = readSafetySettings(settingsRow)
  const lastRunAt = typeof settingsRow?.last_run_at === 'string' ? settingsRow.last_run_at : null
  const running = inProgressRunId(latestAnyRes.data as { id: string; status: string; run_at: string } | null, new Date())

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Analysis</h3>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            7 specialist agents, a synthesizer and Shariah screening. Runs at most once every 24 hours.
          </p>
        </div>
        <RunAnalysisPanel lastRunAt={lastRunAt} initialRunId={running} />
      </section>

      {latest ? (
        <RebalanceView
          recommendation={latest as unknown as Recommendation}
          isLatest
          hasCredentials={!!credRes.data}
          isPaper={credRes.data?.is_paper ?? true}
          execution={execRes.data ? normalizeExecution(execRes.data) : null}
          hasBlockingExecution={execRes.data !== null && executionBlocksNewRequest(execRes.data.orders)}
          safety={safety}
        />
      ) : (
        <div className="rounded-xl border-2 border-dashed border-[var(--rule)] px-6 py-12 text-center text-sm text-[var(--ink-3)]">
          No analysis yet. Run one to get a target allocation and proposed trades.
        </div>
      )}
    </div>
  )
}
