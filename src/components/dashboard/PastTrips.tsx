'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
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

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: 'block' }}>
      <path d="M1 3.5h12M5.5 3.5V2h3v1.5M2.5 3.5l1 8.5h7l1-8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PastRow({ trip, canDelete }: { trip: TripWithUsers; canDelete: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)

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

  async function handleDelete() {
    if (!confirm(`Delete ${routeParts.join(' → ')}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast('Trip deleted', 'success')
      router.refresh()
    } catch {
      toast('Failed to delete trip', 'error')
      setDeleting(false)
    }
  }

  return (
    <div
      className="sj-past-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '56px 1.2fr 1fr 1fr 0.7fr 0.6fr',
        gap: 14,
        padding: '14px 18px',
        alignItems: 'center',
        borderBottom: '1px solid var(--rule-soft)',
        cursor: 'pointer',
        transition: 'background .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--paper-2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}
    >
      {/* Gradient swatch */}
      <div className="sj-pr-swatch" style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', position: 'relative', background: cover(trip.id), flexShrink: 0 }}>
        <span style={{ position: 'absolute', bottom: 4, left: 4, fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,.3)' }}>{flag}</span>
      </div>

      {/* Route + tags */}
      <div className="sj-pr-route">
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
      <div className="sj-pr-dates" style={{ fontSize: 13 }}>
        {firstLeg && lastLeg && (
          <>
            <strong>{fmtDate(firstLeg.departure_at)}</strong>
            <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: 11 }}>→ {fmtDate(lastLeg.departure_at)}</small>
          </>
        )}
      </div>

      {/* Flight numbers */}
      <div className="sj-pr-flights" style={{ fontSize: 13 }}>
        <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Flights</small>
        {isManual ? <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>—</span> : flightNums}
      </div>

      {/* Days count */}
      <div className="sj-pr-days" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22 }}>{trip.days_outside_uk}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>days</span>
      </div>

      {/* Chevron / delete */}
      <div className="sj-pr-action" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        {canDelete ? (
          <button
            onClick={e => { e.stopPropagation(); handleDelete() }}
            disabled={deleting}
            title="Delete trip"
            style={{
              background: 'none', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer',
              color: 'var(--coral)', opacity: deleting ? 0.4 : 1,
              padding: '6px', borderRadius: 6, display: 'grid', placeItems: 'center',
              transition: 'background .1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--coral-soft)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            {deleting ? '…' : <TrashIcon />}
          </button>
        ) : (
          <span style={{ color: 'var(--ink-4)', fontSize: 18 }}>›</span>
        )}
      </div>
    </div>
  )
}

export default function PastTrips({ trips, canDelete = false, showModal: controlledShow, onShowModal }: Props) {
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
              <PastRow trip={trip} canDelete={canDelete} />
            </div>
          ))}
        </div>
      )}

      {showModal && <AddPastTripModal onClose={() => setShowModal(false)} />}
    </section>
  )
}
