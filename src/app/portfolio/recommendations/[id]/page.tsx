import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import RebalanceView from '@/components/portfolio/hub/RebalanceView'
import { Recommendation } from '@/types/database'
import { executionBlocksNewRequest, normalizeExecution } from '@/lib/tradeExecution'
import { readSafetySettings } from '@/lib/riskLimits'

export const metadata = { title: 'Sojourn — Portfolio Recommendation' }

/** Deep-link / history view of one recommendation. Renders the same Rebalance components as the hub. */
export default async function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')
  if (authUser.role !== 'premium_plus') redirect('/')

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('portfolio_tos_accepted_at')
    .eq('user_id', authUser.id)
    .maybeSingle()
  if (!profile?.portfolio_tos_accepted_at) redirect('/portfolio')

  const { data: rec } = await supabase
    .from('recommendations')
    .select('*')
    .eq('id', id)
    .eq('user_id', authUser.id)
    .single()

  if (!rec) redirect('/portfolio')

  const [latestRecResult, executionResult, credResult, settingsResult] = await Promise.all([
    supabase
      .from('recommendations')
      .select('id')
      .eq('user_id', authUser.id)
      .eq('status', 'complete')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('alpaca_executions')
      .select('*')
      .eq('recommendation_id', id)
      .maybeSingle(),
    supabase
      .from('alpaca_credentials')
      .select('is_paper')
      .eq('user_id', authUser.id)
      .maybeSingle(),
    supabase
      .from('portfolio_settings')
      .select('*')
      .eq('user_id', authUser.id)
      .maybeSingle(),
  ])

  const isLatest = latestRecResult.data?.id === id

  return (
    <main className="mx-auto max-w-[960px] px-4 pb-12 pt-6 md:px-6 md:pt-10">
      <Link href="/portfolio?tab=activity" className="text-sm font-semibold text-[var(--blue-700)]">
        ← Portfolio activity
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-[var(--ink)] md:text-3xl" style={{ fontFamily: 'var(--display)' }}>
        Portfolio Recommendation
      </h1>
      {isLatest && (
        <p className="mb-4 text-sm text-[var(--ink-3)]">
          This is your latest recommendation — it is also shown in{' '}
          <Link href="/portfolio?tab=rebalance" className="font-semibold text-[var(--blue-700)] underline">Rebalance</Link>.
        </p>
      )}
      <RebalanceView
        recommendation={rec as Recommendation}
        isLatest={isLatest}
        hasCredentials={!!credResult.data}
        isPaper={credResult.data?.is_paper ?? true}
        execution={executionResult.data ? normalizeExecution(executionResult.data) : null}
        hasBlockingExecution={executionResult.data !== null && executionBlocksNewRequest(executionResult.data.orders)}
        safety={readSafetySettings(settingsResult.data as Record<string, unknown> | null)}
      />
    </main>
  )
}
