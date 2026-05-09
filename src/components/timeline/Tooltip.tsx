'use client'

import { getAirportInfo } from '@/lib/airportCountry'

export interface TripSlice {
  id: string
  days_outside_uk: number
  trip_type?: string
  source?: string
  legs: {
    from_airport: string
    to_airport: string
    departure_at: string
    leg_order: number
  }[]
}

interface TooltipProps {
  visible: boolean
  x: number
  y: number
  trip: TripSlice | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function routeLabel(legs: TripSlice['legs']) {
  if (!legs.length) return '?'
  return [...legs.map(l => l.from_airport), legs[legs.length - 1].to_airport].join(' → ')
}

export default function Tooltip({ visible, x, y, trip }: TooltipProps) {
  if (!trip) return null

  const legs = trip.legs
  const firstLeg = legs[0]
  const lastLeg = legs[legs.length - 1]
  const primaryDest = getAirportInfo(firstLeg?.to_airport ?? '')

  return (
    <div style={{
      position: 'fixed',
      left: x + 14,
      top: y - 10,
      pointerEvents: 'none',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.12s',
      zIndex: 100,
      background: 'var(--ink)',
      color: 'white',
      borderRadius: 10,
      padding: '12px 16px',
      minWidth: 200,
      boxShadow: 'var(--shadow-lg)',
    }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{primaryDest.flag}</div>
      <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
        {routeLabel(legs)}
      </div>
      <div style={{ color: 'var(--yellow)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {firstLeg ? fmtDate(firstLeg.departure_at) : '?'}
        {lastLeg && lastLeg !== firstLeg ? ` – ${fmtDate(lastLeg.departure_at)}` : ''}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
        {trip.trip_type === 'multi_city' ? `${legs.length}-city · ` : ''}
        {trip.days_outside_uk} days outside UK
        {trip.source === 'manual' ? ' · manual' : ''}
      </div>
    </div>
  )
}
