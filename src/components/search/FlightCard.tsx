'use client'

import { FlightOffer } from '@/types/flights'
import { getAirlineBadgeColor } from '@/lib/airlineLogos'

type Props = {
  offer: FlightOffer
  selected: boolean
  onSelect: (offer: FlightOffer) => void
  fromCode?: string
  toCode?: string
}

function formatTime(iso: string) {
  return iso.split('T')[1]?.slice(0, 5) ?? ''
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export default function FlightCard({ offer, selected, onSelect, fromCode, toCode }: Props) {
  const badgeColor = getAirlineBadgeColor(offer.airlineCode)

  return (
    <div style={{ position: 'relative' }}>
      {/* Overhanging "✓ Selected" pill */}
      {selected && (
        <div style={{
          position: 'absolute', top: -10, right: 12, zIndex: 2,
          background: 'var(--blue-700)', color: 'white',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          padding: '4px 10px', borderRadius: 999,
          pointerEvents: 'none',
        }}>
          ✓ Selected
        </div>
      )}

      <button
        type="button"
        onClick={() => onSelect(offer)}
        style={{
          width: '100%', textAlign: 'left', background: 'var(--paper)',
          border: selected ? '2px solid var(--blue-700)' : '1px solid var(--rule)',
          borderRadius: 'var(--r)',
          boxShadow: selected ? '0 0 0 3px var(--blue-100)' : 'none',
          padding: '16px',
          cursor: 'pointer', transition: 'border-color .12s, transform .12s, box-shadow .12s',
          outline: 'none',
        }}
        onMouseOver={e => {
          if (!selected) {
            e.currentTarget.style.borderColor = 'var(--blue-500)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }
        }}
        onMouseOut={e => {
          if (!selected) {
            e.currentTarget.style.borderColor = 'var(--rule)'
            e.currentTarget.style.transform = ''
          }
        }}
        onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-100)' }}
        onBlur={e => { if (!selected) e.currentTarget.style.boxShadow = 'none' }}
      >
        {/* Header: airline + price */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 8,
              background: offer.isBA ? 'var(--blue-700)' : badgeColor,
              color: 'white', fontSize: 10, fontWeight: 700,
            }}>
              {offer.airlineCode}
            </span>
            <div style={{ lineHeight: 1.3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{offer.airline}</span>
                {offer.isBA && (
                  <span style={{
                    background: 'var(--blue-700)', color: 'white',
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    BA Priority
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{offer.flightNumber}</div>
            </div>
          </div>

          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
            £{offer.price.toFixed(0)}
          </div>
        </div>

        {/* Times */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em' }}>
            {formatTime(offer.departureAt)}
          </span>
          <div style={{ flex: 1, position: 'relative', height: 2, background: 'var(--rule)', borderRadius: 999 }}>
            <span style={{
              position: 'absolute', left: 0, top: '50%', transform: 'translate(-50%,-50%)',
              width: 10, height: 10, borderRadius: '50%', background: 'var(--blue-700)',
            }} />
          </div>
          <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em' }}>
            {formatTime(offer.arrivalAt)}
          </span>
        </div>

        {/* Meta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, fontSize: 11, color: 'var(--ink-3)' }}>
          <span>{fromCode ?? ''}</span>
          <span style={{ textAlign: 'center', fontWeight: 600, color: 'var(--ink-2)' }}>
            {formatDuration(offer.durationMinutes)} · {offer.stops === 0 ? 'Direct' : `${offer.stops} stop${offer.stops > 1 ? 's' : ''}`}
          </span>
          <span style={{ textAlign: 'right' }}>{toCode ?? ''}</span>
        </div>
      </button>
    </div>
  )
}
