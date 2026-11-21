import { createAdminClient } from './supabase/admin'
import { deriveAccess, hasFeature, type Access } from './access'

/**
 * Server-only access lookups with the service role (background jobs, signup, admin routes).
 * Reads user_roles with select('*') so it works before migration 20261121b (access then derived from legacy role).
 * Assistants never have add-ons, so Portfolio checks here need no linked-account lookup.
 */

type AdminClient = ReturnType<typeof createAdminClient>

/** Access of one user by id (no admin flag — no email here). null when the user has no user_roles row. */
export async function loadAccessById(userId: string, admin: AdminClient = createAdminClient()): Promise<Access | null> {
  const { data } = await admin.from('user_roles').select('*').eq('user_id', userId).maybeSingle()
  return data ? deriveAccess(data) : null
}

/** True when the user currently has the Portfolio add-on (member accounts only). Fails closed. */
export async function userHasPortfolio(userId: string, admin: AdminClient = createAdminClient()): Promise<boolean> {
  const access = await loadAccessById(userId, admin)
  return access !== null && hasFeature(access, 'portfolio')
}

/** The subset of userIds that currently have the Portfolio add-on. Fails closed (query error → empty set). */
export async function filterPortfolioUsers(userIds: string[], admin: AdminClient = createAdminClient()): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const { data, error } = await admin.from('user_roles').select('*').in('user_id', userIds)
  if (error || !data) return new Set()
  return new Set(
    data
      .filter(row => hasFeature(deriveAccess(row), 'portfolio'))
      .map(row => row.user_id as string),
  )
}
