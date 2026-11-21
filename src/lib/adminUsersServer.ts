import { createAdminClient } from './supabase/admin'
import { isAdminEmail } from './access'
import { buildAdminUserRow, latestRunByUser, sortAdminUserRows, type AdminUserRow } from './adminUsers'

/**
 * Server-only loader for the admin users table (service role). Every secondary query is best effort: a missing
 * table/column (migration not applied) only blanks that column of the table, never the page.
 */
export async function loadAdminUsers(): Promise<AdminUserRow[]> {
  const admin = createAdminClient()
  const adminEmails = process.env.APP_ADMIN_EMAILS ?? ''

  const [rolesRes, authRes, linksRes, profilesRes, alpacaRes, aiRes, runsRes, settingsRes] = await Promise.all([
    admin.from('user_roles').select('*').order('created_at', { ascending: true }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from('account_links').select('main_user_id, assistant_user_id').eq('status', 'active'),
    admin.from('user_profiles').select('user_id, portfolio_tos_accepted_at'),
    admin.from('alpaca_credentials').select('user_id, is_paper'),
    admin.from('user_ai_credentials').select('user_id'),
    admin.from('recommendations').select('user_id, run_at, status').order('run_at', { ascending: false }).limit(2000),
    admin.from('portfolio_settings').select('*'),
  ])

  if (rolesRes.error) throw new Error('Failed to load users')
  const roleRows = (rolesRes.data ?? []) as Record<string, unknown>[]

  const emails = new Map((authRes.data?.users ?? []).map(u => [u.id, u.email ?? '']))
  const names = new Map(roleRows.map(r => [String(r.user_id), String(r.display_name ?? 'Unknown')]))
  const linksByAssistant = new Map<string, { id: string; displayName: string }[]>()
  for (const link of linksRes.data ?? []) {
    const list = linksByAssistant.get(link.assistant_user_id) ?? []
    list.push({ id: link.main_user_id, displayName: names.get(link.main_user_id) ?? 'Unknown' })
    linksByAssistant.set(link.assistant_user_id, list)
  }
  const terms = new Map((profilesRes.data ?? []).map(p => [p.user_id as string, (p.portfolio_tos_accepted_at as string | null) ?? null]))
  const alpaca = new Map((alpacaRes.data ?? []).map(c => [c.user_id as string, c.is_paper !== false]))
  const aiKeys = aiRes.error ? null : new Set((aiRes.data ?? []).map(r => r.user_id as string))
  const runs = latestRunByUser((runsRes.data ?? []) as { user_id: string; run_at: string; status: string }[])
  const settings = new Map((settingsRes.data ?? []).map(s => [s.user_id as string, s as Record<string, unknown>]))

  return sortAdminUserRows(roleRows.map(row => {
    const id = String(row.user_id)
    const email = emails.get(id) ?? ''
    return buildAdminUserRow({
      roleRow:            row,
      email,
      isAdmin:            isAdminEmail(email, adminEmails),
      linkedMainAccounts: linksByAssistant.get(id) ?? [],
      termsAcceptedAt:    terms.get(id) ?? null,
      alpacaIsPaper:      alpaca.has(id) ? alpaca.get(id)! : null,
      aiKeyAdded:         aiKeys === null ? null : aiKeys.has(id),
      lastRun:            runs.get(id) ?? null,
      settingsRow:        settings.get(id) ?? null,
    })
  }))
}
