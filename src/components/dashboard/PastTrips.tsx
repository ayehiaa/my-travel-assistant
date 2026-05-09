'use client'

import { useState } from 'react'
import { TripWithUsers } from '@/types/database'
import TripCard from './TripCard'
import EmptyState from './EmptyState'
import AddPastTripModal from './AddPastTripModal'

type Props = {
  trips: TripWithUsers[]
  canDelete: boolean
  showModal?: boolean
  onShowModal?: (v: boolean) => void
}

export default function PastTrips({ trips, canDelete, showModal: controlledShow, onShowModal }: Props) {
  const [internalShow, setInternalShow] = useState(false)
  const showModal = controlledShow ?? internalShow
  const setShowModal = onShowModal ?? setInternalShow

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => setShowModal(true)}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue-500)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)' }}
        >
          + Add past trip
        </button>
      </div>

      {trips.length === 0 ? (
        <EmptyState message="No past trips yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip} canDelete={canDelete} />
          ))}
        </div>
      )}

      {showModal && <AddPastTripModal onClose={() => setShowModal(false)} />}
    </section>
  )
}
