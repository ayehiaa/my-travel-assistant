'use client'

import { useState, useEffect, useRef } from 'react'
import { getAirportInfo } from '@/lib/airportCountry'
import Tooltip, { TripSlice } from './Tooltip'

interface Props {
  trips: TripSlice[]
  today: string
  referenceDate: string | null
  annualDaysAbroad: number | null
}

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
const cover = (id: string) => COVERS[id.charCodeAt(0) % 8]

const STAT_TONES: Record<string, { bg: string; color: string }> = {
  coral:    { bg: 'var(--coral-soft)',    color: 'var(--coral)' },
  lavender: { bg: 'var(--lavender-soft)', color: 'var(--lavender)' },
  mint:     { bg: 'var(--mint-soft)',     color: 'var(--mint)' },
  sky:      { bg: 'var(--sky-soft)',      color: 'var(--sky)' },
}

function StatTile({ tone, icon, label, value, delta }: {
  tone: string; icon: string; label: string; value: string; delta: string
}) {
  const { bg, color } = STAT_TONES[tone]
  return (
    <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--r)', padding: '18px 20px' }}>
      <div style={{ display: 'inline-flex', width: 36, height: 36, borderRadius: 10, background: bg, alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: 12 }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 4 }}>{delta}</div>
    </div>
  )
}

function pctOf(date: string, windowStart: Date, totalDays: number) {
  const offset = (new Date(date).getTime() - windowStart.getTime()) / 86400000
  return (Math.max(0, Math.min(totalDays, offset)) / totalDays) * 100
}

