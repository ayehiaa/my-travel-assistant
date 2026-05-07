'use client'

import { getAirportInfo } from '@/lib/airportCountry'

export interface TripSlice {
  id: string
  departure_airport: string
  destination_airport: string
  outbound_departure_at: string
  return_departure_at: string
  days_outside_uk: number
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

export default function Tooltip({ visible, x, y, trip }: TooltipProps) {
  if (!trip) return null

  const dest = getAirportInfo(trip.destination_airport)

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
      <div className="text-2xl mb-1">{dest.flag}</div>
      <div className="font-semibold text-slate-100 mb-2">{dest.country}</div>
      <div className="text-slate-500 mb-0.5">
        Route: <span className="text-slate-300">{trip.departure_airport} → {trip.destination_airport}</span>
      </div>
      <div className="text-slate-500 mb-0.5">
        Depart: <span className="text-slate-300">{fmtDate(trip.outbound_departure_at)}</span>
      </div>
      <div className="text-slate-500 mb-0.5">
        Return: <span className="text-slate-300">{fmtDate(trip.return_departure_at)}</span>
      </div>
      <div className="text-slate-500">
        Duration: <span className="text-slate-300">{duration(trip.days_outside_uk)}</span>
      </div>
    </div>
  )
}
