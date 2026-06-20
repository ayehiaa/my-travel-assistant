import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { syncAlpacaPositionsForUser } from '@/lib/alpacaPortfolioSync'
import PortfolioTosGate from '@/components/portfolio/PortfolioTosGate'
import PortfolioOverview from '@/components/portfolio/PortfolioOverview'
import { PortfolioHolding, PortfolioSettings } from '@/types/database'

export const metadata = {
  title: 'Sojourn — Portfolio',
}

export default async function PortfolioPage() {
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

  // Fetch holdings, settings, and latest recommendation in parallel
  const [holdingsRes, settingsRes, recRes] = await Promise.all([
    supabase
      .from('portfolio_holdings')
      .select('*')
      .eq('user_id', user.id)
      .order('total_value_usd', { ascending: false }),
    supabase
      .from('portfolio_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('recommendations')
      .select('id, run_at, summary_text')
      .eq('user_id', user.id)
      .eq('status', 'complete')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  let settings = settingsRes.data as PortfolioSettings | null
  if (!settings) {
    // First visit: insert default row
    const { data: inserted } = await supabase
      .from('portfolio_settings')
      .insert({ user_id: user.id })
      .select()
      .single()
    settings = inserted as PortfolioSettings | null
  }

  const defaultSettings: PortfolioSettings = {
    user_id: user.id,
    cash_usd: 0,
    target_return_pct: 10,
    target_horizon: 'annual',
    risk_profile: 'moderate',
    run_interval_days: 30,
    last_run_at: null,
    next_run_at: null,
    last_synced_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // Sync Alpaca positions if connected; admin client usage is encapsulated in the lib function
  let holdings = (holdingsRes.data ?? []) as PortfolioHolding[]
  let syncError = false
  let lastSyncedAt: string | null = null

  const syncResult = await syncAlpacaPositionsForUser(user.id)
  const hasAlpaca = syncResult.hasAlpaca

  if (syncResult.hasAlpaca) {
    if (syncResult.ok) {
      lastSyncedAt = syncResult.lastSyncedAt
      // FR-015: re-query holdings after sync for fresh DB state
      const { data: freshHoldings } = await supabase
        .from('portfolio_holdings')
        .select('*')
        .eq('user_id', user.id)
        .order('total_value_usd', { ascending: false })
      holdings = (freshHoldings ?? []) as PortfolioHolding[]
    } else {
      syncError = true
      lastSyncedAt = settings?.last_synced_at ?? null
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
      <h1
        style={{
          fontFamily: 'var(--display)',
          fontWeight: 700,
          fontSize: 32,
          marginBottom: 8,
          color: 'var(--ink)',
        }}
      >
        Portfolio
      </h1>
      <p style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 32 }}>
        Manage your US stock holdings and cash position.
      </p>
      <PortfolioOverview
        initialHoldings={holdings}
        initialSettings={settings ?? defaultSettings}
        latestRecommendation={recRes.data ?? null}
        lastSyncedAt={lastSyncedAt}
        syncError={syncError}
        hasAlpaca={hasAlpaca}
      />
    </main>
  )
}
