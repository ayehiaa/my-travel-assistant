import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/auditLogger'
import { daysOutsideUK } from '@/lib/daysCalculator'
import { Trip, TripLeg } from '@/types/database'
import { ManualTripSchema } from '@/lib/tripSchemas'

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const admin = createAdminClient()
  const { id } = await params

  // Fetch existing trip for ownership check and before-snapshot
  const { data: before, error: fetchError } = await admin
    .from('trips')
    .select('*, legs:trip_legs(*)')
    .eq('id', id)
    .eq('owner_id', activeMainAccountId)
    .order('leg_order', { referencedTable: 'trip_legs', ascending: true })
    .single()

  if (fetchError || !before) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = ManualTripSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const body = parsed.data

  // Normalise leg datetimes (date-only → midnight UTC)
  const normalisedLegs = body.legs.map(leg => ({
    from_airport:  leg.from_airport,
    to_airport:    leg.to_airport,
    airline:       null as string | null,
    flight_number: null as string | null,
    departure_at:  `${leg.departure_at}T00:00:00.000Z`,
    arrival_at:    null as string | null,
  }))

  const firstDeparture = normalisedLegs[0].departure_at
  const lastDeparture  = normalisedLegs[normalisedLegs.length - 1].departure_at

  // Delete old legs
  const { error: deleteLegsError } = await admin
    .from('trip_legs')
    .delete()
    .eq('trip_id', id)

  if (deleteLegsError) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Update trip row
  const { data: updatedTrip, error: updateError } = await admin
    .from('trips')
    .update({
      trip_type:        body.trip_type,
      source:           'manual' as const,
      days_outside_uk:  daysOutsideUK(firstDeparture, lastDeparture),
      last_modified_by: user.id,
    })
    .eq('id', id)
    .select()
    .single()

  if (updateError || !updatedTrip) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Insert new legs
  const { data: newLegs, error: insertLegsError } = await admin
    .from('trip_legs')
    .insert(
      normalisedLegs.map((leg, i) => ({ ...leg, trip_id: id, leg_order: i + 1 }))
    )
    .select()

  if (insertLegsError || !newLegs) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Build changed-fields diff
  const beforeLegs = (before.legs ?? []) as TripLeg[]
  const changedFields: Record<string, { before: unknown; after: unknown }> = {}

  if (before.trip_type !== updatedTrip.trip_type) {
    changedFields['trip_type'] = { before: before.trip_type, after: updatedTrip.trip_type }
  }
  if (before.days_outside_uk !== updatedTrip.days_outside_uk) {
    changedFields['days_outside_uk'] = { before: before.days_outside_uk, after: updatedTrip.days_outside_uk }
  }
  if (before.source !== updatedTrip.source) {
    changedFields['source'] = { before: before.source, after: updatedTrip.source }
  }
  changedFields['legs'] = { before: beforeLegs, after: newLegs as TripLeg[] }

  await logAudit({
    performedBy:  user.id,
    action:       'updated',
    tripId:       id,
    tripSnapshot: { ...(updatedTrip as Trip), legs: newLegs as TripLeg[] },
    changedFields,
    onBehalfOf:   user.role === 'assistant' ? activeMainAccountId : undefined,
  })

  return NextResponse.json({ ...updatedTrip, legs: newLegs })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const admin = createAdminClient()
  const { id } = await params

  const { data: trip, error: fetchError } = await admin
    .from('trips')
    .select('*, legs:trip_legs(*)')
    .eq('id', id)
    .eq('owner_id', activeMainAccountId)
    .order('leg_order', { referencedTable: 'trip_legs', ascending: true })
    .single()

  if (fetchError || !trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  const { error: deleteError } = await admin
    .from('trips')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  await logAudit({
    performedBy: user.id,
    action: 'deleted',
    tripId: null,
    tripSnapshot: { ...(trip as Trip), legs: (trip.legs ?? []) as TripLeg[] },
    onBehalfOf: user.role === 'assistant' ? activeMainAccountId : undefined,
  })

  return new NextResponse(null, { status: 204 })
}
