import type { AuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import type { ServerClient } from './store'

/** My Assistant (specs/033) — server helpers shared by the API routes and the page. */

/** The app is UK-based; day boundaries for travel / expenses use London time. Lifestyle tools use the enrolment's. */
export const ASSISTANT_TIMEZONE = 'Europe/London'

/** Whose travel / expenses the assistant reads, and that member's display name for assistant accounts. */
export async function dataScope(supabase: ServerClient, user: AuthUser): Promise<{ dataOwnerId: string; viewingName: string | null }> {
  const dataOwnerId = await getActiveMainAccountId(user)
  if (user.access.accountType !== 'assistant' || dataOwnerId === user.id) return { dataOwnerId, viewingName: null }
  const { data } = await supabase.from('user_roles').select('display_name').eq('user_id', dataOwnerId).maybeSingle()
  return { dataOwnerId, viewingName: typeof data?.display_name === 'string' ? data.display_name.split(' ')[0] : null }
}
