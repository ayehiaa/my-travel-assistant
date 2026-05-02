import { FlightOffer } from '@/types/flights'
import { getAirlineBadgeColor } from '@/lib/airlineLogos'
import BABadge from './BABadge'

type Props = {
  offer: FlightOffer
  selected: boolean
  onSelect: (offer: FlightOffer) => void
}

function formatTime(iso: string) {
  return iso.split('T')[1]?.slice(0, 5) ?? ''
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export default function FlightCard({ offer, selected, onSelect }: Props) {
  const badgeColor = getAirlineBadgeColor(offer.airlineCode)

  return (
    <button
      type="button"
      onClick={() => onSelect(offer)}
      className={`w-full text-left rounded-xl border-2 p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
        selected
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      } ${offer.isBA ? 'ring-1 ring-blue-200' : ''}`}
    >
      {/* Header: airline + badge + price */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-xs font-bold ${badgeColor}`}>
            {offer.airlineCode}
          </span>
          <div className="leading-tight">
            <p className="text-sm font-medium text-gray-900">{offer.airline}</p>
            <p className="text-xs text-gray-500">{offer.flightNumber}</p>
          </div>
          {offer.isBA && <BABadge />}
        </div>
        <div className="text-right">
          <p className="text-base font-semibold text-gray-900">£{offer.price.toFixed(0)}</p>
          <p className="text-xs text-gray-400">{offer.currency}</p>
        </div>
      </div>

      {/* Times + duration */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-gray-900 tabular-nums">{formatTime(offer.departureAt)}</span>
        <div className="flex-1 mx-3 text-center">
          <div className="text-xs text-gray-400">{formatDuration(offer.durationMinutes)}</div>
          <div className="h-px bg-gray-200 my-0.5" />
          <div className="text-xs text-gray-400">
            {offer.stops === 0 ? 'Direct' : `${offer.stops} stop${offer.stops > 1 ? 's' : ''}`}
          </div>
        </div>
        <span className="font-semibold text-gray-900 tabular-nums">{formatTime(offer.arrivalAt)}</span>
      </div>

      {selected && (
        <div className="mt-3 text-xs text-blue-600 font-medium text-center">Selected</div>
      )}
    </button>
  )
}
