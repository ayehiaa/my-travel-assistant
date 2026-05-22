import { TripWithUsers } from '@/types/database'
import { buildCsvContent } from '@/lib/csvFormatter'

export function exportTripsCSV(trips: TripWithUsers[]): string {
  const headers = [
    'Departure Airport',
    'Destination Airport',
    'Outbound Airline',
    'Outbound Flight Number',
    'Outbound Departure',
    'Outbound Arrival',
    'Return Airline',
    'Return Flight Number',
    'Return Departure',
    'Return Arrival',
    'Days Outside UK',
    'Created Date',
  ]

  const rows: string[][] = [headers]

  for (const trip of trips) {
    const legs = trip.legs ?? []
    const outbound = legs[0]
    const ret = legs.length > 1 ? legs[legs.length - 1] : undefined

    rows.push([
      outbound?.from_airport ?? '',
      outbound?.to_airport ?? '',
      outbound?.airline ?? '',
      outbound?.flight_number ?? '',
      formatDatetime(outbound?.departure_at ?? null),
      formatDatetime(outbound?.arrival_at ?? null),
      ret?.airline ?? '',
      ret?.flight_number ?? '',
      formatDatetime(ret?.departure_at ?? null),
      formatDatetime(ret?.arrival_at ?? null),
      String(trip.days_outside_uk ?? ''),
      formatDate(trip.created_at),
    ])
  }

  return buildCsvContent(rows)
}

function formatDatetime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return iso.split('T')[0]
}
