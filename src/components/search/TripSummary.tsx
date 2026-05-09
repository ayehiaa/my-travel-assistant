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

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function legLabel(i: number, tripType: 'round_trip' | 'multi_city') {
  if (tripType === 'round_trip') return i === 0 ? 'Outbound' : 'Return'
  return `Leg ${i + 1}`
}

export default function TripSummary({
  tripType, legs, selectedFlights, onSave, onBack, saving, saveError,
}: Props) {
  const firstFlight = selectedFlights[0]
  const lastFlight  = selectedFlights[selectedFlights.length - 1]
  const days = firstFlight && lastFlight
    ? daysOutsideUK(firstFlight.departureAt, lastFlight.departureAt)
    : 0

  const iataRoute = (() => {
    const codes: string[] = legs.map(l => l.origin?.iataCode ?? '?')
    const final = legs[legs.length - 1]?.destination?.iataCode
    if (final) codes.push(final)
    return codes
  })()

  const cityRoute = (() => {
    const cities: string[] = legs.map(l => l.origin?.cityName ?? l.origin?.iataCode ?? '?')
    const finalCity = legs[legs.length - 1]?.destination?.cityName ?? legs[legs.length - 1]?.destination?.iataCode
    if (finalCity) cities.push(finalCity)
    return cities
  })()

  const totalPrice = selectedFlights.reduce((s, f) => s + f.price, 0)

  return (
    <div style={{ marginTop: 32, borderRadius: 'var(--r-xl)', overflow: 'hidden', border: '1px solid var(--rule)', boxShadow: 'var(--shadow-lg)' }}>
      {/* Navy gradient header */}
      <div style={{
        background: 'linear-gradient(135deg, var(--blue-900) 0%, var(--blue-700) 100%)',
        padding: '32px 32px 28px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 80% at 90% 20%, rgba(26,115,214,.4) 0%, transparent 70%)',
        }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            {/* Route chain in display font */}
            <div style={{
              fontFamily: 'var(--display)', fontWeight: 700,
              fontSize: 'clamp(32px,4vw,52px)', letterSpacing: '-0.025em',
              color: 'white', lineHeight: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0 4px',
            }}>
              {iataRoute.map((code, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0 4px' }}>
                  <span>{code}</span>
                  {i < iataRoute.length - 1 && (
                    <span style={{ color: 'var(--yellow)', margin: '0 6px' }}>→</span>
                  )}
                </span>
              ))}
            </div>

            {/* City subline */}
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, marginTop: 8, fontWeight: 500 }}>
              {cityRoute.join(' → ')} · {tripType === 'round_trip' ? 'round trip' : `${legs.length}-city itinerary`}
            </div>
          </div>

          {/* Days pill */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', marginBottom: 4 }}>
              Days outside UK
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--yellow)', color: 'var(--blue-900)',
              borderRadius: 999, padding: '8px 16px',
            }}>
              <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', lineHeight: 1 }}>{days}</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>days</span>
            </div>
          </div>
        </div>
      </div>

      {/* Per-leg columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${selectedFlights.length}, 1fr)`,
        background: 'var(--paper)',
      }}>
        {selectedFlights.map((flight, i) => (
          <div key={i} style={{
            padding: '20px 24px',
            borderRight: i < selectedFlights.length - 1 ? '1px solid var(--rule)' : 'none',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>
              {legLabel(i, tripType)} · {fmtDate(flight.departureAt)}
            </div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em', marginBottom: 4 }}>
              {fmtTime(flight.departureAt)} → {fmtTime(flight.arrivalAt)}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
              {flight.flightNumber}
              <small style={{ color: 'var(--ink-3)', fontWeight: 500, marginLeft: 6 }}>{flight.airline}</small>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
              {legs[i]?.origin?.iataCode ?? ''} → {legs[i]?.destination?.iataCode ?? ''}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        background: 'var(--paper-2)', borderTop: '1px solid var(--rule)',
        padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={onBack}
            style={{ fontSize: 13, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', textDecoration: 'underline' }}
          >
            Back to results
          </button>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            Total · <strong style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--ink)' }}>£{totalPrice.toFixed(0)}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {saveError && (
            <p style={{ fontSize: 13, color: 'var(--coral)', background: 'var(--coral-soft)', border: '1px solid var(--coral)', borderRadius: 8, padding: '6px 12px', margin: 0 }}>
              {saveError}
            </p>
          )}
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              background: 'var(--yellow)', color: 'var(--blue-900)',
              border: 'none', borderRadius: 999, padding: '12px 28px',
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
              fontFamily: 'var(--sans)', opacity: saving ? 0.5 : 1,
              transition: 'opacity .15s, transform .12s',
            }}
            onMouseOver={e => { if (!saving) e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseOut={e => { e.currentTarget.style.transform = '' }}
          >
            {saving ? 'Saving…' : 'Save to my trips ✓'}
          </button>
        </div>
      </div>
    </div>
  )
}
