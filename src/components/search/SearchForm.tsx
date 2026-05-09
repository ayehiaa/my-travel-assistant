'use client'

import AirportAutocomplete from './AirportAutocomplete'
import { LegFormState, TimeSlot } from '@/types/flights'

type TripType = 'round_trip' | 'multi_city'

type Props = {
  tripType: TripType
  legs: LegFormState[]
  onSetTripType: (type: TripType) => void
  onUpdateLeg: (index: number, updates: Partial<LegFormState>) => void
  onAddLeg: () => void
  onRemoveLeg: (index: number) => void
  onSubmit: () => void
  loading: boolean
}

export default function SearchForm({
  tripType, legs, onSetTripType, onUpdateLeg, onAddLeg, onRemoveLeg, onSubmit, loading,
}: Props) {
  const today = new Date().toISOString().split('T')[0]

  const isValid = tripType === 'round_trip'
    ? !!(legs[0]?.origin && legs[0]?.destination && legs[0]?.date && legs[1]?.date)
    : legs.length >= 2 && legs.every(l => l.origin && l.destination && l.date)

  return (
    <form onSubmit={e => { e.preventDefault(); if (isValid) onSubmit() }}>
      {/* Trip-type pill tabs — white/10 pill on dark hero bg */}
      <div style={{
        display: 'inline-flex',
        background: 'rgba(255,255,255,.12)',
        borderRadius: 999,
        padding: 4,
        marginBottom: 20,
      }}>
        {(['round_trip', 'multi_city'] as TripType[]).map(type => (
          <button
            key={type}
            type="button"
            onClick={() => onSetTripType(type)}
            style={{
              borderRadius: 999,
              padding: '8px 18px',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              transition: 'background .15s, color .15s',
              background: tripType === type ? 'white' : 'transparent',
              color: tripType === type ? 'var(--blue-700)' : 'rgba(255,255,255,.85)',
              fontFamily: 'var(--sans)',
            }}
          >
            {type === 'round_trip' ? 'Round trip' : 'Multi-city · up to 3 legs'}
          </button>
        ))}
      </div>

      {tripType === 'round_trip' ? (
        <RoundTripBar legs={legs} onUpdateLeg={onUpdateLeg} today={today} loading={loading} isValid={isValid} />
      ) : (
        <MultiCityStack legs={legs} onUpdateLeg={onUpdateLeg} onAddLeg={onAddLeg} onRemoveLeg={onRemoveLeg} today={today} loading={loading} isValid={isValid} />
      )}
    </form>
  )
}

function RoundTripBar({
  legs, onUpdateLeg, today, loading, isValid,
}: {
  legs: LegFormState[]
  onUpdateLeg: (index: number, updates: Partial<LegFormState>) => void
  today: string
  loading: boolean
  isValid: boolean
}) {
  const outbound = legs[0]
  const ret      = legs[1]
  if (!outbound || !ret) return null

  const minReturn = outbound.date
    ? new Date(new Date(outbound.date).getTime() + 86_400_000).toISOString().split('T')[0]
    : today

  const days = outbound.date && ret.date
    ? Math.max(1, Math.round((new Date(ret.date).getTime() - new Date(outbound.date).getTime()) / 86_400_000))
    : null

  return (
    <>
      {/* Yellow-bordered search bar */}
      <div style={{
        background: 'white',
        border: '3px solid var(--yellow)',
        borderRadius: 'var(--r)',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr auto',
      }}>
        <SearchField label="From" separator>
          <AirportAutocomplete
            label=""
            placeholder="Departure city or airport"
            value={outbound.origin}
            onChange={v => onUpdateLeg(0, { origin: v })}
          />
        </SearchField>

        <SearchField label="To" separator>
          <AirportAutocomplete
            label=""
            placeholder="Destination city or airport"
            value={outbound.destination}
            onChange={v => {
              onUpdateLeg(0, { destination: v })
              onUpdateLeg(1, { origin: v })
            }}
          />
        </SearchField>

        <SearchField label="Depart" separator>
          <input
            type="date"
            min={today}
            value={outbound.date}
            onChange={e => {
              const d = e.target.value
              onUpdateLeg(0, { date: d })
              if (ret.date && ret.date <= d) onUpdateLeg(1, { date: '' })
            }}
            required
            style={dateInputStyle}
          />
        </SearchField>

        <SearchField label={`Return${days ? ` · ${days}d` : ''}`}>
          <input
            type="date"
            min={minReturn}
            value={ret.date}
            onChange={e => onUpdateLeg(1, { date: e.target.value })}
            required
            style={dateInputStyle}
          />
        </SearchField>

        <button
          type="submit"
          disabled={!isValid || loading}
          style={{
            background: 'var(--yellow)', color: 'var(--blue-900)',
            border: 'none', padding: '0 28px',
            fontWeight: 700, fontSize: 15, cursor: 'pointer',
            fontFamily: 'var(--sans)', whiteSpace: 'nowrap',
            opacity: (!isValid || loading) ? 0.5 : 1,
            transition: 'opacity .15s',
          }}
        >
          {loading ? 'Searching…' : 'Search →'}
        </button>
      </div>

      {/* Slot toggles below bar */}
      <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
        <SlotGroup label="Outbound" value={outbound.slot} onChange={v => onUpdateLeg(0, { slot: v })} />
        <SlotGroup label="Return" value={ret.slot} onChange={v => onUpdateLeg(1, { slot: v })} />
      </div>
    </>
  )
}

