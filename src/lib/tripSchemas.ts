import { z } from 'zod'

const isoDatetime = z.string().datetime({ local: true })
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')

// ── Search trip schemas ───────────────────────────────────────────────────────

export const SearchLegSchema = z.object({
  from_airport:  z.string().length(3),
  to_airport:    z.string().length(3),
  airline:       z.string().min(1).max(100),
  flight_number: z.string().min(1).max(20),
  departure_at:  isoDatetime,
  arrival_at:    isoDatetime,
})

export const SearchTripSchema = z.object({
  source:    z.literal('search'),
  trip_type: z.enum(['round_trip', 'multi_city']),
  legs:      z.array(SearchLegSchema).min(2).max(3),
})

// ── Manual trip schemas ───────────────────────────────────────────────────────

export const ManualLegSchema = z.object({
  from_airport: z.string().length(3),
  to_airport:   z.string().length(3),
  departure_at: isoDate,
})

export const ManualTripSchema = z.object({
  source:    z.literal('manual'),
  trip_type: z.enum(['round_trip', 'multi_city']),
  legs:      z.array(ManualLegSchema).min(2).max(3),
})

export const TripInsertSchema = z.discriminatedUnion('source', [SearchTripSchema, ManualTripSchema])

// ── Inferred types ────────────────────────────────────────────────────────────

export type SearchLeg = z.infer<typeof SearchLegSchema>
export type SearchTrip = z.infer<typeof SearchTripSchema>
export type ManualLeg = z.infer<typeof ManualLegSchema>
export type ManualTrip = z.infer<typeof ManualTripSchema>
export type TripInsert = z.infer<typeof TripInsertSchema>
