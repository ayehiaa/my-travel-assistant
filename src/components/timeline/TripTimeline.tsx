'use client'

import { useState } from 'react'
import { getAirportInfo } from '@/lib/airportCountry'
import Tooltip, { TripSlice } from './Tooltip'

interface Props {
  trips: TripSlice[]
  today: string
}


function pctOf(date: string, windowStart: Date, totalDays: number) {
  const offset = (new Date(date).getTime() - windowStart.getTime()) / 86400000
  return (Math.max(0, Math.min(totalDays, offset)) / totalDays) * 100
}

function buildMonths(windowStart: Date, windowEnd: Date, totalDays: number) {
  const months: { label: string; leftPct: number; widthPct: number }[] = []
  const cur = new Date(windowStart)
  cur.setDate(1)
  if (cur < windowStart) cur.setMonth(cur.getMonth() + 1)

  while (cur <= windowEnd) {
    const monthStart = Math.max(0, (cur.getTime() - windowStart.getTime()) / 86400000)
    const next = new Date(cur)
    next.setMonth(next.getMonth() + 1)
    const monthEnd = Math.min(totalDays, (next.getTime() - windowStart.getTime()) / 86400000)

    months.push({
      label: cur.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      leftPct: (monthStart / totalDays) * 100,
      widthPct: ((monthEnd - monthStart) / totalDays) * 100,
    })
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

export default function TripTimeline({ trips, today }: Props) {
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; trip: TripSlice | null }>({
    visible: false, x: 0, y: 0, trip: null,
  })

  const todayDate = new Date(today)
  const windowStart = new Date(todayDate)
  windowStart.setDate(windowStart.getDate() - 180)
  const windowEnd = new Date(todayDate)
  windowEnd.setDate(windowEnd.getDate() + 180)
  const totalDays = 360

  const todayPct = (180 / totalDays) * 100

  const months = buildMonths(windowStart, windowEnd, totalDays)

  const todayMs = todayDate.getTime()
  const upcoming = trips.filter(t => new Date(t.return_departure_at).getTime() >= todayMs)
  const past     = trips.filter(t => new Date(t.return_departure_at).getTime() < todayMs)

  const countries = new Set(trips.map(t => getAirportInfo(t.destination_airport).country))
  const totalDaysAbroad = trips.reduce((acc, t) => acc + t.days_outside_uk, 0)

  if (trips.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        No trips in this 12-month window.
      </div>
    )
  }

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { value: upcoming.length, label: 'Upcoming trips' },
          { value: past.length,     label: 'Past (this window)' },
          { value: totalDaysAbroad, label: 'Days abroad' },
          { value: countries.size,  label: 'Countries' },
        ].map(s => (
          <div key={s.label} className="bg-[#1e2130] border border-[#2d3348] rounded-xl px-5 py-4">
            <div className="text-2xl font-bold text-slate-100">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-[#1e2130] border border-[#2d3348] rounded-2xl p-6 overflow-x-auto">
        <div style={{ minWidth: 720 }}>

          {/* Month header */}
          <div className="flex mb-2" style={{ marginLeft: 136 }}>
            {months.map(m => (
              <div
                key={m.label}
                style={{ width: `${m.widthPct}%`, flexShrink: 0 }}
                className="text-center text-[0.65rem] font-semibold uppercase tracking-widest text-slate-600"
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Rows + grid */}
          <div className="relative">
            {/* Grid lines */}
            <div className="absolute inset-0 pointer-events-none" style={{ left: 136 }}>
              {months.map(m => (
                <div
                  key={m.label}
                  className="absolute top-0 bottom-0 border-l border-[#2d3348]"
                  style={{ left: `${m.leftPct}%` }}
                />
              ))}
              {/* Today line — lives inside the bar area so left% is correct */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                style={{ left: `${todayPct}%` }}
              >
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[0.6rem] font-bold uppercase tracking-widest text-amber-400 bg-[#1e2130] px-1 whitespace-nowrap">
                  {todayDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>

            {/* Trip rows */}
            {trips.map((trip, i) => {
              const isPast = new Date(trip.return_departure_at).getTime() < todayMs
              const leftPct  = pctOf(trip.outbound_departure_at, windowStart, totalDays)
              const rightPct = pctOf(trip.return_departure_at,   windowStart, totalDays)
              const widthPct = Math.max(0.3, rightPct - leftPct)
              const { flag } = getAirportInfo(trip.destination_airport)

              return (
                <div key={trip.id} className="flex items-center h-11 mb-2">
                  {/* Row label */}
                  <div
                    className="shrink-0 text-right pr-4 text-xs font-semibold text-slate-500 tracking-wide"
                    style={{ width: 136 }}
                  >
                    {trip.departure_airport} → {trip.destination_airport}
                  </div>

                  {/* Bar container */}
                  <div className="relative flex-1 h-11">
                    <div
                      className="absolute top-[6px] h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all hover:scale-y-105"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        background: 'transparent',
                        border: `1.5px solid ${isPast ? '#475569' : '#94a3b8'}`,
                        opacity: isPast ? 0.5 : 1,
                        minWidth: 28,
                      }}
                      onMouseEnter={e => setTooltip({ visible: true, x: e.clientX, y: e.clientY, trip })}
                      onMouseMove={e  => setTooltip(s => ({ ...s, x: e.clientX, y: e.clientY }))}
                      onMouseLeave={()  => setTooltip(s => ({ ...s, visible: false }))}
                    >
                      <span className="text-lg leading-none select-none">{flag}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-5 mt-4 pt-4 border-t border-[#2d3348] flex-wrap">
            <div className="flex items-center gap-2 text-[0.7rem] text-slate-500">
              <div className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
              Today
            </div>
            <div className="flex items-center gap-2 text-[0.7rem] text-slate-500">
              <div className="w-2.5 h-2.5 rounded-sm border border-[#475569] opacity-50" />
              Past trip
            </div>
            <div className="flex items-center gap-2 text-[0.7rem] text-slate-500">
              <div className="w-2.5 h-2.5 rounded-sm border border-slate-400" />
              Upcoming trip
            </div>
          </div>
        </div>
      </div>

      <Tooltip {...tooltip} />
    </div>
  )
}
