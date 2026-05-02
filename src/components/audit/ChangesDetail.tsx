'use client'

import { useState } from 'react'

type Props = {
  changedFields: Record<string, { before: unknown; after: unknown }>
}

export default function ChangesDetail({ changedFields }: Props) {
  const [open, setOpen] = useState(false)
  const fields = Object.entries(changedFields)
  if (fields.length === 0) return null

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        {open ? 'Hide' : 'Show'} {fields.length} change{fields.length > 1 ? 's' : ''}
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          <div className="grid grid-cols-[160px_1fr_1fr] text-xs text-gray-400 font-medium mb-1">
            <span>Field</span><span>Before</span><span>After</span>
          </div>
          {fields.map(([field, { before, after }]) => (
            <div key={field} className="grid grid-cols-[160px_1fr_1fr] text-xs items-start gap-1">
              <span className="text-gray-500 capitalize">{field.replace(/_/g, ' ')}</span>
              <span className="text-red-500 line-through break-all">{String(before ?? '—')}</span>
              <span className="text-green-600 break-all">{String(after ?? '—')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
