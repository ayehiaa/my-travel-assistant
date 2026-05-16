'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { TripWithUsers, ExpenseWithCategory } from '@/types/database'
import { getAirportInfo } from '@/lib/airportCountry'

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

function cover(id: string) {
  return COVERS[id.charCodeAt(0) % 8]
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function legBadge(i: number, total: number, type: string) {
  if (type === 'round_trip') return i === 0 ? 'OUT' : 'RTN'
  return `L${i + 1}`
}

type Props = { trip: TripWithUsers; canDelete: boolean; expenses?: ExpenseWithCategory[] }

export default function TripCard(props: Props) {
  const { trip, canDelete } = props
  const expenses = props.expenses ?? []
  const router = useRouter()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)

  const legs = trip.legs ?? []
  const firstLeg = legs[0]
  const lastLeg = legs[legs.length - 1]
  const destCode = lastLeg?.to_airport ?? '?'
  const destInfo = getAirportInfo(destCode)
  const country = destInfo?.country ?? ''
  const flag = destInfo?.flag ?? ''

  const routeParts: string[] = legs.length
    ? [...legs.map(l => l.from_airport), lastLeg.to_airport]
    : ['?']

  const isMulti = trip.trip_type === 'multi_city'
  const isManual = trip.source === 'manual'
  const bg = cover(trip.id)

  const creatorName = trip.creator?.display_name ?? 'Unknown'
  const modifierName = trip.modifier?.display_name ?? 'Unknown'
  const wasEdited = trip.last_modified_by !== trip.created_by

  async function handleDelete() {
    if (!confirm(`Delete trip ${routeParts.join(' → ')}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast('Trip deleted', 'success')
      router.refresh()
    } catch {
      toast('Failed to delete trip', 'error')
      setDeleting(false)
    }
  }

  return (
    <article style={{
      background: 'var(--paper)',
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
      border: '1px solid var(--rule)',
      transition: 'transform .15s, box-shadow .15s',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
    }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)' }}
      onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      {/* Cover */}
      <div style={{ height: 140, position: 'relative', overflow: 'hidden', background: bg }}>
        {/* Type tag — top left */}
        <span style={{
          position: 'absolute', top: 14, left: 14,
          background: 'rgba(255,255,255,.92)', color: 'var(--ink)',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          padding: '5px 10px', borderRadius: 999, backdropFilter: 'blur(4px)',
        }}>
          {isMulti ? `${legs.length}-city` : isManual ? 'Manual' : 'Round trip'}
        </span>

        {/* Days pill — top right */}
        <span style={{
          position: 'absolute', top: 14, right: 14,
          background: 'var(--yellow)', color: 'var(--blue-900)',
          borderRadius: 999, padding: '6px 12px 6px 10px',
          fontWeight: 700, fontSize: 13,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {trip.days_outside_uk}d abroad
        </span>

        {/* Destination — bottom left */}
        <span style={{
          position: 'absolute', bottom: 14, left: 16,
          color: 'white', fontFamily: 'var(--display)', fontWeight: 700,
          fontSize: 28, letterSpacing: '-0.02em', lineHeight: 1,
          textShadow: '0 2px 8px rgba(0,0,0,.3)',
        }}>
          {flag} {destCode}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Route chain */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em', flexWrap: 'wrap' }}>
          {routeParts.map((code, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span>{code}</span>
              {i < routeParts.length - 1 && <span style={{ color: 'var(--ink-4)', fontSize: 18 }}>→</span>}
            </span>
          ))}
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)' }}>
          {firstLeg && lastLeg && (
            <span><strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{fmtDate(firstLeg.departure_at)}</strong> – {fmtDate(lastLeg.departure_at)}</span>
          )}
          <span>{country}</span>
        </div>

        {/* Flights */}
        {isManual ? (
          <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 12, borderTop: '1px dashed var(--rule)', paddingTop: 12 }}>
            Manually added · flight details not recorded
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px dashed var(--rule)', paddingTop: 12, fontSize: 12 }}>
            {legs.map((leg, i) => (
              <div key={leg.id} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, background: 'var(--paper-3)', color: 'var(--ink-2)', padding: '3px 6px', borderRadius: 4 }}>
                  {legBadge(i, legs.length, trip.trip_type)}
                </span>
                <span style={{ fontWeight: 700 }}>{leg.airline}</span>
                <span style={{ color: 'var(--ink-3)' }}>{leg.flight_number}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>{fmtDate(leg.departure_at)} · {fmtTime(leg.departure_at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', fontSize: 11, color: 'var(--ink-4)', borderTop: '1px solid var(--rule-soft)', paddingTop: 10 }}>
          <span style={{ minWidth: 0 }}>
            Added by {creatorName}
            {wasEdited && <> · Edited by {modifierName}</>}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'var(--blue-700)', fontWeight: 700, cursor: 'pointer' }}>Manage →</span>
            {canDelete && (
              <button
                onClick={e => { e.stopPropagation(); handleDelete() }}
                disabled={deleting}
                style={{ fontSize: 11, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', opacity: deleting ? 0.4 : 1 }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expense panel */}
      <div style={{ borderTop: '1px solid var(--rule-soft)', padding: '14px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Expenses
          </span>
          <a
            href={`/expenses?trip_id=${trip.id}`}
            style={{ fontSize: 12, color: 'var(--blue-700)', fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--sans)' }}
            onClick={e => e.stopPropagation()}
          >
            Add expense →
          </a>
        </div>
        {expenses.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>No expenses for this trip</p>
        ) : (
          <>
            {expenses.slice(0, 3).map(exp => (
              <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6, fontSize: 12 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
                  {exp.title}
                </span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {exp.amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {exp.currency}
                </span>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: exp.reclaimed ? '#d1fae5' : 'var(--paper-2)',
                  color: exp.reclaimed ? '#065f46' : 'var(--ink-4)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}>
                  {exp.reclaimed ? 'Reclaimed' : 'Pending'}
                </span>
              </div>
            ))}
            {expenses.length > 3 && (
              <a
                href={`/expenses?trip_id=${trip.id}`}
                style={{ fontSize: 12, color: 'var(--ink-3)', textDecoration: 'none' }}
                onClick={e => e.stopPropagation()}
              >
                + {expenses.length - 3} more
              </a>
            )}
          </>
        )}
      </div>
    </article>
  )
}
