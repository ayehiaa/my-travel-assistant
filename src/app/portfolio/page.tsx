import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import PortfolioTosGate from '@/components/portfolio/PortfolioTosGate'
import HubTabs from '@/components/portfolio/hub/HubTabs'
import OverviewTab from '@/components/portfolio/hub/OverviewTab'
import RebalanceTab from '@/components/portfolio/hub/RebalanceTab'
import ActivityTab from '@/components/portfolio/hub/ActivityTab'
import SettingsTab from '@/components/portfolio/hub/SettingsTab'
import { TabSkeleton } from '@/components/portfolio/hub/HubSkeletons'
import { parseChartPeriod, parseHubTab, parsePage, HUB_TAB_LABELS } from '@/lib/portfolioHub'
import { ACTIVITY_MAX_PAGES, parseActivityFilter } from '@/lib/activityTimeline'

export const metadata = {
  title: 'Sojourn — Portfolio',
}

/** Portfolio trading hub: /portfolio?tab=overview|rebalance|activity|settings (specs/025-portfolio-trading-hub). */
export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams

  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (user.role !== 'premium_plus') redirect('/')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('portfolio_tos_accepted_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.portfolio_tos_accepted_at) {
    return <PortfolioTosGate />
  }

  // Ensure the settings row exists (risk profile, target return) — the analysis run and the settings tab read it
  await supabase
    .from('portfolio_settings')
    .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })

  const tab = parseHubTab(params.tab)
  const period = parseChartPeriod(params.period)
  const filter = parseActivityFilter(params.filter)
  const page = parsePage(params.page, ACTIVITY_MAX_PAGES)

  return (
    <main className="mx-auto max-w-[960px] px-4 pb-28 pt-6 md:px-6 md:pb-12 md:pt-10">
      <div className="mb-4 flex items-end justify-between gap-3 md:mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink)] md:text-3xl" style={{ fontFamily: 'var(--display)' }}>
            Portfolio
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            {tab === 'overview' && 'Your account, read live from Alpaca.'}
            {tab === 'rebalance' && 'Review the latest analysis and act on it.'}
            {tab === 'activity' && 'Everything that happened, newest first.'}
            {tab === 'settings' && 'Targets, autopilot, safety, notifications, your Alpaca connection and your Claude API key.'}
          </p>
        </div>
      </div>

      <HubTabs active={tab} />

      <h2 className="sr-only">{HUB_TAB_LABELS[tab]}</h2>
      <Suspense key={`${tab}:${tab === 'activity' ? `${filter}:${page}` : ''}`} fallback={<TabSkeleton tab={tab} />}>
        {tab === 'overview' && <OverviewTab userId={user.id} email={user.email} period={period} />}
        {tab === 'rebalance' && <RebalanceTab userId={user.id} />}
        {tab === 'activity' && <ActivityTab userId={user.id} filter={filter} page={page} />}
        {tab === 'settings' && <SettingsTab userId={user.id} email={user.email} />}
      </Suspense>
    </main>
  )
}