function buildMonths(windowStart: Date, windowEnd: Date, totalDays: number) {
  const today = new Date()
  const months: { label: string; year: string; leftPct: number; widthPct: number; isCurrent: boolean }[] = []
  const cur = new Date(windowStart)
  cur.setDate(1)
  if (cur < windowStart) cur.setMonth(cur.getMonth() + 1)

  while (cur <= windowEnd) {
    const monthStart = Math.max(0, (cur.getTime() - windowStart.getTime()) / 86400000)
    const next = new Date(cur)
    next.setMonth(next.getMonth() + 1)
    const monthEnd = Math.min(totalDays, (next.getTime() - windowStart.getTime()) / 86400000)
    const isCurrent = cur.getMonth() === today.getMonth() && cur.getFullYear() === today.getFullYear()

    months.push({
      label: cur.toLocaleDateString('en-GB', { month: 'short' }),
      year: cur.getFullYear() !== today.getFullYear() ? String(cur.getFullYear()) : '',
      leftPct: (monthStart / totalDays) * 100,
      widthPct: ((monthEnd - monthStart) / totalDays) * 100,
      isCurrent,
    })
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

function tripFirstDep(t: TripSlice) { return t.legs[0]?.departure_at ?? '' }
function tripLastDep(t: TripSlice)  { return t.legs[t.legs.length - 1]?.departure_at ?? '' }
function tripRoute(t: TripSlice) {
  if (!t.legs.length) return '?'
  return [...t.legs.map(l => l.from_airport), t.legs[t.legs.length - 1].to_airport].join(' → ')
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TripTimeline({ trips, today, referenceDate, annualDaysAbroad }: Props) {
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; trip: TripSlice | null }>({
    visible: false, x: 0, y: 0, trip: null,
  })
  const [sheet, setSheet] = useState<TripSlice | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const todayDate = new Date(today)
  const windowStart = new Date(todayDate)
  windowStart.setDate(windowStart.getDate() - 180)
  const windowEnd = new Date(todayDate)
  windowEnd.setDate(windowEnd.getDate() + 180)
  const totalDays = 360

  const todayPct = (180 / totalDays) * 100
  const months = buildMonths(windowStart, windowEnd, totalDays)
  const todayMs = todayDate.getTime()

  const upcoming = trips.filter(t => new Date(tripLastDep(t)).getTime() >= todayMs)
  const past     = trips.filter(t => new Date(tripLastDep(t)).getTime() < todayMs)

  const countries = new Set(
    trips.flatMap(t => t.legs.slice(0, -1).map(l => getAirportInfo(l.to_airport).country))
  )

  const annualLabel = referenceDate
    ? `till ${new Date(referenceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : 'set reference date in settings'

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = el.scrollWidth / 2 - el.clientWidth / 2
  }, [])

  if (trips.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '80px 20px',
        border: '2px dashed var(--rule)', borderRadius: 'var(--r-lg)',
        color: 'var(--ink-3)', background: 'var(--paper)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗓</div>
        <strong style={{ fontSize: 16, color: 'var(--ink)' }}>No trips in this 12-month window</strong>
        <div style={{ marginTop: 6 }}>
          <a href="/search" style={{ color: 'var(--blue-500)', fontWeight: 600 }}>Plan a trip →</a>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 4-up stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatTile tone="coral"    icon="↗" label="Upcoming"     value={String(upcoming.length)}   delta="next 6 months" />
        <StatTile tone="lavender" icon="↙" label="Past"         value={String(past.length)}        delta="last 6 months" />
        <StatTile tone="mint"     icon="🌍" label="Countries"   value={String(countries.size)}    delta="visited / planned" />
        <StatTile
          tone="sky"
          icon="∑"
          label="Annual days"
          value={annualDaysAbroad !== null ? `${annualDaysAbroad}/90` : '—'}
          delta={annualLabel}
        />
      </div>

      {/* Timeline canvas card */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>

        {/* Card header */}
        <div style={{ padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--rule)' }}>
          <h3 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, margin: 0, color: 'var(--ink)' }}>
            All trips · stacked by overlap
          </h3>
          <div style={{ display: 'inline-flex', gap: 14, fontSize: 12, color: 'var(--ink-3)', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--blue-500)', display: 'inline-block' }} />
              Upcoming
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--ink-4)', display: 'inline-block' }} />
              Past
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--coral)', display: 'inline-block' }} />
              Today
            </span>
          </div>
        </div>

        {/* Scrollable canvas */}
        <div ref={scrollRef} style={{ overflowX: 'auto', padding: '18px 24px 24px' }}>
          <div style={{ minWidth: 720 }}>

            {/* Month axis */}
            <div style={{ position: 'relative', height: 38, marginBottom: 6, borderBottom: '1px solid var(--rule)' }}>
              {months.map((m, i) => (
                <div key={i} style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${m.leftPct}%`, width: `${m.widthPct}%`,
                  padding: '6px 8px',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: m.isCurrent ? 'var(--coral)' : 'var(--ink-3)',
                  borderLeft: i === 0 ? 'none' : '1px dashed var(--rule)',
                }}>
                  {m.label}
                  {m.year && <small style={{ display: 'block', fontSize: 9, color: 'var(--ink-4)', marginTop: 1, fontWeight: 600 }}>{m.year}</small>}
                </div>
              ))}
            </div>

            {/* Rows + overlay */}
            <div style={{ position: 'relative', marginTop: 8 }}>
              {/* Month grid lines */}
              {months.map((m, i) => (
                <div key={i} style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${m.leftPct}%`, width: 1, background: 'var(--rule-soft)',
                }} />
              ))}

              {/* Coral TODAY line */}
              <div style={{
                position: 'absolute', top: -10, bottom: 0, width: 2,
                background: 'var(--coral)', left: `${todayPct}%`, zIndex: 4, pointerEvents: 'none',
              }}>
                <div style={{
                  position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--coral)', color: 'white',
                  fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 4,
                  letterSpacing: '0.08em', whiteSpace: 'nowrap',
                }}>
                  TODAY
                </div>
              </div>

              {/* Trip bars */}
              <div style={{ position: 'relative', minHeight: trips.length * 52 + 16 }}>
                {trips.map((trip, rowIdx) => {
                  const firstDep = tripFirstDep(trip)
                  const lastDep  = tripLastDep(trip)
                  const isPast   = new Date(lastDep).getTime() < todayMs
                  const leftPct  = pctOf(firstDep, windowStart, totalDays)
                  const rightPct = pctOf(lastDep,  windowStart, totalDays)
                  const widthPct = Math.max(1.6, rightPct - leftPct)
                  const { flag }  = getAirportInfo(trip.legs[0]?.to_airport ?? '')
                  const route     = tripRoute(trip)
                  const isManual  = trip.source === 'manual'
                  const isMulti   = trip.trip_type === 'multi_city'
                  const bg        = cover(trip.id)

                  return (
                    <div
                      key={trip.id}
                      style={{
                        position: 'absolute',
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        top: 8 + rowIdx * 52,
                        height: 40,
                        borderRadius: 10,
                        background: bg,
                        opacity: isPast ? 0.82 : 1,
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '0 12px',
                        fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'white',
                        cursor: 'pointer',
                        transition: 'transform .12s, box-shadow .12s',
                        whiteSpace: 'nowrap', overflow: 'hidden',
                        zIndex: 2,
                        border: isMulti ? '2px solid rgba(255,255,255,.6)' : 'none',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
                        setTooltip({ visible: true, x: e.clientX, y: e.clientY, trip })
                      }}
                      onMouseMove={e => setTooltip(s => ({ ...s, x: e.clientX, y: e.clientY }))}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = ''
                        e.currentTarget.style.boxShadow = ''
                        setTooltip(s => ({ ...s, visible: false }))
                      }}
                      onClick={() => setSheet(trip)}
                    >
                      <span style={{ fontSize: 16 }}>{flag}</span>
                      <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{route}</span>
                      <span style={{ marginLeft: 'auto', background: 'rgba(0,0,0,.18)', padding: '2px 6px', borderRadius: 4, fontSize: 10, flexShrink: 0 }}>
                        {trip.days_outside_uk}d
                      </span>
                      {isManual && (
                        <span style={{ position: 'absolute', top: 4, right: 4, fontSize: 6, color: 'rgba(255,255,255,.85)' }}>●</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop hover tooltip */}
      <Tooltip {...tooltip} />

      {/* Mobile bottom sheet */}
      {sheet && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', background: 'rgba(10,31,77,.4)' }}
          onClick={() => setSheet(null)}
        >
          <div
            style={{
              width: '100%', background: 'var(--paper)',
              borderTop: '1px solid var(--rule)', borderRadius: '28px 28px 0 0',
              padding: 28, display: 'flex', flexDirection: 'column', gap: 14,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 32, marginBottom: 6 }}>{getAirportInfo(sheet.legs[0]?.to_airport ?? '').flag}</div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)' }}>
                  {tripRoute(sheet)}
                </div>
              </div>
              <button
                onClick={() => setSheet(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--ink-3)', padding: 8 }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              Depart: <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{fmtDate(tripFirstDep(sheet))}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              Return: <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{fmtDate(tripLastDep(sheet))}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              Duration: <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{sheet.days_outside_uk} day{sheet.days_outside_uk !== 1 ? 's' : ''} outside UK</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
