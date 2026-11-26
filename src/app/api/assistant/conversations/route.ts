import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getAiKeyStatus } from '@/lib/aiKeyStore'
import { enabledAreas } from '@/lib/assistant/areas'
import { AssistantStoreError, listConversations } from '@/lib/assistant/store'

/**
 * GET /api/assistant/conversations — My Assistant (specs/033): the user's conversations (newest first) plus what the
 * chat UI needs to render its state: whether an AI key resolves, the areas a new chat gets, migration status.
 */
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const keyStatus = await getAiKeyStatus(user.id, user.email)
  const base = { hasKey: keyStatus.connected || keyStatus.usingOwnerFallback, areas: enabledAreas(user.access) }
  try {
    const conversations = await listConversations(supabase, user.id)
    return NextResponse.json({ ...base, migrationMissing: false, conversations })
  } catch (err) {
    if (err instanceof AssistantStoreError && err.migrationMissing) {
      return NextResponse.json({ ...base, migrationMissing: true, conversations: [] })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
