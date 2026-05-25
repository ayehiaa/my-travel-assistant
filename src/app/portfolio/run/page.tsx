import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import RunPageClient from '@/components/portfolio/RunPageClient'

export const metadata = { title: 'Sojourn — Run Analysis' }

export default async function RunPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  void (await searchParams)

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
    redirect('/portfolio')
  }

  const { data: settings } = await supabase
    .from('portfolio_settings')
    .select('last_run_at')
    .eq('user_id', user.id)
    .maybeSingle()

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
        Run Analysis
      </h1>
      <p style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 32 }}>
        Trigger an AI analysis of your portfolio across 7 specialist agents.
      </p>
      <RunPageClient lastRunAt={settings?.last_run_at ?? null} />
    </main>
  )
}
