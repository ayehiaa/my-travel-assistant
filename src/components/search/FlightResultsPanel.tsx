import { FlightOffer, FlightSearchResponse, LegFormState, MultiCitySearchResponse, RoundTripSearchResponse } from '@/types/flights'
import FlightCard from './FlightCard'

type Props = {
  results: FlightSearchResponse
  legs: LegFormState[]
  selectedFlights: (FlightOffer | null)[]
  onSelectFlight: (index: number, offer: FlightOffer) => void
  onReviewTrip: () => void
}

const LEG_COLORS = ['var(--blue-500)', 'var(--coral)', 'var(--lavender)']

export default function FlightResultsPanel({
  results, legs, selectedFlights, onSelectFlight, onReviewTrip,
}: Props) {
  const allSelected = selectedFlights.length > 0 && selectedFlights.every(f => f !== null)

  if (results.tripType === 'round_trip') {
    const rt = results as RoundTripSearchResponse
    const from = legs[0]?.origin?.iataCode ?? ''
    const to   = legs[0]?.destination?.iataCode ?? ''
    return (
      <div style={{ marginTop: 32 }}>
        <div className="sj-results-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <FlightColumn
            title="Outbound"
            accentColor={LEG_COLORS[0]}
            offers={rt.outbound}
            selected={selectedFlights[0] ?? null}
            onSelect={offer => onSelectFlight(0, offer)}
            fromCode={from}
            toCode={to}
            emptyMessage="No outbound flights found for this time slot."
          />
          <FlightColumn
            title="Return"
            accentColor={LEG_COLORS[1]}
            offers={rt.return}
            selected={selectedFlights[1] ?? null}
            onSelect={offer => onSelectFlight(1, offer)}
            fromCode={to}
            toCode={from}
            emptyMessage="No return flights found for this time slot."
          />
        </div>
        {allSelected && <ReviewButton onClick={onReviewTrip} />}
      </div>
    )
  }

  const mc = results as MultiCitySearchResponse
  return (
    <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {mc.legs.map((offers, i) => (
        <FlightColumn
          key={i}
          title={`Leg ${i + 1}`}
          accentColor={LEG_COLORS[i % LEG_COLORS.length]}
          offers={offers}
          selected={selectedFlights[i] ?? null}
          onSelect={offer => onSelectFlight(i, offer)}
          fromCode={legs[i]?.origin?.iataCode ?? ''}
          toCode={legs[i]?.destination?.iataCode ?? ''}
          emptyMessage={`No flights found for leg ${i + 1}.`}
        />
      ))}
      {allSelected && <ReviewButton onClick={onReviewTrip} />}
    </div>
  )
}

function ReviewButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
      <button
        onClick={onClick}
        style={{
          background: 'var(--yellow)', color: 'var(--blue-900)',
          border: 'none', borderRadius: 999, padding: '14px 36px',
          fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'var(--sans)',
          transition: 'transform .12s, box-shadow .12s',
        }}
        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow)' }}
        onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
      >
        Review trip →
      </button>
    </div>
  )
}

function FlightColumn({
  title, accentColor, offers, selected, onSelect, fromCode, toCode, emptyMessage,
}: {
  title: string
  accentColor: string
  offers: FlightOffer[]
  selected: FlightOffer | null
  onSelect: (offer: FlightOffer) => void
  fromCode: string
  toCode: string
  emptyMessage: string
}) {
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{
          fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22,
          letterSpacing: '-0.01em', color: accentColor, margin: '0 0 2px',
        }}>
          {title}
          {fromCode && toCode && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500, color: 'var(--ink-3)', marginLeft: 8 }}>
              {fromCode} → {toCode}
            </span>
          )}
        </h2>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {offers.length} flight{offers.length !== 1 ? 's' : ''} · BA priority
        </span>
      </div>

      {offers.length === 0 ? (
        <p style={{
          fontSize: 14, color: 'var(--ink-3)',
          border: '1.5px dashed var(--rule)', borderRadius: 'var(--r)',
          padding: '24px', textAlign: 'center',
        }}>
          {emptyMessage}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {offers.map(offer => (
            <FlightCard
              key={offer.id}
              offer={offer}
              selected={selected?.id === offer.id}
              onSelect={onSelect}
              fromCode={fromCode}
              toCode={toCode}
            />
          ))}
        </div>
      )}
    </div>
  )
}
