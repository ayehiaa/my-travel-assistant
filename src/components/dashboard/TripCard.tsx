'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { TripWithUsers } from '@/types/database'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  })
}

type Props = {
  trip: TripWithUsers
  canDelete: boolean
}

export default function TripCard({ trip, canDelete }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete trip to ${trip.destination_airport}? This cannot be undone.`)) return
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

  const creatorName = trip.creator?.display_name ?? 'Unknown'
  const modifierName = trip.modifier?.display_name ?? 'Unknown'
  const wasEdited = trip.last_modified_by !== trip.created_by

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-900">
              {trip.departure_airport} → {trip.destination_airport}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatDate(trip.outbound_departure_at)} → {formatDate(trip.return_departure_at)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="inline-flex items-center justify-center bg-blue-50 text-blue-700 text-sm font-semibold rounded-lg px-3 py-1 min-w-[4rem] text-center">
            {trip.days_outside_uk}d
          </span>
          <span className="text-xs text-gray-400">outside UK</span>
        </div>
      </div>

      {/* Flights */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="w-16 text-xs font-medium text-gray-400 uppercase">Out</span>
            <span className="font-medium text-gray-900">{trip.outbound_airline}</span>
            <span className="text-gray-400">{trip.outbound_flight_number}</span>
          </div>
          <span className="text-gray-600 tabular-nums">{formatTime(trip.outbound_departure_at)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="w-16 text-xs font-medium text-gray-400 uppercase">Return</span>
            <span className="font-medium text-gray-900">{trip.return_airline}</span>
            <span className="text-gray-400">{trip.return_flight_number}</span>
          </div>
          <span className="text-gray-600 tabular-nums">{formatTime(trip.return_departure_at)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <div className="text-xs text-gray-400">
          <span>Added by {creatorName}</span>
          {wasEdited && <span> · Edited by {modifierName}</span>}
        </div>
        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  )
}
