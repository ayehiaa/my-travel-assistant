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
    <div style={{ borderTop: '1px solid var(--rule-soft)', paddingTop: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 600, color: 'var(--blue-500)',
          fontFamily: 'var(--sans)', display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0,
        }}
      >
        {open ? 'Hide' : 'Show'} {fields.length} change{fields.length > 1 ? 's' : ''}
        <svg
          style={{ width: 12, height: 12, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '160px 1fr 1fr',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--ink-3)', marginBottom: 4,
          }}>
            <span>Field</span><span>Before</span><span>After</span>
          </div>
          {fields.map(([field, { before, after }]) => (
            <div key={field} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', fontSize: 12, gap: 8, alignItems: 'start' }}>
              <span style={{ color: 'var(--ink-3)', textTransform: 'capitalize' }}>{field.replace(/_/g, ' ')}</span>
              <span style={{ color: 'var(--coral)', textDecoration: 'line-through', fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>{String(before ?? '—')}</span>
              <span style={{ color: 'var(--mint)', fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>{String(after ?? '—')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
