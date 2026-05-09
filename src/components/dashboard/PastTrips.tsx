'use client'

import { useState } from 'react'
import { TripWithUsers } from '@/types/database'
import { getAirportInfo } from '@/lib/airportCountry'
import EmptyState from './EmptyState'
import AddPastTripModal from './AddPastTripModal'

const COVERS = [
  'linear-gradient(135deg,#ff6f5e,#ffb400)',
  'linear-gradient(135deg,#4cc4f5,#1a73d6)',
  'linear-gradient(135deg,#2bc28a,#1a8fc2)',
  'linear-gradient(135deg,#8b6fdb,#ec4ea0)',
  'linear-gradient(135deg,#ff9a6c,#ff6f5e)',
  'linear-gradient(135deg,#ffb400,#ff9a6c)',
  'linear-gradient(135deg,#1a73d6,#8b6fdb)',
  'linear-gradient(135deg,#ec4ea0,#8b6fdb)',
]

function cover(id: string) {
  return COVERS[id.charCodeAt(0) % 8]
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  trips: TripWithUsers[]
  canDelete: boolean
  showModal?: boolean
  onShowModal?: (v: boolean) => void
}

function PastRow({ trip }: { trip: TripWithUsers }) {
  const legs = trip.legs ?? []
  const firstLeg = legs[0]
  const lastLeg = legs[legs.length - 1]
  const destCode = lastLeg?.to_airport ?? '?'
  const destInfo = getAirportInfo(destCode)
  const flag = destInfo?.flag ?? ''

  const routeParts: string[] = legs.length
    ? [...legs.map(l => l.from_airport), lastLeg.to_airport]
    : ['?']

  const isMulti = trip.trip_type === 'multi_city'
  const isManual = trip.source === 'manual'
  const flightNums = legs.map(l => l.flight_number ?? '—').join(' · ')

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '56px 1.2fr 1fr 1fr 0.7fr 0.6fr',
      gap: 14,
      padding: '14px 18px',
      alignItems: 'center',
      borderBottom: '1px solid var(--rule-soft)',
      cursor: 'pointer',
      transition: 'background .12s',
    }}
      onMouseOver={e => { e.currentTarget.style.background = 'var(--paper-2)' }}
      onMouseOut={e => { e.currentTarget.style.background = '' }}
    >
      {/* Gradient swatch */}
      <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', position: 'relative', background: cover(trip.id), flexShrink: 0 }}>
        <span style={{ position: 'absolute', bottom: 4, left: 4, fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,.3)' }}>{flag}</span>
      </div>

      {/* Route + tags */}
      <div>
        <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 }}>
          {routeParts.map((code, i) => (
            <span key={i}>
              {code}
              {i < routeParts.length - 1 && <span style={{ color: 'var(--ink-4)', margin: '0 4px', fontWeight: 500 }}>→</span>}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
          {destInfo?.country ?? destCode}
          {isMulti && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--sky-soft)', color: '#1a8fc2', padding: '2px 6px', borderRadius: 999 }}>multi</span>}
          {isManual && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--lavender-soft)', color: 'var(--lavender)', padding: '2px 6px', borderRadius: 999 }}>manual</span>}
        </div>
      </div>

      {/* Dates */}
      <div style={{ fontSize: 13 }}>
        {firstLeg && lastLeg && (
          <>
            <strong>{fmtDate(firstLeg.departure_at)}</strong>
            <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: 11 }}>→ {fmtDate(lastLeg.departure_at)}</small>
          </>
        )}
      </div>

      {/* Flight numbers */}
      <div style={{ fontSize: 13 }}>
        <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Flights</small>
        {isManual ? <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>—</span> : flightNums}
      </div>

      {/* Days count */}
      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22 }}>{trip.days_outside_uk}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>days</span>
      </div>

      {/* Chevron */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ color: 'var(--ink-4)', fontSize: 18 }}>›</span>
      </div>
    </div>
  )
}

export default function PastTrips({ trips, canDelete: _canDelete, showModal: controlledShow, onShowModal }: Props) {
  const [internalShow, setInternalShow] = useState(false)
  const showModal = controlledShow ?? internalShow
  const setShowModal = onShowModal ?? setInternalShow

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => setShowModal(true)}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue-500)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)' }}
        >
          + Add past trip
        </button>
      </div>

      {trips.length === 0 ? (
        <EmptyState message="No past trips yet. Use the button above to log a trip taken before Sojourn." />
      ) : (
        <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          {trips.map((trip, i) => (
            <div key={trip.id} style={{ borderBottom: i === trips.length - 1 ? 'none' : undefined }}>
              <PastRow trip={trip} />
            </div>
          ))}
        </div>
      )}

      {showModal && <AddPastTripModal onClose={() => setShowModal(false)} />}
    </section>
  )
}
