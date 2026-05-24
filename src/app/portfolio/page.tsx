import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import PortfolioTosGate from '@/components/portfolio/PortfolioTosGate'

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

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface)' }}>
      <div className="text-center">
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 32, color: 'var(--ink)' }}>
          Portfolio
        </h1>
        <p className="mt-2" style={{ color: 'var(--ink-muted)', fontSize: 16 }}>
          Your portfolio dashboard is coming soon.
        </p>
      </div>
    </main>
  )
}
