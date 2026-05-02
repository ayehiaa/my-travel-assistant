import Amadeus from 'amadeus'
import { FlightOffer } from '@/types/flights'

// Singleton — SDK handles OAuth token caching internally
const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_CLIENT_ID!,
  clientSecret: process.env.AMADEUS_CLIENT_SECRET!,
})

// ─── Raw Amadeus types ────────────────────────────────────────────────────────

type AmadeusSegment = {
  departure: { iataCode: string; at: string }
  arrival: { iataCode: string; at: string }
  carrierCode: string
  number: string
  duration: string
}

type AmadeusItinerary = {
  duration: string
  segments: AmadeusSegment[]
}

type AmadeusOffer = {
  id: string
  price: { grandTotal: string; currency: string }
  itineraries: AmadeusItinerary[]
  validatingAirlineCodes: string[]
}

type AmadeusResult = {
  data: AmadeusOffer[]
  dictionaries?: { carriers?: Record<string, string> }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDurationMinutes(isoDuration: string): number {
  const m = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!m) return 0
  return (parseInt(m[1] ?? '0', 10)) * 60 + parseInt(m[2] ?? '0', 10)
}

function normalise(offer: AmadeusOffer, carriers: Record<string, string>): FlightOffer {
  const itinerary = offer.itineraries[0]
  const segments = itinerary.segments
  const first = segments[0]
  const last = segments[segments.length - 1]
  const airlineCode = first.carrierCode
  const airline = carriers[airlineCode] ?? airlineCode

  return {
    id: offer.id,
    airline,
    airlineCode,
    flightNumber: `${airlineCode}${first.number}`,
    departureAt: first.departure.at,
    arrivalAt: last.arrival.at,
    durationMinutes: parseDurationMinutes(itinerary.duration),
    stops: segments.length - 1,
    price: parseFloat(offer.price.grandTotal),
    currency: offer.price.currency,
    isBA: airlineCode === 'BA',
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function searchOneWay(params: {
  origin: string
  destination: string
  date: string
}): Promise<FlightOffer[]> {
  const response = await amadeus.shopping.flightOffersSearch.get({
    originLocationCode: params.origin,
    destinationLocationCode: params.destination,
    departureDate: params.date,
    adults: '1',
    max: '50',
    currencyCode: 'GBP',
    nonStop: 'false',
  })

  const result = response.result as AmadeusResult
  const carriers = result.dictionaries?.carriers ?? {}

  return (result.data ?? []).map(offer => normalise(offer, carriers))
}

export async function searchAirports(keyword: string): Promise<
  { iataCode: string; name: string; cityName: string }[]
> {
  const response = await amadeus.referenceData.locations.get({
    keyword,
    subType: 'AIRPORT,CITY',
    view: 'LIGHT',
    page: { limit: '10' },
  })

  type Location = {
    iataCode: string
    name: string
    address?: { cityName?: string }
  }

  return (response.data as Location[]).map(loc => ({
    iataCode: loc.iataCode,
    name: loc.name,
    cityName: loc.address?.cityName ?? loc.name,
  }))
}
