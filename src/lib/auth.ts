import { createClient } from './supabase/server'
import { deriveAccess, type Access } from './access'
import { resolveActiveMainAccountId } from './activeAccount'

export interface AuthUser {
  id: string
  email: string
  displayName: string
  /** Account type, plan, add-ons and admin flag (specs/027-plans-addons-admin). */
  access: Access
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return null

  // select('*') so this works before migration 20261121b (no account_type/plan/features → derived from role)
  const { data: roleRecord, error: roleError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (roleError || !roleRecord) return null

  const email = user.email ?? ''
  const adminEmails = process.env.APP_ADMIN_EMAILS ?? ''
  let access = deriveAccess(roleRecord, { email, adminEmails })

  // Assistants inherit plan + add-ons from the ACTIVE linked member account (same resolution as the data scope).
  if (access.accountType === 'assistant') {
    const mainId = await resolveActiveMainAccountId(user.id, 'assistant')
    let linkedMain: unknown = null
    if (mainId !== user.id) {
      const { data } = await supabase.from('user_roles').select('*').eq('user_id', mainId).maybeSingle()
      linkedMain = data ?? null
    }
    access = deriveAccess(roleRecord, { email, adminEmails, linkedMain })
  }

  return {
    id: user.id,
    email,
    displayName: roleRecord.display_name as string,
    access,
  }
}
