import { AuditLogEntryWithUser } from '@/types/database'
import ChangesDetail from './ChangesDetail'

const ACTION_PILLS = {
  created:                { bg: 'var(--mint-soft)',     color: '#1a6b4a',          label: 'Created' },
  updated:                { bg: 'var(--sky-soft)',      color: '#1a8fc2',          label: 'Updated' },
  deleted:                { bg: 'var(--coral-soft)',    color: '#b8493d',          label: 'Deleted' },
  assistant_invited:      { bg: 'var(--lavender-soft)', color: 'var(--lavender)', label: 'Assistant invited' },
  assistant_deactivated:  { bg: 'var(--coral-soft)',    color: '#b8493d',          label: 'Assistant deactivated' },
  assistant_unlinked:     { bg: 'var(--coral-soft)',    color: '#b8493d',          label: 'Assistant unlinked' },
  expense_created:        { bg: 'var(--mint-soft)',     color: '#1a6b4a',          label: 'Expense created' },
  expense_updated:        { bg: 'var(--sky-soft)',      color: '#1a8fc2',          label: 'Expense updated' },
  expense_deleted:        { bg: 'var(--coral-soft)',    color: '#b8493d',          label: 'Expense deleted' },
  expense_reclaimed:      { bg: 'var(--lavender-soft)', color: 'var(--lavender)', label: 'Expense reclaimed' },
} as const

function initials(name: string) {
  return name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AuditEntry({ entry, isLast }: { entry: AuditLogEntryWithUser; isLast: boolean }) {
  const pill = ACTION_PILLS[entry.action as keyof typeof ACTION_PILLS] ?? ACTION_PILLS.updated
  const snapshot = entry.trip_snapshot
  const legs = snapshot?.legs ?? []
  const dest = legs[0]?.to_airport ?? '?'
  const firstDep = legs[0]?.departure_at
  const depDate = firstDep
    ? new Date(firstDep).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '?'

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--rule-soft)' }}>
      <div className="sj-audit-row" style={{
        display: 'grid', gridTemplateColumns: '100px 1.6fr 1.4fr 1fr',
        gap: 16, padding: '14px 20px', alignItems: 'center',
      }}>
        {/* Action pill */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: pill.bg, color: pill.color,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'capitalize',
          padding: '4px 10px', borderRadius: 999, width: 'fit-content',
        }}>
          {pill.label}
        </span>

        {/* Performer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'var(--blue-100)', color: 'var(--blue-700)',
            fontFamily: 'var(--display)', fontWeight: 700, fontSize: 11,
            display: 'grid', placeItems: 'center',
          }}>
            {initials(entry.performer.display_name)}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
              {entry.performer.display_name}
            </div>
            {entry.on_behalf_of_user && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                on behalf of <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{entry.on_behalf_of_user.display_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Trip */}
        <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          Trip to <strong style={{ color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 12 }}>{dest}</strong>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>departing {depDate}</div>
        </div>

        {/* Timestamp */}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
          {formatTimestamp(entry.created_at)}
        </span>
      </div>

      {entry.action === 'updated' && entry.changed_fields && (
        <div style={{ padding: '0 20px 14px' }}>
          <ChangesDetail changedFields={entry.changed_fields} />
        </div>
      )}
    </div>
  )
}
