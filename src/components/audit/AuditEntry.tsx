import { AuditLogEntryWithUser } from '@/types/database'
import ChangesDetail from './ChangesDetail'

const ACTION_STYLES = {
  created: 'bg-green-50 text-green-700',
  updated: 'bg-yellow-50 text-yellow-700',
  deleted: 'bg-red-50 text-red-700',
} as const

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AuditEntry({ entry }: { entry: AuditLogEntryWithUser }) {
  const snapshot = entry.trip_snapshot
  const legs = snapshot?.legs ?? []
  const dest = legs[0]?.to_airport ?? '?'
  const firstDep = legs[0]?.departure_at
  const depDate = firstDep
    ? new Date(firstDep).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '?'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${ACTION_STYLES[entry.action]}`}>
              {entry.action}
            </span>
            <span className="text-sm font-medium text-gray-900">{entry.performer.display_name}</span>
            {entry.on_behalf_of_user && (
              <span className="text-sm text-gray-400">
                on behalf of <span className="text-gray-600">{entry.on_behalf_of_user.display_name}</span>
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">
            Trip to <span className="font-medium">{dest}</span> departing {depDate}
          </p>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">{formatTimestamp(entry.created_at)}</span>
      </div>

      {entry.action === 'updated' && entry.changed_fields && (
        <ChangesDetail changedFields={entry.changed_fields} />
      )}
    </div>
  )
}
