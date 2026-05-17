'use client'

import { EditableCandidate } from '@/app/gmail/review/GmailReviewClient'

type EditableStringField = 'from_airport' | 'to_airport' | 'flight_number' | 'airline' | 'departure_at' | 'return_at'

interface Props {
  candidate: EditableCandidate
  onFieldChange: (field: keyof EditableCandidate, value: string) => void
  onSave: () => void
}

const fields: Array<[EditableStringField, string, string]> = [
  ['from_airport', 'Origin (IATA)', 'e.g. LHR'],
  ['to_airport', 'Destination (IATA)', 'e.g. JFK'],
  ['flight_number', 'Flight number', 'e.g. BA117'],
  ['airline', 'Airline', 'e.g. British Airways'],
  ['departure_at', 'Departure date', 'YYYY-MM-DD'],
  ['return_at', 'Return date (blank if one-way)', 'YYYY-MM-DD'],
]

export default function GmailFlightCard({ candidate, onFieldChange, onSave }: Props) {
  const { saving, saved, warning } = candidate

  return (
    <div style={{
      background: 'var(--paper)',
      border: '1px solid var(--rule)',
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
    }}>
      {/* Email metadata header */}
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--rule-soft)', background: 'var(--paper-2)' }}>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 2 }}>{candidate.from}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {candidate.subject}
        </div>
      </div>

      {/* Duplicate warning */}
      {warning === 'DUPLICATE_DETECTED' && (
        <div style={{
          background: '#fefce8', borderBottom: '1px solid #fde68a',
          padding: '10px 18px', fontSize: 12, color: '#92400e',
        }}>
          A trip with this flight number and departure date already exists. You can still save it.
        </div>
      )}

      {/* Saved state */}
      {saved && (
        <div style={{
          background: '#f0fdf4', borderBottom: '1px solid #bbf7d0',
          padding: '10px 18px', fontSize: 12, color: '#166534', fontWeight: 600,
        }}>
          Saved to your trips
        </div>
      )}

      {/* Editable fields */}
      <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {fields.map(([field, label, placeholder]) => (
          <div key={field}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {label}
            </label>
            <input
              type={field.endsWith('_at') ? 'date' : 'text'}
              value={candidate[field]}
              onChange={e => onFieldChange(field, e.target.value)}
              placeholder={placeholder}
              disabled={saved}
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13,
                border: '1px solid var(--rule)', borderRadius: 8,
                background: saved ? 'var(--paper-2)' : 'var(--paper)',
                color: 'var(--ink)', fontFamily: 'var(--sans)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>
        ))}
      </div>

      {/* Save button */}
      <div style={{ padding: '0 18px 16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onSave}
          disabled={saving || saved}
          aria-label={saved ? 'Trip saved' : 'Save to trips'}
          style={{
            padding: '9px 20px', fontSize: 13, fontWeight: 600,
            background: saved ? 'var(--paper-3)' : 'var(--blue-700)',
            color: saved ? 'var(--ink-3)' : 'white',
            border: 'none', borderRadius: 8, cursor: saving || saved ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--sans)',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save to trips'}
        </button>
      </div>
    </div>
  )
}
