import { FlightOffer, LegFormState } from '@/types/flights'
import { daysOutsideUK } from '@/lib/daysCalculator'

type Props = {
  tripType: 'round_trip' | 'multi_city'
  legs: LegFormState[]
  selectedFlights: FlightOffer[]
  onSave: () => void
  onBack: () => void
  saving: boolean
  saveError: string
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function FlightRow({ label, offer }: { label: string; offer: FlightOffer }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 text-sm">
      <span className="text-gray-500 font-medium pt-0.5">{label}</span>
      <div>
        <p className="font-semibold text-gray-900">
          {offer.flightNumber} · {offer.airline}
        </p>
        <p className="text-gray-600">
          {formatDateTime(offer.departureAt)} → {formatDateTime(offer.arrivalAt)}
        </p>
      </div>
    </div>
  )
}

function flightLabel(index: number, total: number, tripType: 'round_trip' | 'multi_city') {
  if (tripType === 'round_trip') return index === 0 ? 'Outbound' : 'Return'
  return `Leg ${index + 1}`
}

export default function TripSummary({
  tripType, legs, selectedFlights, onSave, onBack, saving, saveError,
}: Props) {
  const firstFlight = selectedFlights[0]
  const lastFlight  = selectedFlights[selectedFlights.length - 1]
  const days = firstFlight && lastFlight
    ? daysOutsideUK(firstFlight.departureAt, lastFlight.departureAt)
    : 0

  // Full route label from city names
  const cities = legs.map(l => l.origin?.cityName ?? l.origin?.iataCode ?? '?')
  const finalDest = legs[legs.length - 1]?.destination
  if (finalDest) cities.push(finalDest.cityName ?? finalDest.iataCode ?? '?')
  const routeLabel = cities.join(' → ')

  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Trip summary</h2>
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
        >
          Back to results
        </button>
      </div>

      {/* Route */}
      <div className="text-center py-2">
        <p className="text-2xl font-semibold text-gray-900">{routeLabel}</p>
      </div>

      {/* Days outside UK */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-center">
        <p className="text-3xl font-bold text-blue-700">{days}</p>
        <p className="text-sm text-blue-600 mt-0.5">
          {days === 1 ? 'day' : 'days'} outside UK
        </p>
      </div>

      {/* Flights — one row per leg */}
      <div className="space-y-4 divide-y divide-gray-100">
        {selectedFlights.map((flight, i) => (
          <div key={i} className={i > 0 ? 'pt-4' : ''}>
            <FlightRow
              label={flightLabel(i, selectedFlights.length, tripType)}
              offer={flight}
            />
          </div>
        ))}
      </div>

      {saveError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {saving ? 'Saving…' : 'Save trip'}
      </button>
    </div>
  )
}
