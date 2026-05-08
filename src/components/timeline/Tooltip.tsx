'use client'

import { getAirportInfo } from '@/lib/airportCountry'

export interface TripSlice {
  id: string
  days_outside_uk: number
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

function duration(days: number) {
  return `${days} day${days !== 1 ? 's' : ''}`
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
    <div
      style={{
        position: 'fixed',
        left: x + 14,
        top: y - 10,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.12s',
        zIndex: 100,
      }}
      className="bg-[#0f1117] border border-[#3d4460] rounded-xl px-4 py-3 min-w-[190px] shadow-2xl text-sm"
    >
      <div className="text-2xl mb-1">{primaryDest.flag}</div>
      <div className="font-semibold text-slate-100 mb-2">{routeLabel(legs)}</div>
      <div className="text-slate-500 mb-0.5">
        Depart: <span className="text-slate-300">{firstLeg ? fmtDate(firstLeg.departure_at) : '?'}</span>
      </div>
      <div className="text-slate-500 mb-0.5">
        Return: <span className="text-slate-300">{lastLeg ? fmtDate(lastLeg.departure_at) : '?'}</span>
      </div>
      <div className="text-slate-500">
        Duration: <span className="text-slate-300">{duration(trip.days_outside_uk)}</span>
      </div>
    </div>
  )
}
