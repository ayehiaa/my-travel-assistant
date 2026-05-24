import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import AgentsDemoPage from '@/components/agents/AgentsDemoPage'

export const metadata = {
  title: 'Sojourn — Agent Demo',
}

export default async function AgentsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (user.role !== 'premium_plus') redirect('/')

  return <AgentsDemoPage />
}
