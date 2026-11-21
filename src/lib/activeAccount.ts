import { cookies } from 'next/headers'
import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'
import type { AccountType } from './access'

export const ACTIVE_ACCOUNT_COOKIE = 'active_main_account'

/** The account whose data the user acts on: members → themselves; assistants → the active linked member account. */
export async function getActiveMainAccountId(user: { id: string; access: { accountType: AccountType } }): Promise<string> {
  return resolveActiveMainAccountId(user.id, user.access.accountType)
}

export async function resolveActiveMainAccountId(userId: string, accountType: AccountType): Promise<string> {
  if (accountType === 'member') return userId

  const supabase = await createClient()
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value

  if (cookieValue) {
    const { data } = await supabase
      .from('account_links')
      .select('main_user_id')
      .eq('assistant_user_id', userId)
      .eq('main_user_id', cookieValue)
      .eq('status', 'active')
      .maybeSingle()

    if (data) return cookieValue
  }

  // Fallback: first active linked main account
  const { data: links } = await supabase
    .from('account_links')
    .select('main_user_id')
    .eq('assistant_user_id', userId)
    .eq('status', 'active')
    .limit(1)

  return links?.[0]?.main_user_id ?? userId
}

export async function getLinkedMainAccounts(
  userId: string
): Promise<{ id: string; displayName: string }[]> {
  const supabase = await createClient()

  const { data: links } = await supabase
    .from('account_links')
    .select('main_user_id')
    .eq('assistant_user_id', userId)
    .eq('status', 'active')

  if (!links?.length) return []

  const mainIds = links.map(l => l.main_user_id)
  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, display_name')
    .in('user_id', mainIds)

  const roleMap = new Map((roles ?? []).map(r => [r.user_id, r.display_name]))
  return mainIds.map(id => ({ id, displayName: roleMap.get(id) ?? 'Unknown' }))
}

// Flips any pending links for an assistant to active on their first login.
export async function activatePendingLinks(userId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('account_links')
    .update({ status: 'active' })
    .eq('assistant_user_id', userId)
    .eq('status', 'pending')
}
