import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { Trip } from '@/types/database'

const isoDatetime = z.string().datetime({ local: true })

const TripInsertSchema = z.object({
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
  const outboundMs = new Date(body.outbound_departure_at).getTime()
  const returnMs = new Date(body.return_departure_at).getTime()
  const days_outside_uk = Math.max(0, Math.round((returnMs - outboundMs) / 86_400_000))

  const { data: trip, error } = await supabase
    .from('trips')
    .insert({ ...body, days_outside_uk, created_by: user.id, last_modified_by: user.id })
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
