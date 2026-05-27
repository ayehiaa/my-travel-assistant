import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import RecommendationDetail from '@/components/portfolio/RecommendationDetail'
import { Recommendation } from '@/types/database'

export const metadata = { title: 'Sojourn — Portfolio Recommendation' }

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
  const { data: rec } = await supabase
    .from('recommendations')
    .select('*')
    .eq('id', id)
    .eq('user_id', authUser.id)
    .single()

  if (!rec) redirect('/portfolio')

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
      <h1
        style={{
          fontFamily: 'var(--display)',
          fontWeight: 700,
          fontSize: 32,
          marginBottom: 32,
          color: 'var(--ink)',
        }}
      >
        Portfolio Recommendation
      </h1>
      <RecommendationDetail recommendation={rec as Recommendation} />
    </main>
  )
}
