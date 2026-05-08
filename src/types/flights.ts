export type TimeSlot = 'morning' | 'evening'

export type Airport = {
  iataCode: string
  name: string
  cityName: string
}

export type FlightOffer = {
  id: string
  airline: string
  airlineCode: string
  flightNumber: string
  departureAt: string
  arrivalAt: string
  durationMinutes: number
  stops: number
  price: number
  currency: string
  isBA: boolean
}

// ── Per-leg form state (used in the search hook) ──────────────────────────────

export type LegFormState = {
  origin: Airport | null
  destination: Airport | null
  date: string
  slot: TimeSlot
}

// ── Per-leg search request (used inside MultiCitySearchRequest) ───────────────

export type LegSearchRequest = {
  origin: string       // IATA code
  destination: string  // IATA code
  date: string         // YYYY-MM-DD
  slot: TimeSlot
}

// ── Round-trip (existing flow) ────────────────────────────────────────────────

export type RoundTripSearchRequest = {
  tripType: 'round_trip'
  origin: string
  destination: string
  departureDate: string
  returnDate: string
  outboundSlot: TimeSlot
  returnSlot: TimeSlot
}

export type RoundTripSearchResponse = {
  tripType: 'round_trip'
  outbound: FlightOffer[]
  return: FlightOffer[]
}

// ── Multi-city ────────────────────────────────────────────────────────────────

export type MultiCitySearchRequest = {
  tripType: 'multi_city'
  legs: LegSearchRequest[]  // 2–3 legs
}

export type MultiCitySearchResponse = {
  tripType: 'multi_city'
  legs: FlightOffer[][]  // one array of offers per leg, same order
}

// ── Union types (what the API route and hook use) ─────────────────────────────

export type FlightSearchRequest = RoundTripSearchRequest | MultiCitySearchRequest
export type FlightSearchResponse = RoundTripSearchResponse | MultiCitySearchResponse