function MultiCityStack({
  legs, onUpdateLeg, onAddLeg, onRemoveLeg, today, loading, isValid,
}: {
  legs: LegFormState[]
  onUpdateLeg: (index: number, updates: Partial<LegFormState>) => void
  onAddLeg: () => void
  onRemoveLeg: (index: number) => void
  today: string
  loading: boolean
  isValid: boolean
}) {
  return (
    <div>
      <div style={{
        background: 'white',
        border: '3px solid var(--yellow)',
        borderRadius: 'var(--r)',
      }}>
        {legs.map((leg, i) => (
          <div key={i} style={{
            padding: '16px 18px',
            borderBottom: i < legs.length - 1 ? '1px solid var(--rule)' : 'none',
          }}>
            {/* Row head */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{
                background: 'var(--blue-100)', color: 'var(--blue-700)',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                padding: '3px 10px', borderRadius: 999,
              }}>
                Leg {i + 1}
              </span>
              {i >= 1 && (
                <button
                  type="button"
                  onClick={() => onRemoveLeg(i)}
                  style={{
                    marginLeft: 'auto',
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'var(--rule)', border: 'none', cursor: 'pointer',
                    fontSize: 16, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--sans)',
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {/* Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr 1fr', gap: 12, alignItems: 'start' }}>
              <AirportAutocomplete
                label="From"
                placeholder="Departure city or airport"
                value={leg.origin}
                onChange={v => onUpdateLeg(i, { origin: v })}
              />

              <span style={{ color: 'var(--ink-4)', fontSize: 20, paddingTop: 28 }}>→</span>

              <AirportAutocomplete
                label="To"
                placeholder="Destination city or airport"
                value={leg.destination}
                onChange={v => onUpdateLeg(i, { destination: v })}
              />

              <div>
                <label style={fieldLabelStyle}>Date</label>
                <input
                  type="date"
                  min={today}
                  value={leg.date}
                  onChange={e => onUpdateLeg(i, { date: e.target.value })}
                  style={legDateInputStyle}
                />
              </div>
            </div>

            {/* Inline slot pills */}
            <div style={{ marginTop: 10 }}>
              <SlotGroup label="Time" value={leg.slot} onChange={v => onUpdateLeg(i, { slot: v })} inline />
            </div>
          </div>
        ))}
      </div>

      {/* Actions below the card */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        {legs.length < 3 ? (
          <button
            type="button"
            onClick={onAddLeg}
            style={{
              fontSize: 14, fontWeight: 600, color: 'white',
              background: 'rgba(255,255,255,.15)', border: '1.5px dashed rgba(255,255,255,.5)',
              borderRadius: 999, padding: '8px 18px',
              cursor: 'pointer', fontFamily: 'var(--sans)',
            }}
          >
            + Add leg
          </button>
        ) : (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>Maximum 3 legs</span>
        )}

        <button
          type="submit"
          disabled={!isValid || loading}
          style={{
            background: 'var(--yellow)', color: 'var(--blue-900)',
            border: 'none', borderRadius: 999, padding: '12px 28px',
            fontWeight: 700, fontSize: 15, cursor: 'pointer',
            fontFamily: 'var(--sans)',
            opacity: (!isValid || loading) ? 0.5 : 1,
            transition: 'opacity .15s',
          }}
        >
          {loading ? 'Searching…' : 'Search all legs →'}
        </button>
      </div>
    </div>
  )
}

function SearchField({ label, children, separator }: { label: string; children: React.ReactNode; separator?: boolean }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRight: separator ? '1px dotted var(--rule)' : 'none',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </div>
  )
}

function SlotGroup({ label, value, onChange, inline }: { label: string; value: TimeSlot; onChange: (v: TimeSlot) => void; inline?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: inline ? 'var(--ink-2)' : 'rgba(255,255,255,.85)', fontSize: 12 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <div style={{
        display: 'inline-flex',
        background: inline ? 'var(--paper-3)' : 'rgba(255,255,255,.15)',
        borderRadius: 999, padding: 3,
      }}>
        {(['morning', 'evening'] as TimeSlot[]).map(slot => (
          <button
            key={slot}
            type="button"
            onClick={() => onChange(slot)}
            style={{
              borderRadius: 999, padding: '5px 12px',
              fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--sans)', transition: 'background .15s, color .15s',
              background: value === slot
                ? (inline ? 'var(--blue-700)' : 'white')
                : 'transparent',
              color: value === slot
                ? (inline ? 'white' : 'var(--blue-700)')
                : (inline ? 'var(--ink-3)' : 'rgba(255,255,255,.75)'),
            }}
          >
            {slot === 'morning' ? 'AM · 06–13' : 'PM · 13–24'}
          </button>
        ))}
      </div>
    </div>
  )
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-3)',
}

const dateInputStyle: React.CSSProperties = {
  width: '100%', border: 'none', outline: 'none', background: 'transparent',
  fontSize: 15, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--sans)',
  padding: 0,
}

const legDateInputStyle: React.CSSProperties = {
  width: '100%', border: '1.5px solid var(--rule)', borderRadius: 8, outline: 'none',
  background: 'var(--paper)', fontSize: 14, fontWeight: 600, color: 'var(--ink)',
  fontFamily: 'var(--sans)', padding: '8px 10px',
}
