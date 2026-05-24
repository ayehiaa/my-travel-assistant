import { createClient } from './supabase/server'
import type { UserRole } from '@/types/database'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  displayName: string
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return null

  const { data: roleRecord, error: roleError } = await supabase
    .from('user_roles')
    .select('role, display_name')
    .eq('user_id', user.id)
    .single()

  if (roleError || !roleRecord) return null

  return {
    id: user.id,
    email: user.email ?? '',
    role: roleRecord.role as UserRole,
    displayName: roleRecord.display_name,
  }
}

export function isPremiumOrAbove(role: UserRole): boolean {
  return role === 'premium' || role === 'premium_plus'
}
