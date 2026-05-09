import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import AuditEntry from '@/components/audit/AuditEntry'
import { AuditLogEntryWithUser, UserRoleRecord } from '@/types/database'

export const metadata = {
  title: 'Audit log — Sojourn',
}

const PAGE_SIZE = 20

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const activeMainAccountId = await getActiveMainAccountId(user)

  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  const { data: entries, count } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .or(`performed_by.eq.${activeMainAccountId},on_behalf_of.eq.${activeMainAccountId}`)
    .order('created_at', { ascending: false })
    .range(from, to)

  const performerIds = [...new Set((entries ?? []).map(e => e.performed_by))]
  const onBehalfOfIds = [...new Set(
    (entries ?? []).map(e => e.on_behalf_of).filter(Boolean) as string[]
  )]
  const allUserIds = [...new Set([...performerIds, ...onBehalfOfIds])]

  let roleMap = new Map<string, Pick<UserRoleRecord, 'display_name' | 'role'>>()
  if (allUserIds.length > 0) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, display_name, role')
      .in('user_id', allUserIds)
    roleMap = new Map((roles ?? []).map(r => [r.user_id, { display_name: r.display_name, role: r.role }]))
  }

  const enriched: AuditLogEntryWithUser[] = (entries ?? []).map(e => ({
    ...e,
    performer: roleMap.get(e.performed_by) ?? { display_name: 'Unknown', role: 'assistant' as const },
    on_behalf_of_user: e.on_behalf_of
      ? (roleMap.get(e.on_behalf_of) ? { display_name: roleMap.get(e.on_behalf_of)!.display_name } : { display_name: 'Unknown' })
      : undefined,
  }))

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  return (
    <div style={{ maxWidth: 896, margin: '0 auto', padding: '40px 32px' }}>
      {/* Page head */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4 }}>
            Audit log
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(28px,4vw,42px)', letterSpacing: '-0.02em', color: 'var(--ink)', margin: 0 }}>
            Audit log
          </h1>
        </div>
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{count ?? 0} total entries</span>
      </div>

      {enriched.length === 0 ? (
        <div style={{
          border: '2px dashed var(--rule)', borderRadius: 'var(--r-lg)',
          background: 'var(--paper)', padding: '60px 20px', textAlign: 'center',
          color: 'var(--ink-3)', fontSize: 14,
        }}>
          No audit log entries yet.
        </div>
      ) : (
        <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          {/* Header row */}
          <div className="sj-audit-header" style={{
            display: 'grid', gridTemplateColumns: '100px 1.6fr 1.4fr 1fr',
            gap: 16, padding: '10px 20px',
            background: 'var(--paper-2)',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)',
            borderBottom: '1px solid var(--rule)',
          }}>
            <span>Action</span>
            <span>Performer</span>
            <span>Trip</span>
            <span>When</span>
          </div>

          {enriched.map((entry, i) => (
            <AuditEntry
              key={entry.id}
              entry={entry}
              isLast={i === enriched.length - 1}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }}>
          <Link
            href={`/audit?page=${page - 1}`}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600,
              borderRadius: 999, border: '1.5px solid var(--rule)',
              color: page <= 1 ? 'var(--ink-4)' : 'var(--ink-2)',
              pointerEvents: page <= 1 ? 'none' : 'auto',
              textDecoration: 'none',
            }}
          >
            ← Previous
          </Link>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Page {page} of {totalPages}</span>
          <Link
            href={`/audit?page=${page + 1}`}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600,
              borderRadius: 999, border: '1.5px solid var(--rule)',
              color: page >= totalPages ? 'var(--ink-4)' : 'var(--ink-2)',
              pointerEvents: page >= totalPages ? 'none' : 'auto',
              textDecoration: 'none',
            }}
          >
            Next →
          </Link>
        </div>
      )}
    </div>
  )
}
