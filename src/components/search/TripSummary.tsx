import { FlightOffer, Airport } from '@/types/flights'
import { daysOutsideUK } from '@/lib/daysCalculator'

type Props = {
  outbound: FlightOffer
  returnFlight: FlightOffer
  origin: Airport
  destination: Airport
  onSave: () => void
  onBack: () => void
  saving: boolean
  saveError: string
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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

export default function TripSummary({
  outbound,
  returnFlight,
  origin,
  destination,
  onSave,
  onBack,
  saving,
  saveError,
}: Props) {
  const days = daysOutsideUK(outbound.departureAt, returnFlight.departureAt)

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
        <p className="text-2xl font-semibold text-gray-900">
          {origin.cityName} → {destination.cityName}
        </p>
      </div>

      {/* Days outside UK */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-center">
        <p className="text-3xl font-bold text-blue-700">{days}</p>
        <p className="text-sm text-blue-600 mt-0.5">
          {days === 1 ? 'day' : 'days'} outside UK
        </p>
      </div>

      {/* Flights */}
      <div className="space-y-4 divide-y divide-gray-100">
        <FlightRow label="Outbound" offer={outbound} />
        <div className="pt-4">
          <FlightRow label="Return" offer={returnFlight} />
        </div>
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
