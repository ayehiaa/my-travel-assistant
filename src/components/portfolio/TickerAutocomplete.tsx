'use client'

import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/context/ToastContext'
import Skeleton from '@/components/ui/Skeleton'

interface TickerResult {
  ticker: string
  name: string
  primary_exchange: string
}

interface Props {
  onSelect: (result: TickerResult) => void
  disabled?: boolean
}

const inputStyle: React.CSSProperties = {
  border: '1.5px solid var(--rule)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  fontWeight: 600,
  background: 'white',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'var(--sans)',
  outline: 'none',
  color: 'var(--ink)',
}

export default function TickerAutocomplete({ onSelect, disabled }: Props) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TickerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trimmed = query.trim()

    const timer = setTimeout(async () => {
      if (trimmed.length < 2) {
        setResults([])
        setOpen(false)
        return
      }

      setLoading(true)
      try {
        const res = await fetch(
          `/api/portfolio/tickers/search?q=${encodeURIComponent(trimmed)}`
        )
        if (!res.ok) {
          toast('Ticker search failed', 'error')
          setResults([])
          setOpen(false)
          return
        }
        const data = await res.json()
        setResults(data.results ?? [])
        setOpen(true)
      } catch {
        toast('Ticker search failed', 'error')
        setResults([])
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }, trimmed.length < 2 ? 0 : 300)

    return () => clearTimeout(timer)
  }, [query, toast])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(result: TickerResult) {
    onSelect(result)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder="Search ticker or company name…"
        style={{
          ...inputStyle,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={e => {
          e.target.style.borderColor = 'var(--blue-700)'
          e.target.style.boxShadow = '0 0 0 3px var(--blue-100)'
          if (results.length > 0) setOpen(true)
        }}
        onBlur={e => {
          e.target.style.borderColor = 'var(--rule)'
          e.target.style.boxShadow = 'none'
        }}
        aria-label="Search for a stock ticker"
        aria-autocomplete="list"
      />

      {loading && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'white',
            border: '1px solid var(--rule)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-lg)',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <Skeleton className="h-8 w-full rounded" />
          <Skeleton className="h-8 w-full rounded" />
          <Skeleton className="h-8 w-full rounded" />
        </div>
      )}

      {!loading && open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'white',
            border: '1px solid var(--rule)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-lg)',
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {results.length === 0 ? (
            <div
              style={{
                padding: '10px 14px',
                fontSize: 13,
                color: 'var(--ink-3)',
                fontFamily: 'var(--sans)',
              }}
            >
              No results
            </div>
          ) : (
            results.map(result => (
              <button
                key={result.ticker}
                role="option"
                aria-selected={false}
                type="button"
                onMouseDown={() => handleSelect(result)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)',
                  borderBottom: '1px solid var(--rule)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2, #f8f8fb)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'none'
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: 'var(--ink)',
                    fontFamily: 'var(--mono)',
                    marginRight: 6,
                  }}
                >
                  {result.ticker}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                  — {result.name}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
