import { FlightOffer } from '@/types/flights'

const BASE_URL = 'https://serpapi.com/search.json'

// ─── Raw Serpapi types ────────────────────────────────────────────────────────

type SerpFlight = {
  departure_airport: { name: string; id: string; time: string }
  arrival_airport: { name: string; id: string; time: string }
  duration: number
  airline: string
  flight_number: string
}

type SerpOffer = {
  flights: SerpFlight[]
  total_duration: number
  price: number
}

type SerpResponse = {
  best_flights?: SerpOffer[]
  other_flights?: SerpOffer[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// "2024-01-15 08:00" → "2024-01-15T08:00:00"
function toISO(serpapiTime: string): string {
  return serpapiTime.replace(' ', 'T') + ':00'
}

// "BA 107" or "BA107" → { airlineCode: "BA", flightNumber: "BA107" }
function parseFlightNumber(raw: string): { airlineCode: string; flightNumber: string } {
  const normalized = raw.replace(/\s+/g, '')
  const match = normalized.match(/^([A-Z0-9]{2})(\d+.*)$/)
  return {
    airlineCode: match?.[1] ?? normalized.slice(0, 2).toUpperCase(),
    flightNumber: normalized,
  }
}

function normalise(offer: SerpOffer, index: number): FlightOffer | null {
  if (!offer.price || !offer.flights?.length) return null

  const segments = offer.flights
  const first = segments[0]
  const last = segments[segments.length - 1]
  const { airlineCode, flightNumber } = parseFlightNumber(first.flight_number)

  return {
    id: `serp-${index}-${flightNumber}-${first.departure_airport.time}`,
    airline: first.airline,
    airlineCode,
    flightNumber,
    departureAt: toISO(first.departure_airport.time),
    arrivalAt: toISO(last.arrival_airport.time),
    durationMinutes: offer.total_duration,
    stops: segments.length - 1,
    price: offer.price,
    currency: 'GBP',
    isBA: airlineCode === 'BA',
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function searchOneWay(params: {
  origin: string
  destination: string
  date: string
}): Promise<FlightOffer[]> {
  const url = new URL(BASE_URL)
  url.searchParams.set('engine', 'google_flights')
  url.searchParams.set('departure_id', params.origin)
  url.searchParams.set('arrival_id', params.destination)
  url.searchParams.set('outbound_date', params.date)
  url.searchParams.set('type', '2') // one-way
  url.searchParams.set('currency', 'GBP')
  url.searchParams.set('hl', 'en')
  url.searchParams.set('api_key', process.env.SERPAPI_KEY!)

  const res = await fetch(url.toString(), { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`Serpapi error ${res.status}`)

  const data = (await res.json()) as SerpResponse
  const all = [...(data.best_flights ?? []), ...(data.other_flights ?? [])]

  return all.map((offer, i) => normalise(offer, i)).filter((o): o is FlightOffer => o !== null)
}

export async function searchAirports(
  keyword: string
): Promise<{ iataCode: string; name: string; cityName: string }[]> {
  const url = new URL('https://autocomplete.travelpayouts.com/places2')
  url.searchParams.set('term', keyword)
  url.searchParams.set('locale', 'en')
  url.searchParams.append('types[]', 'airport')
  url.searchParams.append('types[]', 'city')

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
  if (!res.ok) return []

  type TpAirport = { code: string; name: string; city_name: string; type: string }

  const data = (await res.json()) as TpAirport[]
  return data
    .filter(a => (a.type === 'airport' || a.type === 'city') && a.code)
    .slice(0, 8)
    .map(a => ({ iataCode: a.code, name: a.name, cityName: a.city_name ?? a.name }))
}
