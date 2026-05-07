import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import AuditEntry from '@/components/audit/AuditEntry'
import { AuditLogEntryWithUser, UserRoleRecord } from '@/types/database'

export const metadata = {
  title: 'Audit Log — Travel Assistant',
}

const PAGE_SIZE = 20

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  const { data: entries, count } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  const performerIds = [...new Set((entries ?? []).map(e => e.performed_by))]
  let roleMap = new Map<string, Pick<UserRoleRecord, 'display_name' | 'role'>>()
  if (performerIds.length > 0) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, display_name, role')
      .in('user_id', performerIds)
    roleMap = new Map((roles ?? []).map(r => [r.user_id, { display_name: r.display_name, role: r.role }]))
  }

  const enriched: AuditLogEntryWithUser[] = (entries ?? []).map(e => ({
    ...e,
    performer: roleMap.get(e.performed_by) ?? { display_name: 'Unknown', role: 'assistant' as const },
  }))

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-1">{count ?? 0} total entries</p>
        </div>
      </div>

      {enriched.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-400">No audit log entries yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {enriched.map(entry => (
            <AuditEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-8">
          <Link
            href={`/audit?page=${page - 1}`}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
              page <= 1
                ? 'border-gray-100 text-gray-300 pointer-events-none'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            Previous
          </Link>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <Link
            href={`/audit?page=${page + 1}`}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
              page >= totalPages
                ? 'border-gray-100 text-gray-300 pointer-events-none'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            Next
          </Link>
        </div>
      )}
    </div>
  )
}
