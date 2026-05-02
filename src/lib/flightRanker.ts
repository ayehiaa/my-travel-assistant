import { FlightOffer, TimeSlot } from '@/types/flights'

// Morning: 06:00–12:59  Evening: 13:00–23:59
function hourFromISO(isoString: string): number {
  return parseInt(isoString.split('T')[1]?.split(':')[0] ?? '0', 10)
}

function inSlot(departureAt: string, slot: TimeSlot): boolean {
  const h = hourFromISO(departureAt)
  return slot === 'morning' ? h >= 6 && h < 13 : h >= 13 && h <= 23
}

export function rankAndFilter(
  offers: FlightOffer[],
  slot: TimeSlot,
  limit = 3
): FlightOffer[] {
  return offers
    .filter(o => inSlot(o.departureAt, slot))
    .sort((a, b) => {
      if (a.isBA !== b.isBA) return a.isBA ? -1 : 1
      if (a.stops !== b.stops) return a.stops - b.stops
      return a.durationMinutes - b.durationMinutes
    })
    .slice(0, limit)
}
