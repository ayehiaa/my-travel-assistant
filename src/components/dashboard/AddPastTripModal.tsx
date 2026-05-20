'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { Airport } from '@/types/flights'
import { TripWithUsers } from '@/types/database'
import AirportAutocomplete from '@/components/search/AirportAutocomplete'

type Props = {
  onClose: () => void
  tripToEdit?: TripWithUsers
  isUpcoming?: boolean
}
type TripType = 'round_trip' | 'multi_city'
type LegState = { from: Airport | null; to: Airport | null; date: string }

const today     = new Date().toISOString().split('T')[0]
const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]

function calcDays(first: string, last: string) {
  return Math.max(0, Math.round((new Date(last).getTime() - new Date(first).getTime()) / 86_400_000) - 1)
}

const emptyLeg = (): LegState => ({ from: null, to: null, date: '' })

function makeAirport(code: string): Airport {
  return { iataCode: code, name: code, cityName: code }
}

export default function AddPastTripModal({ onClose, tripToEdit, isUpcoming }: Props) {
  const router = useRouter()
  const toast  = useToast()

  const legs = tripToEdit?.legs ?? []

  const [tripType, setTripType] = useState<TripType>(
    tripToEdit?.trip_type === 'multi_city' ? 'multi_city' : 'round_trip'
  )
  const [saving,   setSaving]   = useState(false)

  // ── Round-trip state ──────────────────────────────────────────────────────
  const [rtOrigin, setRtOrigin] = useState<Airport | null>(
    legs[0] ? makeAirport(legs[0].from_airport) : null
  )
  const [rtDest,   setRtDest]   = useState<Airport | null>(
    legs[0] ? makeAirport(legs[0].to_airport) : null
  )
  const [rtDep,    setRtDep]    = useState(
    legs[0] ? legs[0].departure_at.split('T')[0] : ''
  )
  const [rtRet,    setRtRet]    = useState(
    legs[1] ? legs[1].departure_at.split('T')[0] : ''
  )

  const rtValid = rtOrigin !== null && rtDest !== null && rtDep !== '' && rtRet !== '' && rtRet > rtDep
  const rtDays  = rtValid ? calcDays(rtDep, rtRet) : 0

  // ── Multi-city state ──────────────────────────────────────────────────────
  const [mcLegs, setMcLegs] = useState<LegState[]>(() => {
    if (tripToEdit?.trip_type === 'multi_city' && legs.length >= 2) {
      return legs.map(l => ({
        from: makeAirport(l.from_airport),
        to:   makeAirport(l.to_airport),
        date: l.departure_at.split('T')[0],
      }))
    }
    return [emptyLeg(), emptyLeg()]
  })

  const mcValid =
    mcLegs.every(l => l.from !== null && l.to !== null && l.date !== '') &&
    (isUpcoming ? true : mcLegs[0].date <= yesterday) &&
    mcLegs.every((l, i) => i === 0 || l.date >= mcLegs[i - 1].date)

  const mcDays = mcValid ? calcDays(mcLegs[0].date, mcLegs[mcLegs.length - 1].date) : 0

  function updateLeg(index: number, patch: Partial<LegState>) {
    setMcLegs(prev => {
      const next = prev.map((l, i) => i === index ? { ...l, ...patch } : { ...l })
      // Auto-fill next leg's `from` when current leg's `to` changes
      if ('to' in patch && patch.to !== undefined && index + 1 < next.length) {
        next[index + 1] = { ...next[index + 1], from: patch.to }
      }
      // Clear subsequent dates that became invalid
      if ('date' in patch && patch.date) {
        for (let j = index + 1; j < next.length; j++) {
          if (next[j].date && next[j].date < patch.date) {
            next[j] = { ...next[j], date: '' }
          }
        }
      }
      return next
    })
  }

  function addLeg() {
    setMcLegs(prev => {
      const newFrom = prev[prev.length - 1].to
      const newTo   = prev.length === 2 ? prev[0].from : null
      return [...prev, { from: newFrom, to: newTo, date: '' }]
    })
  }

  function removeLeg(index: number) {
    setMcLegs(prev => {
      const next = prev.filter((_, i) => i !== index)
      // Re-sync the leg that shifted into the removed slot
      if (index < next.length && index > 0) {
        next[index] = { ...next[index], from: prev[index - 1].to }
      }
      return next
    })
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try {
      const body = tripType === 'round_trip'
        ? {
            source: 'manual',
            trip_type: 'round_trip',
            legs: [
              { from_airport: rtOrigin!.iataCode, to_airport: rtDest!.iataCode, departure_at: rtDep },
              { from_airport: rtDest!.iataCode,   to_airport: rtOrigin!.iataCode, departure_at: rtRet },
            ],
          }
        : {
            source: 'manual',
            trip_type: 'multi_city',
            legs: mcLegs.map(l => ({
              from_airport: l.from!.iataCode,
              to_airport:   l.to!.iataCode,
              departure_at: l.date,
            })),
          }

      const url    = tripToEdit ? `/api/trips/${tripToEdit.id}` : '/api/trips'
      const method = tripToEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        if (res.status === 404) {
          toast('Trip not found — it may have been deleted.', 'error')
          setSaving(false)
          return
        }
        const data = await res.json()
        throw new Error(data.error ?? (tripToEdit ? 'Failed to update trip' : 'Failed to save trip'))
      }

      toast(tripToEdit ? 'Trip updated' : 'Past trip added', 'success')
      onClose()
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : (tripToEdit ? 'Failed to update trip' : 'Failed to save trip'), 'error')
      setSaving(false)
    }
  }

  const isValid = tripType === 'round_trip' ? rtValid : mcValid

  // ── Styles ────────────────────────────────────────────────────────────────
  const inputStyle = {
    border: '1.5px solid var(--rule)',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 14,
    fontWeight: 600,
    background: 'white',
    width: '100%',
    boxSizing: 'border-box' as const,
    fontFamily: 'var(--sans)',
    outline: 'none',
    color: 'var(--ink)',
  }

  const focusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = 'var(--blue-700)'
      e.target.style.boxShadow   = '0 0 0 3px var(--blue-100)'
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = 'var(--rule)'
      e.target.style.boxShadow   = 'none'
    },
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: 'var(--ink-3)',
  }

  // ── Route string for summary strip ────────────────────────────────────────
  const mcRouteParts = mcValid
    ? [mcLegs[0].from!.iataCode, ...mcLegs.map(l => l.to!.iataCode)]
    : []

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(10,31,77,.55)',
        backdropFilter: 'blur(4px)',
        display: 'grid', placeItems: 'center',
        zIndex: 100,
        padding: 20,
        animation: 'modalIn .18s ease',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'white',
        borderRadius: 'var(--r-xl)',
        width: '100%',
        maxWidth: 600,
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
        animation: 'modalRise .22s ease',
      }}>

        {/* Header */}
        <div style={{
          position: 'relative',
          padding: '24px 28px 18px',
          background: 'linear-gradient(135deg, var(--lavender-soft) 0%, var(--paper) 100%)',
          borderBottom: '1px solid var(--rule)',
          flexShrink: 0,
        }}>
          <h3 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            {tripToEdit ? 'Edit trip' : 'Add a past trip'}
          </h3>
          <p style={{ margin: '0 0 16px', color: 'var(--ink-3)', fontSize: 13 }}>
            {tripToEdit ? 'Update airports or dates.' : 'For trips taken before Sojourn, or booked elsewhere. Flight details optional.'}
          </p>

          {tripToEdit?.source === 'search' && (
            <div style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: 13,
              padding: '8px 14px',
              borderRadius: 8,
              marginTop: 12,
            }}>
              Saving will remove stored flight details.
            </div>
          )}

          {/* Tab switcher */}
          <div style={{ display: 'inline-flex', gap: 4, background: 'rgba(0,0,0,.06)', borderRadius: 999, padding: 4 }}>
            {(['round_trip', 'multi_city'] as const).map(type => (
              <button
                key={type}
                onClick={() => setTripType(type)}
                style={{
                  padding: '6px 14px', borderRadius: 999, border: 'none',
                  fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                  background: tripType === type ? 'white' : 'transparent',
                  color: tripType === type ? 'var(--blue-700)' : 'var(--ink-3)',
                  boxShadow: tripType === type ? 'var(--shadow-sm)' : 'none',
                  transition: 'all .12s',
                }}
              >
                {type === 'round_trip' ? 'Round trip' : 'Multi-city'}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute', top: 18, right: 18,
              width: 32, height: 32, borderRadius: '50%',
              background: 'white', color: 'var(--ink-2)',
              display: 'grid', placeItems: 'center',
              fontSize: 22, fontWeight: 600,
              border: '1px solid var(--rule)',
              cursor: 'pointer', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>

          {/* ── Round trip ── */}
          {tripType === 'round_trip' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={labelStyle}>From</label>
                  <AirportAutocomplete label="" placeholder="Origin airport…" value={rtOrigin} onChange={setRtOrigin} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={labelStyle}>To</label>
                  <AirportAutocomplete label="" placeholder="Destination airport…" value={rtDest} onChange={setRtDest} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={labelStyle}>Departure date</label>
                  <input
                    type="date" value={rtDep} max={isUpcoming ? undefined : yesterday} style={inputStyle}
                    onChange={e => { setRtDep(e.target.value); if (rtRet && rtRet <= e.target.value) setRtRet('') }}
                    {...focusHandlers}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={labelStyle}>Return date</label>
                  <input
                    type="date" value={rtRet}
                    min={rtDep || undefined} max={isUpcoming ? undefined : today}
                    disabled={!rtDep}
                    style={{ ...inputStyle, background: !rtDep ? 'var(--paper-2)' : 'white', color: !rtDep ? 'var(--ink-4)' : 'var(--ink)' }}
                    onChange={e => setRtRet(e.target.value)}
                    {...focusHandlers}
                  />
                </div>
              </div>

              {rtValid && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 14px',
                  background: 'var(--yellow-soft)',
                  border: '1px dashed var(--yellow)',
                  borderRadius: 10,
                  fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                }}>
                  <span>{rtOrigin?.iataCode} → {rtDest?.iataCode} → {rtOrigin?.iataCode}</span>
                  <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
                    {rtDays} day{rtDays !== 1 ? 's' : ''} outside UK
                  </strong>
                </div>
              )}
            </>
          )}

          {/* ── Multi-city ── */}
          {tripType === 'multi_city' && (
            <>
              {mcLegs.map((leg, i) => (
                <div key={i} style={{
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--r)',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}>
                  {/* Leg header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ ...labelStyle }}>Leg {i + 1}</span>
                    {i >= 1 && mcLegs.length > 2 && (
                      <button
                        onClick={() => removeLeg(i)}
                        style={{
                          width: 24, height: 24, borderRadius: '50%',
                          border: '1px solid var(--rule)',
                          background: 'white', color: 'var(--ink-3)',
                          display: 'grid', placeItems: 'center',
                          fontSize: 16, cursor: 'pointer', lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* From / To */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <AirportAutocomplete
                      label="" placeholder="From…"
                      value={leg.from}
                      onChange={from => updateLeg(i, { from })}
                    />
                    <AirportAutocomplete
                      label="" placeholder="To…"
                      value={leg.to}
                      onChange={to => updateLeg(i, { to })}
                    />
                  </div>

                  {/* Date */}
                  <input
                    type="date"
                    value={leg.date}
                    max={i === 0 ? (isUpcoming ? undefined : yesterday) : undefined}
                    min={i > 0 ? (mcLegs[i - 1].date || undefined) : undefined}
                    disabled={i > 0 && !mcLegs[i - 1].date}
                    style={{
                      ...inputStyle,
                      width: '50%',
                      background: (i > 0 && !mcLegs[i - 1].date) ? 'var(--paper-2)' : 'white',
                      color: (i > 0 && !mcLegs[i - 1].date) ? 'var(--ink-4)' : 'var(--ink)',
                    }}
                    onChange={e => updateLeg(i, { date: e.target.value })}
                    {...focusHandlers}
                  />
                </div>
              ))}

              {/* Add leg button */}
              {mcLegs.length < 3 && (
                <button
                  onClick={addLeg}
                  style={{
                    padding: '10px', border: '1.5px dashed var(--blue-500)',
                    borderRadius: 'var(--r)', background: 'var(--blue-50)',
                    color: 'var(--blue-700)', fontWeight: 600, fontSize: 13,
                    cursor: 'pointer', fontFamily: 'var(--sans)',
                    transition: 'background .12s',
                  }}
                  onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--blue-100)' }}
                  onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--blue-50)' }}
                >
                  + Add leg
                </button>
              )}

              {/* Summary strip */}
              {mcValid && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 14px',
                  background: 'var(--yellow-soft)',
                  border: '1px dashed var(--yellow)',
                  borderRadius: 10,
                  fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                  flexWrap: 'wrap', gap: 8,
                }}>
                  <span>{mcRouteParts.join(' → ')}</span>
                  <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
                    {mcDays} day{mcDays !== 1 ? 's' : ''} outside UK
                  </strong>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '16px 28px',
          background: 'var(--paper-2)',
          borderTop: '1px solid var(--rule)',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 20px', border: '1.5px solid var(--rule)', borderRadius: 'var(--r)', fontSize: 14, fontWeight: 600, color: 'var(--ink-2)', background: 'white', cursor: 'pointer', fontFamily: 'var(--sans)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            style={{
              padding: '10px 20px', borderRadius: 'var(--r)', fontSize: 14, fontWeight: 700, border: 'none',
              background: isValid && !saving ? 'var(--blue-700)' : 'var(--rule)',
              color: isValid && !saving ? 'white' : 'var(--ink-4)',
              cursor: isValid && !saving ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--sans)',
              transition: 'background .12s',
            }}
          >
            {saving ? 'Saving…' : (tripToEdit ? 'Save changes' : 'Save trip')}
          </button>
        </div>
      </div>
    </div>
  )
}
