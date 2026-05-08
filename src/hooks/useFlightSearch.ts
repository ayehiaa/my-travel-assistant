'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  FlightOffer,
  FlightSearchResponse,
  LegFormState,
  MultiCitySearchRequest,
  RoundTripSearchRequest,
} from '@/types/flights'

type TripType = 'round_trip' | 'multi_city'
type SearchStatus = 'idle' | 'loading' | 'success' | 'error'
type SaveStatus = 'idle' | 'saving' | 'error'

const defaultLeg = (): LegFormState => ({
  origin: null,
  destination: null,
  date: '',
  slot: 'morning',
})

export function useFlightSearch() {
  const router = useRouter()
  const [tripType, setTripTypeState] = useState<TripType>('round_trip')
  // round_trip: 2 legs (outbound + return). multi_city: starts with 1, user adds up to 3.
  const [legs, setLegs] = useState<LegFormState[]>([defaultLeg(), defaultLeg()])
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [searchError, setSearchError] = useState('')
  const [results, setResults] = useState<FlightSearchResponse | null>(null)
  const [selectedFlights, setSelectedFlightsState] = useState<(FlightOffer | null)[]>([null, null])
  const [showSummary, setShowSummary] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState('')

  const setTripType = useCallback((type: TripType) => {
    setTripTypeState(type)
    const initial = type === 'round_trip' ? [defaultLeg(), defaultLeg()] : [defaultLeg()]
    setLegs(initial)
    setSelectedFlightsState(initial.map(() => null))
    setResults(null)
    setShowSummary(false)
  }, [])

  const updateLeg = useCallback((index: number, updates: Partial<LegFormState>) => {
    setLegs(prev => {
      const next = prev.map((leg, i) => (i === index ? { ...leg, ...updates } : leg))
      // Cascade destination → next leg's origin (multi_city auto-populate)
      if ('destination' in updates && index < next.length - 1) {
        next[index + 1] = { ...next[index + 1], origin: updates.destination ?? null }
      }
      return next
    })
  }, [])

  // Multi-city only: adds a leg (max 3), auto-populating origin and, for the 3rd leg, destination.
  const addLeg = useCallback(() => {
    setLegs(prev => {
      if (prev.length >= 3) return prev
      const newLeg = defaultLeg()
      newLeg.origin = prev[prev.length - 1].destination
      if (prev.length === 2) {
        // 3rd leg flies home: destination = leg 1's origin
        newLeg.destination = prev[0].origin
      }
      return [...prev, newLeg]
    })
    setSelectedFlightsState(prev => [...prev, null])
    setResults(null)
  }, [])

  // Removes leg at index and all legs after it (removing leg 2 when leg 3 exists collapses both).
  const removeLeg = useCallback((index: number) => {
    setLegs(prev => prev.slice(0, index))
    setSelectedFlightsState(prev => prev.slice(0, index))
    setResults(null)
  }, [])

  const setSelectedFlight = useCallback((index: number, flight: FlightOffer | null) => {
    setSelectedFlightsState(prev => {
      const next = [...prev]
      next[index] = flight
      return next
    })
  }, [])

  const submitSearch = useCallback(async () => {
    setSearchStatus('loading')
    setSearchError('')
    setResults(null)
    setSelectedFlightsState(legs.map(() => null))
    setShowSummary(false)

    try {
      let body: RoundTripSearchRequest | MultiCitySearchRequest

      if (tripType === 'round_trip') {
        const [outbound, ret] = legs
        body = {
          tripType: 'round_trip',
          origin: outbound.origin!.iataCode,
          destination: outbound.destination!.iataCode,
          departureDate: outbound.date,
          returnDate: ret.date,
          outboundSlot: outbound.slot,
          returnSlot: ret.slot,
        }
      } else {
        body = {
          tripType: 'multi_city',
          legs: legs.map(l => ({
            origin: l.origin!.iataCode,
            destination: l.destination!.iataCode,
            date: l.date,
            slot: l.slot,
          })),
        }
      }

      const res = await fetch('/api/flights/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error(`Search failed (${res.status})`)

      const data: FlightSearchResponse = await res.json()
      setResults(data)
      setSearchStatus('success')
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Something went wrong')
      setSearchStatus('error')
    }
  }, [tripType, legs])

  const reviewTrip = useCallback(() => {
    setShowSummary(true)
  }, [])

  const backToResults = useCallback(() => {
    setShowSummary(false)
    setSaveError('')
  }, [])

  const saveTrip = useCallback(async () => {
    if (selectedFlights.some(f => f === null)) return

    setSaveStatus('saving')
    setSaveError('')

    const tripLegs = selectedFlights.map((flight, i) => {
      const f = flight!
      // For round_trip legs[1] origin/destination are implied (swap of leg 0); use leg 0's data.
      const fromAirport =
        tripType === 'round_trip' && i === 1
          ? legs[0].destination!.iataCode
          : legs[i].origin!.iataCode
      const toAirport =
        tripType === 'round_trip' && i === 1
          ? legs[0].origin!.iataCode
          : legs[i].destination!.iataCode

      return {
        from_airport:  fromAirport,
        to_airport:    toAirport,
        airline:       f.airline,
        flight_number: f.flightNumber,
        departure_at:  f.departureAt,
        arrival_at:    f.arrivalAt,
      }
    })

    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'search', trip_type: tripType, legs: tripLegs }),
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
  }, [selectedFlights, legs, tripType, router])

  return {
    tripType,
    setTripType,
    legs,
    updateLeg,
    addLeg,
    removeLeg,
    selectedFlights,
    setSelectedFlight,
    searchStatus,
    searchError,
    results,
    showSummary,
    submitSearch,
    reviewTrip,
    backToResults,
    saveStatus,
    saveError,
    saveTrip,
  }
}
