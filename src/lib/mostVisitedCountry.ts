import { getAirportInfo } from './airportCountry'

interface TripLeg {
  to_airport: string
}

interface TripWithLegs {
  legs: TripLeg[]
}

export function getMostVisitedCountry(trips: TripWithLegs[]): { country: string; count: number } | null {
  if (trips.length === 0) return null

  const counts: Record<string, number> = {}
  for (const trip of trips) {
    // Exclude the last leg (return home) — mirrors how countries are counted in TripTimeline
    for (const leg of trip.legs.slice(0, -1)) {
      const country = getAirportInfo(leg.to_airport).country
      counts[country] = (counts[country] ?? 0) + 1
    }
  }

  const entries = Object.entries(counts)
  if (entries.length === 0) return null

  return entries.reduce<{ country: string; count: number }>(
    (best, [country, count]) => (count > best.count ? { country, count } : best),
    { country: entries[0][0], count: entries[0][1] }
  )
}
