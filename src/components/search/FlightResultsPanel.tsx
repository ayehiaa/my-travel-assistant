import { FlightOffer, FlightSearchResponse, MultiCitySearchResponse, RoundTripSearchResponse } from '@/types/flights'
import FlightCard from './FlightCard'

type Props = {
  results: FlightSearchResponse
  selectedFlights: (FlightOffer | null)[]
  onSelectFlight: (index: number, offer: FlightOffer) => void
  onReviewTrip: () => void
}

export default function FlightResultsPanel({
  results, selectedFlights, onSelectFlight, onReviewTrip,
}: Props) {
  const allSelected = selectedFlights.length > 0 && selectedFlights.every(f => f !== null)

  if (results.tripType === 'round_trip') {
    const rt = results as RoundTripSearchResponse
    return (
      <div className="mt-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FlightColumn
            title="Outbound flights"
            offers={rt.outbound}
            selected={selectedFlights[0] ?? null}
            onSelect={offer => onSelectFlight(0, offer)}
            emptyMessage="No outbound flights found for this time slot."
          />
          <FlightColumn
            title="Return flights"
            offers={rt.return}
            selected={selectedFlights[1] ?? null}
            onSelect={offer => onSelectFlight(1, offer)}
            emptyMessage="No return flights found for this time slot."
          />
        </div>
        {allSelected && <ReviewButton onClick={onReviewTrip} />}
      </div>
    )
  }

  // multi_city: vertical stack of leg columns
  const mc = results as MultiCitySearchResponse
  return (
    <div className="mt-6 space-y-6">
      {mc.legs.map((offers, i) => (
        <FlightColumn
          key={i}
          title={`Leg ${i + 1} flights`}
          offers={offers}
          selected={selectedFlights[i] ?? null}
          onSelect={offer => onSelectFlight(i, offer)}
          emptyMessage={`No flights found for leg ${i + 1}.`}
        />
      ))}
      {allSelected && <ReviewButton onClick={onReviewTrip} />}
    </div>
  )
}

function ReviewButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center">
      <button
        onClick={onClick}
        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        Review trip
      </button>
    </div>
  )
}

function FlightColumn({
  title, offers, selected, onSelect, emptyMessage,
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
