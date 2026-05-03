'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { Airport } from '@/types/flights'
import AirportAutocomplete from '@/components/search/AirportAutocomplete'

type Props = {
  onClose: () => void
}

const today = new Date().toISOString().split('T')[0]
const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]

export default function AddPastTripModal({ onClose }: Props) {
  const router = useRouter()
  const toast = useToast()

  const [origin, setOrigin] = useState<Airport | null>(null)
  const [destination, setDestination] = useState<Airport | null>(null)
  const [departureDate, setDepartureDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [saving, setSaving] = useState(false)

  const isValid =
    origin !== null &&
    destination !== null &&
    departureDate !== '' &&
    returnDate !== '' &&
    returnDate > departureDate

  async function handleSave() {
    if (!isValid || !origin || !destination) return
    setSaving(true)
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          departure_airport: origin.iataCode,
          destination_airport: destination.iataCode,
          outbound_departure_at: departureDate,
          return_departure_at: returnDate,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save trip')
      }
      toast('Past trip added', 'success')
      onClose()
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save trip', 'error')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add past trip</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <AirportAutocomplete
            label="From"
            placeholder="Origin airport…"
            value={origin}
            onChange={setOrigin}
          />
          <AirportAutocomplete
            label="To"
            placeholder="Destination airport…"
            value={destination}
            onChange={setDestination}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Departure date
              </label>
              <input
                type="date"
                value={departureDate}
                max={yesterday}
                onChange={(e) => {
                  setDepartureDate(e.target.value)
                  if (returnDate && returnDate <= e.target.value) setReturnDate('')
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Return date
              </label>
              <input
                type="date"
                value={returnDate}
                min={departureDate || undefined}
                max={today}
                disabled={!departureDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {saving ? 'Saving…' : 'Save trip'}
          </button>
        </div>
      </div>
    </div>
  )
}
