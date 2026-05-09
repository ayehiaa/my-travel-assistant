'use client'

import { TripWithUsers } from '@/types/database'

const COVERS = [
  'linear-gradient(135deg,#ff6f5e,#ffb400)',
  'linear-gradient(135deg,#4cc4f5,#1a73d6)',
  'linear-gradient(135deg,#2bc28a,#1a8fc2)',
  'linear-gradient(135deg,#8b6fdb,#ec4ea0)',
  'linear-gradient(135deg,#ff9a6c,#ff6f5e)',
  'linear-gradient(135deg,#ffb400,#ff9a6c)',
  'linear-gradient(135deg,#1a73d6,#8b6fdb)',
  'linear-gradient(135deg,#ec4ea0,#8b6fdb)',
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d.getTime() - start.getTime()) / 86400000)
}

function daysInYear(year: number): number {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365
}

interface Props {
  trips: TripWithUsers[]
  year: number
}

export default function YearStrip({ trips, year }: Props) {
  const today = new Date()
  const total = daysInYear(year)
  const todayPct = today.getFullYear() === year ? (dayOfYear(today) / total) * 100 : null

  const yearTrips = trips.filter(t => {
    const dep = t.legs[0]?.departure_at ?? t.created_at
    return new Date(dep).getFullYear() === year
  })

  const totalDays = yearTrips.reduce((s, t) => s + (t.days_outside_uk ?? 0), 0)

  return (
    <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--r-lg)', padding: '22px 24px', marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h3 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', margin: 0 }}>
          {year} · A year in motion
        </h3>
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          {yearTrips.length} trips · {totalDays} days abroad
        </span>
      </div>

      {/* 12-month grid */}
      <div style={{ position: 'relative', height: 92 }}>
        {/* Month columns */}
        <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(12,1fr)' }}>
          {MONTHS.map((m, i) => (
            <div key={m} style={{
              borderLeft: i === 0 ? 'none' : '1px dashed var(--rule)',
              padding: '6px 0 0 8px',
              fontSize: 10, fontWeight: 600, color: 'var(--ink-4)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>{m}</div>
          ))}
        </div>

        {/* Trip bars */}
        {yearTrips.map((t, idx) => {
          const dep = new Date(t.legs[0]?.departure_at ?? t.created_at)
          const ret = new Date(t.legs[t.legs.length - 1]?.departure_at ?? t.created_at)
          const startPct = (dayOfYear(dep) / total) * 100
          const endPct   = (dayOfYear(ret) / total) * 100
          const width    = Math.max(endPct - startPct, 1.4)
          const isUpcoming = dep > today
          const row = idx % 2  // simple two-row stagger
          const cover = COVERS[t.id.charCodeAt(0) % 8]

          return (
            <div
              key={t.id}
              title={`${t.legs.map(l => l.from_airport).join(' → ')} → ${t.legs[t.legs.length-1]?.to_airport} · ${t.days_outside_uk}d`}
              style={{
                position: 'absolute',
                left: `${startPct}%`,
                width: `${width}%`,
                height: 24,
                top: 28 + row * 30,
                borderRadius: 6,
                background: cover,
                opacity: isUpcoming ? 1 : 0.7,
                fontFamily: 'var(--mono)',
                fontSize: 10, fontWeight: 600,
                color: 'white',
                padding: '0 8px',
                display: 'flex', alignItems: 'center',
                whiteSpace: 'nowrap', overflow: 'hidden',
                cursor: 'pointer',
                transition: 'transform .12s',
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)' }}
            >
              {t.legs[0]?.from_airport}
            </div>
          )
        })}

        {/* TODAY line */}
        {todayPct !== null && (
          <div style={{ position: 'absolute', top: -6, bottom: -6, left: `${todayPct}%`, width: 2, background: 'var(--coral)', zIndex: 3, pointerEvents: 'none' }}>
            <div style={{
              position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--coral)', color: 'white',
              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.08em',
            }}>NOW</div>
          </div>
        )}
      </div>
    </div>
  )
}
