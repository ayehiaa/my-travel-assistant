'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { Airport } from '@/types/flights'
import AirportAutocomplete from '@/components/search/AirportAutocomplete'

type Props = { onClose: () => void }

const today = new Date().toISOString().split('T')[0]
const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]

export default function AddPastTripModal({ onClose }: Props) {
  const router = useRouter()
  const toast = useToast()

  const [origin, setOrigin] = useState<Airport | null>(null)
  const [destination, setDestination] = useState<Airport | null>(null)
  const [departureDate, setDepartureDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [saving, setSaving] = useState(false)

  const isValid =
    origin !== null &&
    destination !== null &&
    departureDate !== '' &&
    returnDate !== '' &&
    returnDate > departureDate

  const days = isValid
    ? Math.max(0, Math.round((new Date(returnDate).getTime() - new Date(departureDate).getTime()) / 86_400_000) - 1)
    : 0

  async function handleSave() {
    if (!isValid || !origin || !destination) return
    setSaving(true)
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          trip_type: 'round_trip',
          legs: [
            { from_airport: origin.iataCode, to_airport: destination.iataCode, departure_at: departureDate },
            { from_airport: destination.iataCode, to_airport: origin.iataCode, departure_at: returnDate },
          ],
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save trip')
      }
      toast('Past trip added', 'success')
      onClose()
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save trip', 'error')
      setSaving(false)
    }
  }

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
        maxWidth: 580,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
        animation: 'modalRise .22s ease',
      }}>
        {/* Header */}
        <div style={{
          position: 'relative',
          padding: '24px 28px 18px',
          background: 'linear-gradient(135deg, var(--lavender-soft) 0%, var(--paper) 100%)',
          borderBottom: '1px solid var(--rule)',
        }}>
          <h3 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Add a past trip
          </h3>
          <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>
            For trips taken before Sojourn, or booked elsewhere. Flight details optional.
          </p>
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
        <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>From</label>
              <AirportAutocomplete
                label=""
                placeholder="Origin airport…"
                value={origin}
                onChange={setOrigin}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>To</label>
              <AirportAutocomplete
                label=""
                placeholder="Destination airport…"
                value={destination}
                onChange={setDestination}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Departure date</label>
              <input
                type="date"
                value={departureDate}
                max={yesterday}
                style={inputStyle}
                onChange={(e) => {
                  setDepartureDate(e.target.value)
                  if (returnDate && returnDate <= e.target.value) setReturnDate('')
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--blue-700)'; e.target.style.boxShadow = '0 0 0 3px var(--blue-100)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--rule)'; e.target.style.boxShadow = 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Return date</label>
              <input
                type="date"
                value={returnDate}
                min={departureDate || undefined}
                max={today}
                disabled={!departureDate}
                style={{ ...inputStyle, background: !departureDate ? 'var(--paper-2)' : 'white', color: !departureDate ? 'var(--ink-4)' : 'var(--ink)' }}
                onChange={(e) => setReturnDate(e.target.value)}
                onFocus={e => { e.target.style.borderColor = 'var(--blue-700)'; e.target.style.boxShadow = '0 0 0 3px var(--blue-100)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--rule)'; e.target.style.boxShadow = 'none' }}
              />
            </div>
          </div>

          {/* Summary strip */}
          {isValid && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 14px',
              background: 'var(--yellow-soft)',
              border: '1px dashed var(--yellow)',
              borderRadius: 10,
              fontFamily: 'var(--mono)',
              fontSize: 13, fontWeight: 600,
              color: 'var(--ink)',
            }}>
              <span>{origin?.iataCode} → {destination?.iataCode} → {origin?.iataCode}</span>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
                {days} day{days !== 1 ? 's' : ''} outside UK
              </strong>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '16px 28px',
          background: 'var(--paper-2)',
          borderTop: '1px solid var(--rule)',
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
            {saving ? 'Saving…' : 'Save trip ✓'}
          </button>
        </div>
      </div>
    </div>
  )
}
