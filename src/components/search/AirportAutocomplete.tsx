'use client'

import { useState, useEffect, useRef } from 'react'
import { Airport } from '@/types/flights'

type Props = {
  label: string
  placeholder?: string
  value: Airport | null
  onChange: (airport: Airport | null) => void
}

export default function AirportAutocomplete({ label, placeholder, value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Airport[]>([])
  const [open, setOpen] = useState(false)
  const [fetching, setFetching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value) setQuery(`${value.cityName} (${value.iataCode})`)
  }, [value])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (value || query.length < 2) { setResults([]); setOpen(false); return }

    timer.current = setTimeout(async () => {
      setFetching(true)
      try {
        const res = await fetch(`/api/airports?q=${encodeURIComponent(query)}`)
        const data: Airport[] = await res.json()
        setResults(data)
        setOpen(data.length > 0)
      } catch {
        setResults([])
      } finally {
        setFetching(false)
      }
    }, 300)
  }, [query, value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function select(airport: Airport) {
    onChange(airport)
    setQuery(`${airport.cityName} (${airport.iataCode})`)
    setOpen(false)
    setResults([])
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    if (value) onChange(null)
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder ?? 'City or airport…'}
          autoComplete="off"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {fetching && (
          <span className="absolute right-3 top-2.5 text-xs text-gray-400">…</span>
        )}
      </div>

      {open && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {results.map(a => (
            <li
              key={a.iataCode}
              onMouseDown={() => select(a)}
              className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm"
            >
              <span>
                <span className="font-medium text-gray-900">{a.cityName}</span>
                <span className="text-gray-500 ml-1 text-xs">{a.name}</span>
              </span>
              <span className="font-mono text-xs text-blue-600 ml-2 shrink-0">{a.iataCode}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
