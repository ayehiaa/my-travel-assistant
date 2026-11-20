import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { loadAlpacaCredentials, fetchLivePortfolio } from '@/lib/alpacaLivePortfolio'
import PortfolioTosGate from '@/components/portfolio/PortfolioTosGate'
import PortfolioOverview from '@/components/portfolio/PortfolioOverview'
import TradingStatusBanner from '@/components/portfolio/TradingStatusBanner'
import { readSafetySettings } from '@/lib/riskLimits'
import type { LivePortfolio } from '@/types/database'

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

  // Ensure the settings row exists (risk profile, target return) — the analysis run reads it
  await supabase
    .from('portfolio_settings')
    .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })

  // select('*') so the page works before the safety migration is applied (defaults: dry run on, not paused)
  const { data: settingsRow } = await supabase
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  const safety = readSafetySettings(settingsRow as Record<string, unknown> | null)

  const latestRecRes = await supabase
    .from('recommendations')
    .select('id, run_at, summary_text')
    .eq('user_id', user.id)
    .eq('status', 'complete')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // The whole account is read live from Alpaca — nothing about holdings or cash is stored in the app
  const creds = await loadAlpacaCredentials(user.id)
  let portfolio: LivePortfolio | null = null
  let liveError = false
  if (creds) {
    try {
      portfolio = await fetchLivePortfolio(creds)
    } catch {
      liveError = true
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
        Your holdings and cash, read live from your Alpaca account.
      </p>
      <TradingStatusBanner safety={safety} />
      <PortfolioOverview
        connected={creds !== null}
        portfolio={portfolio}
        liveError={liveError}
        latestRecommendation={latestRecRes.data ?? null}
      />
    </main>
  )
}
