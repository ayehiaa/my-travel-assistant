'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Airport, FlightOffer, FlightSearchResponse, TimeSlot } from '@/types/flights'
import { daysOutsideUK } from '@/lib/daysCalculator'

export type SearchFormState = {
  origin: Airport | null
  destination: Airport | null
  departureDate: string
  returnDate: string
  outboundSlot: TimeSlot
  returnSlot: TimeSlot
}

type SearchStatus = 'idle' | 'loading' | 'success' | 'error'
type SaveStatus = 'idle' | 'saving' | 'error'

const defaultForm: SearchFormState = {
  origin: null,
  destination: null,
  departureDate: '',
  returnDate: '',
  outboundSlot: 'morning',
  returnSlot: 'morning',
}

export function useFlightSearch() {
  const router = useRouter()
  const [form, setFormState] = useState<SearchFormState>(defaultForm)
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [searchError, setSearchError] = useState('')
  const [results, setResults] = useState<FlightSearchResponse | null>(null)
  const [selectedOutbound, setSelectedOutbound] = useState<FlightOffer | null>(null)
  const [selectedReturn, setSelectedReturn] = useState<FlightOffer | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState('')

  const updateForm = useCallback((updates: Partial<SearchFormState>) => {
    setFormState(prev => ({ ...prev, ...updates }))
  }, [])

  const submitSearch = useCallback(async () => {
    if (!form.origin || !form.destination) return

    setSearchStatus('loading')
    setSearchError('')
    setResults(null)
    setSelectedOutbound(null)
    setSelectedReturn(null)
    setShowSummary(false)

    try {
      const res = await fetch('/api/flights/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: form.origin.iataCode,
          destination: form.destination.iataCode,
          departureDate: form.departureDate,
          returnDate: form.returnDate,
          outboundSlot: form.outboundSlot,
          returnSlot: form.returnSlot,
        }),
      })

      if (!res.ok) throw new Error(`Search failed (${res.status})`)

      const data: FlightSearchResponse = await res.json()
      setResults(data)
      setSearchStatus('success')
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Something went wrong')
      setSearchStatus('error')
    }
  }, [form])

  const reviewTrip = useCallback(() => {
    setShowSummary(true)
  }, [])

  const backToResults = useCallback(() => {
    setShowSummary(false)
    setSaveError('')
  }, [])

  const saveTrip = useCallback(async () => {
    if (!selectedOutbound || !selectedReturn || !form.origin || !form.destination) return

    setSaveStatus('saving')
    setSaveError('')

    const body = {
      source: 'search' as const,
      departure_airport: form.origin.iataCode,
      destination_airport: form.destination.iataCode,
      outbound_airline: selectedOutbound.airline,
      outbound_flight_number: selectedOutbound.flightNumber,
      outbound_departure_at: selectedOutbound.departureAt,
      outbound_arrival_at: selectedOutbound.arrivalAt,
      return_airline: selectedReturn.airline,
      return_flight_number: selectedReturn.flightNumber,
      return_departure_at: selectedReturn.departureAt,
      return_arrival_at: selectedReturn.arrivalAt,
      days_outside_uk: daysOutsideUK(selectedOutbound.departureAt, selectedReturn.departureAt),
    }

    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save trip')
      }

      router.push('/')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save trip')
      setSaveStatus('error')
    }
  }, [selectedOutbound, selectedReturn, form, router])

  return {
    form,
    updateForm,
    searchStatus,
    searchError,
    results,
    selectedOutbound,
    setSelectedOutbound,
    selectedReturn,
    setSelectedReturn,
    showSummary,
    submitSearch,
    reviewTrip,
    backToResults,
    saveStatus,
    saveError,
    saveTrip,
  }
}
