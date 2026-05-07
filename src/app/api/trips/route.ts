import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { daysOutsideUK } from '@/lib/daysCalculator'
import { Trip } from '@/types/database'

const isoDatetime = z.string().datetime({ local: true })
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')

const SearchTripSchema = z.object({
  source: z.literal('search'),
  departure_airport: z.string().min(1).max(10),
  destination_airport: z.string().min(1).max(10),
  outbound_airline: z.string().min(1).max(100),
  outbound_flight_number: z.string().min(1).max(20),
  outbound_departure_at: isoDatetime,
  outbound_arrival_at: isoDatetime,
  return_airline: z.string().min(1).max(100),
  return_flight_number: z.string().min(1).max(20),
  return_departure_at: isoDatetime,
  return_arrival_at: isoDatetime,
})

const ManualTripSchema = z.object({
  source: z.literal('manual'),
  departure_airport: z.string().length(3),
  destination_airport: z.string().length(3),
  outbound_departure_at: isoDate,
  return_departure_at: isoDate,
})

const TripInsertSchema = z.discriminatedUnion('source', [SearchTripSchema, ManualTripSchema])

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('trips')
    .select(`
      *,
      creator:user_roles!trips_created_by_fkey(display_name),
      modifier:user_roles!trips_last_modified_by_fkey(display_name)
    `)
    .order('outbound_departure_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = TripInsertSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const body = parsed.data

  let insertPayload: Record<string, unknown>

  if (body.source === 'manual') {
    const outboundAt = `${body.outbound_departure_at}T00:00:00.000Z`
    const returnAt = `${body.return_departure_at}T00:00:00.000Z`
    insertPayload = {
      owner_id: user.id,
      source: 'manual',
      departure_airport: body.departure_airport,
      destination_airport: body.destination_airport,
      outbound_departure_at: outboundAt,
      return_departure_at: returnAt,
      outbound_airline: null,
      outbound_flight_number: null,
      outbound_arrival_at: null,
      return_airline: null,
      return_flight_number: null,
      return_arrival_at: null,
      days_outside_uk: daysOutsideUK(outboundAt, returnAt),
      created_by: user.id,
      last_modified_by: user.id,
    }
  } else {
    const outboundMs = new Date(body.outbound_departure_at).getTime()
    const returnMs = new Date(body.return_departure_at).getTime()
    insertPayload = {
      owner_id: user.id,
      ...body,
      days_outside_uk: Math.max(0, Math.round((returnMs - outboundMs) / 86_400_000)),
      created_by: user.id,
      last_modified_by: user.id,
    }
  }

  const { data: trip, error } = await supabase
    .from('trips')
    .insert(insertPayload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({
    performedBy: user.id,
    action: 'created',
    tripId: trip.id,
    tripSnapshot: trip as Trip,
  })

  return NextResponse.json(trip, { status: 201 })
}
