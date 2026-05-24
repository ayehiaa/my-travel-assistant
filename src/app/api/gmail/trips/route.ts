import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, isPremiumOrAbove } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { daysOutsideUK } from '@/lib/daysCalculator'
import { Trip, TripLeg } from '@/types/database'

const GmailTripSaveSchema = z.object({
  gmail_message_id: z.string().min(1),
  from_airport:     z.string().length(3),
  to_airport:       z.string().length(3),
  departure_at:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  return_at:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  flight_number:    z.string().max(20),
  airline:          z.string().max(100),
})

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isPremiumOrAbove(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = GmailTripSaveSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { gmail_message_id, from_airport, to_airport, departure_at, return_at, flight_number, airline } = parsed.data
  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  // Duplicate check (warn, not block)
  let warning: string | undefined
  const { data: existing } = await supabase
    .from('trip_legs')
    .select('trip_id, flight_number, departure_at')
    .eq('flight_number', flight_number)
    .like('departure_at', `${departure_at}%`)

  if (existing && existing.length > 0) warning = 'DUPLICATE_DETECTED'

  // Build legs (leg_order starts at 1 to match schema CHECK constraint)
  const tripType = return_at ? 'round_trip' : 'one_way'
  const legs = [
    { from_airport, to_airport, departure_at: `${departure_at}T00:00:00.000Z`, airline, flight_number, leg_order: 1 },
    ...(return_at ? [{ from_airport: to_airport, to_airport: from_airport, departure_at: `${return_at}T00:00:00.000Z`, airline, flight_number: '', leg_order: 2 }] : []),
  ]

  const outboundDeparture = `${departure_at}T00:00:00.000Z`
  const returnDeparture = return_at ? `${return_at}T00:00:00.000Z` : outboundDeparture
  const days = daysOutsideUK(outboundDeparture, returnDeparture)

  // Insert trip
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .insert({
      owner_id: activeMainAccountId,
      source: 'manual',
      trip_type: tripType,
      days_outside_uk: days,
      created_by: user.id,
      last_modified_by: user.id,
    })
    .select()
    .single()

  if (tripError || !trip) return NextResponse.json({ error: 'Failed to create trip' }, { status: 500 })

  // Insert legs
  const { data: insertedLegs, error: legsError } = await supabase
    .from('trip_legs')
    .insert(legs.map(l => ({ ...l, trip_id: trip.id })))
    .select()

  if (legsError) {
    // Roll back the trip row to avoid orphaned records
    await supabase.from('trips').delete().eq('id', trip.id)
    return NextResponse.json({ error: 'Failed to create legs' }, { status: 500 })
  }

  // Mark message as imported
  await supabase.from('gmail_imported_messages').insert({
    user_id: activeMainAccountId,
    gmail_message_id,
    trip_id: trip.id,
  })

  // Audit log
  await logAudit({
    performedBy: user.id,
    action: 'created',
    tripId: trip.id,
    tripSnapshot: { ...(trip as Trip), legs: (insertedLegs ?? []) as TripLeg[] },
  })

  return NextResponse.json({ trip, legs: insertedLegs, ...(warning ? { warning } : {}) }, { status: 201 })
}
