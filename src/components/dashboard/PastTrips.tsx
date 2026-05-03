'use client'

import { useState } from 'react'
import { TripWithUsers } from '@/types/database'
import TripCard from './TripCard'
import EmptyState from './EmptyState'
import AddPastTripModal from './AddPastTripModal'

type Props = {
  trips: TripWithUsers[]
  canDelete: boolean
}

export default function PastTrips({ trips, canDelete }: Props) {
  const [showModal, setShowModal] = useState(false)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-700">Past Trips</h2>
        <button
          onClick={() => setShowModal(true)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
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
