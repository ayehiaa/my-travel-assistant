import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { getAiKeyStatus } from '@/lib/aiKeyStore'
import AiKeyCard from '@/components/portfolio/AiKeyCard'
import AssistantPageClient from '@/components/assistant/AssistantPageClient'

export const metadata = {
  title: 'Sojourn — My Assistant',
}

/** My Assistant (specs/033): ask anything about your travel, expenses, lifestyle and portfolio. Every signed-in user. */
export default async function AssistantPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const key = await getAiKeyStatus(user.id, user.email)

  return (
    <AssistantPageClient
      firstName={user.displayName.split(' ')[0] || 'there'}
      serverHasKey={key.connected || key.usingOwnerFallback}
      keySlot={
        <div id="ai-key" className="scroll-mt-24">
          <AiKeyCard
            migrationApplied={key.migrationApplied}
            initialConnected={key.connected}
            initialProvider={key.provider}
            initialLast4={key.last4}
            initialCreatedAt={key.createdAt}
            usingOwnerFallback={key.usingOwnerFallback}
          />
        </div>
      }
    />
  )
}
