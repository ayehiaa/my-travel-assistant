import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { loadAdminUsers } from '@/lib/adminUsersServer'
import type { AdminUserRow } from '@/lib/adminUsers'
import AdminUsersTable from '@/components/admin/AdminUsersTable'
import CustomerInviteManager from '@/components/admin/CustomerInviteManager'

export const metadata = { title: 'Admin — Sojourn' }

export default async function AdminPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  // Admin is env-based (APP_ADMIN_EMAILS) — checked server-side; every admin API route checks again.
  if (!user.access.isAdmin) redirect('/')

  let users: AdminUserRow[] = []
  let loadError = false
  try {
    users = await loadAdminUsers()
  } catch {
    loadError = true
  }
  const migrationPending = users.some(u => u.source === 'legacy_role')

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-8">
      <div className="mb-7">
        <div className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">Admin</div>
        <h1 className="m-0 font-[family-name:var(--display)] text-[clamp(28px,4vw,42px)] font-bold tracking-tight text-[var(--ink)]">
          Users &amp; invitations
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          Plans: <strong>Free</strong> (beta limits — 10 trips, 10 expenses, 1 assistant) or <strong>Plus</strong>{' '}
          (unlimited + Gmail import). Add-on: <strong>Portfolio (beta)</strong>. Assistants inherit the plan of the
          account they are linked to and never get Portfolio.
        </p>
        {migrationPending && (
          <p className="mt-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
            Database update pending: plans are read from the legacy role column. Apply{' '}
            <code className="font-mono">supabase/apply_plans_addons_admin.sql</code> to enable Free + Portfolio and store
            plans/add-ons in their own columns.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <section className="rounded-[var(--r-lg)] border border-[var(--rule)] bg-[var(--paper)] p-5 sm:p-6">
          <h2 className="m-0 mb-2 font-[family-name:var(--display)] text-lg font-bold text-[var(--ink)]">Customer invitations</h2>
          <p className="mb-4 text-sm text-[var(--ink-3)]">
            Invite someone to create a Sojourn account. Each invitation link is valid for 3 days.
          </p>
          <CustomerInviteManager />
        </section>

        <section className="rounded-[var(--r-lg)] border border-[var(--rule)] bg-[var(--paper)] p-5 sm:p-6">
          <h2 className="m-0 mb-4 font-[family-name:var(--display)] text-lg font-bold text-[var(--ink)]">Users</h2>
          {loadError ? (
            <p className="text-sm text-[var(--coral)]">Could not load users.</p>
          ) : (
            <AdminUsersTable initial={users} currentUserId={user.id} />
          )}
        </section>
      </div>
    </div>
  )
}
