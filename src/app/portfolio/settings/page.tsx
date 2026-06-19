import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PortfolioSettings } from '@/types/database'
import PortfolioSettingsForm from '@/components/portfolio/PortfolioSettingsForm'
import AlpacaCredentialsForm from '@/components/portfolio/AlpacaCredentialsForm'

export const metadata = { title: 'Sojourn — Portfolio Settings' }

export default async function PortfolioSettingsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (user.role !== 'premium_plus') redirect('/')

  const supabase = await createClient()

  // Enforce T&C gate — if not accepted, redirect to portfolio page where gate renders
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('portfolio_tos_accepted_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.portfolio_tos_accepted_at) {
    redirect('/portfolio')
  }

  // Fetch settings; insert defaults on first visit
  const { data: settingsRow } = await supabase
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  let settings = settingsRow as PortfolioSettings | null
  if (!settings) {
    const { data: inserted } = await supabase
      .from('portfolio_settings')
      .insert({ user_id: user.id })
      .select()
      .single()
    settings = inserted as PortfolioSettings | null
  }

  const { data: alpacaCred } = await supabase
    .from('alpaca_credentials')
    .select('is_paper')
    .eq('user_id', user.id)
    .maybeSingle()

  const defaultSettings: PortfolioSettings = {
    user_id: user.id,
    cash_usd: 0,
    target_return_pct: 10,
    risk_profile: 'moderate',
    run_interval_days: 30,
    last_run_at: null,
    next_run_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
      <h1
        style={{
          fontFamily: 'var(--display)',
          fontWeight: 700,
          fontSize: 28,
          marginBottom: 8,
          color: 'var(--ink)',
        }}
      >
        Portfolio Settings
      </h1>
      <p style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 32 }}>
        Configure your risk preferences and analysis schedule.
      </p>
      <PortfolioSettingsForm initialSettings={settings ?? defaultSettings} />
      <div style={{ marginTop: 32 }}>
        <h2
          style={{
            fontFamily: 'var(--display)',
            fontWeight: 700,
            fontSize: 20,
            color: 'var(--ink)',
            marginBottom: 8,
          }}
        >
          Alpaca Connection
        </h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 16 }}>
          Connect your Alpaca account to execute trades from recommendations.
        </p>
        <AlpacaCredentialsForm
          initialConnected={!!alpacaCred}
          initialIsPaper={alpacaCred?.is_paper ?? true}
        />
      </div>
    </main>
  )
}
