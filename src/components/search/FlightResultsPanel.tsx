import { FlightOffer, FlightSearchResponse } from '@/types/flights'
import FlightCard from './FlightCard'

type Props = {
  results: FlightSearchResponse
  selectedOutbound: FlightOffer | null
  selectedReturn: FlightOffer | null
  onSelectOutbound: (offer: FlightOffer) => void
  onSelectReturn: (offer: FlightOffer) => void
  onReviewTrip: () => void
}

export default function FlightResultsPanel({
  results,
  selectedOutbound,
  selectedReturn,
  onSelectOutbound,
  onSelectReturn,
  onReviewTrip,
}: Props) {
  const bothSelected = !!(selectedOutbound && selectedReturn)

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FlightColumn
          title="Outbound flights"
          offers={results.outbound}
          selected={selectedOutbound}
          onSelect={onSelectOutbound}
          emptyMessage="No outbound flights found for this time slot."
        />
        <FlightColumn
          title="Return flights"
          offers={results.return}
          selected={selectedReturn}
          onSelect={onSelectReturn}
          emptyMessage="No return flights found for this time slot."
        />
      </div>

      {bothSelected && (
        <div className="flex justify-center">
          <button
            onClick={onReviewTrip}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Review trip
          </button>
        </div>
      )}
    </div>
  )
}

function FlightColumn({
  title,
  offers,
  selected,
  onSelect,
  emptyMessage,
}: {
  title: string
  offers: FlightOffer[]
  selected: FlightOffer | null
  onSelect: (offer: FlightOffer) => void
  emptyMessage: string
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{title}</h2>
      {offers.length === 0 ? (
        <p className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl p-6 text-center">
          {emptyMessage}
        </p>
      ) : (
        <div className="space-y-3">
          {offers.map(offer => (
            <FlightCard
              key={offer.id}
              offer={offer}
              selected={selected?.id === offer.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}
