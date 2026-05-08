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
    <form
      onSubmit={e => { e.preventDefault(); if (isValid) onSubmit() }}
      className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm"
    >
      {/* Trip type tabs */}
      <div className="flex rounded-lg border border-gray-300 overflow-hidden mb-5 w-fit">
        {(['round_trip', 'multi_city'] as TripType[]).map(type => (
          <button
            key={type}
            type="button"
            onClick={() => onSetTripType(type)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tripType === type
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {type === 'round_trip' ? 'Round trip' : 'Multi-city'}
          </button>
        ))}
      </div>

      {tripType === 'round_trip' ? (
        <RoundTripForm legs={legs} onUpdateLeg={onUpdateLeg} today={today} />
      ) : (
        <MultiCityForm
          legs={legs}
          onUpdateLeg={onUpdateLeg}
          onAddLeg={onAddLeg}
          onRemoveLeg={onRemoveLeg}
          today={today}
        />
      )}

      <button
        type="submit"
        disabled={!isValid || loading}
        className="mt-5 w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {loading ? 'Searching…' : 'Search flights'}
      </button>
    </form>
  )
}

function RoundTripForm({
  legs, onUpdateLeg, today,
}: {
  legs: LegFormState[]
  onUpdateLeg: (index: number, updates: Partial<LegFormState>) => void
  today: string
}) {
  const outbound = legs[0]
  const ret      = legs[1]
  if (!outbound || !ret) return null

  const minReturn = outbound.date
    ? new Date(new Date(outbound.date).getTime() + 86_400_000).toISOString().split('T')[0]
    : today

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <AirportAutocomplete
        label="From"
        placeholder="Departure city or airport"
        value={outbound.origin}
        onChange={v => onUpdateLeg(0, { origin: v })}
      />
      <AirportAutocomplete
        label="To"
        placeholder="Destination city or airport"
        value={outbound.destination}
        onChange={v => onUpdateLeg(0, { destination: v })}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Departure date</label>
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Return date</label>
        <input
          type="date"
          min={minReturn}
          value={ret.date}
          onChange={e => onUpdateLeg(1, { date: e.target.value })}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <SlotToggle
        label="Outbound time"
        value={outbound.slot}
        onChange={v => onUpdateLeg(0, { slot: v })}
      />
      <SlotToggle
        label="Return time"
        value={ret.slot}
        onChange={v => onUpdateLeg(1, { slot: v })}
      />
    </div>
  )
}

function MultiCityForm({
  legs, onUpdateLeg, onAddLeg, onRemoveLeg, today,
}: {
  legs: LegFormState[]
  onUpdateLeg: (index: number, updates: Partial<LegFormState>) => void
  onAddLeg: () => void
  onRemoveLeg: (index: number) => void
  today: string
}) {
  return (
    <div className="space-y-4">
      {legs.map((leg, i) => (
        <LegRow
          key={i}
          index={i}
          leg={leg}
          canRemove={i >= 1}
          today={today}
          onUpdate={updates => onUpdateLeg(i, updates)}
          onRemove={() => onRemoveLeg(i)}
        />
      ))}
      {legs.length < 3 && (
        <button
          type="button"
          onClick={onAddLeg}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          <span className="text-base leading-none font-bold">+</span> Add leg
        </button>
      )}
    </div>
  )
}

function LegRow({
  index, leg, canRemove, today, onUpdate, onRemove,
}: {
  index: number
  leg: LegFormState
  canRemove: boolean
  today: string
  onUpdate: (updates: Partial<LegFormState>) => void
  onRemove: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Leg {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-gray-400 hover:text-red-500 text-xl leading-none transition-colors"
            aria-label={`Remove leg ${index + 1}`}
          >
            ×
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AirportAutocomplete
          label="From"
          placeholder="Departure city or airport"
          value={leg.origin}
          onChange={v => onUpdate({ origin: v })}
        />
        <AirportAutocomplete
          label="To"
          placeholder="Destination city or airport"
          value={leg.destination}
          onChange={v => onUpdate({ destination: v })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            min={today}
            value={leg.date}
            onChange={e => onUpdate({ date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <SlotToggle
          label="Time of day"
          value={leg.slot}
          onChange={v => onUpdate({ slot: v })}
        />
      </div>
    </div>
  )
}

function SlotToggle({
  label, value, onChange,
}: {
  label: string
  value: TimeSlot
  onChange: (v: TimeSlot) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex rounded-lg border border-gray-300 overflow-hidden">
        {(['morning', 'evening'] as TimeSlot[]).map(slot => (
          <button
            key={slot}
            type="button"
            onClick={() => onChange(slot)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              value === slot
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {slot === 'morning' ? 'Morning (06–13)' : 'Evening (13–24)'}
          </button>
        ))}
      </div>
    </div>
  )
}
