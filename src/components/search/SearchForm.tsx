'use client'

import AirportAutocomplete from './AirportAutocomplete'
import { Airport, TimeSlot } from '@/types/flights'

export type SearchFormState = {
  origin: Airport | null
  destination: Airport | null
  departureDate: string
  returnDate: string
  outboundSlot: TimeSlot
  returnSlot: TimeSlot
}

type Props = {
  form: SearchFormState
  onChange: (updates: Partial<SearchFormState>) => void
  onSubmit: () => void
  loading: boolean
}

export default function SearchForm({ form, onChange, onSubmit, loading }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const minReturn = form.departureDate
    ? new Date(new Date(form.departureDate).getTime() + 86_400_000).toISOString().split('T')[0]
    : today

  const isValid = !!(form.origin && form.destination && form.departureDate && form.returnDate)

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (isValid) onSubmit() }}
      className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AirportAutocomplete
          label="From"
          placeholder="Departure city or airport"
          value={form.origin}
          onChange={v => onChange({ origin: v })}
        />
        <AirportAutocomplete
          label="To"
          placeholder="Destination city or airport"
          value={form.destination}
          onChange={v => onChange({ destination: v })}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Departure date</label>
          <input
            type="date"
            min={today}
            value={form.departureDate}
            onChange={e => {
              const d = e.target.value
              onChange({ departureDate: d, returnDate: form.returnDate <= d ? '' : form.returnDate })
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
            value={form.returnDate}
            onChange={e => onChange({ returnDate: e.target.value })}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <SlotToggle
          label="Outbound time"
          value={form.outboundSlot}
          onChange={v => onChange({ outboundSlot: v })}
        />
        <SlotToggle
          label="Return time"
          value={form.returnSlot}
          onChange={v => onChange({ returnSlot: v })}
        />
      </div>

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

function SlotToggle({
  label,
  value,
  onChange,
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
