import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { daysOutsideUK } from '@/lib/daysCalculator'
import { Trip, TripLeg } from '@/types/database'

const isoDatetime = z.string().datetime({ local: true })
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')

// ── Search trip schemas ───────────────────────────────────────────────────────

const SearchLegSchema = z.object({
  from_airport:  z.string().length(3),
  to_airport:    z.string().length(3),
  airline:       z.string().min(1).max(100),
  flight_number: z.string().min(1).max(20),
  departure_at:  isoDatetime,
  arrival_at:    isoDatetime,
})

const SearchTripSchema = z.object({
  source:    z.literal('search'),
  trip_type: z.enum(['round_trip', 'multi_city']),
  legs:      z.array(SearchLegSchema).min(2).max(3),
})

// ── Manual trip schemas ───────────────────────────────────────────────────────

const ManualLegSchema = z.object({
  from_airport: z.string().length(3),
  to_airport:   z.string().length(3),
  departure_at: isoDate,
})

const ManualTripSchema = z.object({
  source:    z.literal('manual'),
  trip_type: z.enum(['round_trip', 'multi_city']),
  legs:      z.array(ManualLegSchema).min(2).max(3),
})

const TripInsertSchema = z.discriminatedUnion('source', [SearchTripSchema, ManualTripSchema])

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('trips')
    .select(`
      *,
      creator:user_roles!trips_created_by_fkey(display_name),
      modifier:user_roles!trips_last_modified_by_fkey(display_name),
      legs:trip_legs(*)
    `)
    .eq('owner_id', activeMainAccountId)
    .order('leg_order', { referencedTable: 'trip_legs', ascending: true })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Sort trips by first leg departure_at (legs are already ordered by leg_order)
  const sorted = (data ?? []).sort((a, b) => {
    const aDate = a.legs?.[0]?.departure_at ?? a.created_at
    const bDate = b.legs?.[0]?.departure_at ?? b.created_at
    return new Date(aDate).getTime() - new Date(bDate).getTime()
  })

  return NextResponse.json(sorted)
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  // ── Beta trip limit (exempt premium owners and their assistants) ─────────
  let ownerIsPremium = user.role === 'premium'
  if (user.role === 'assistant') {
    const { data: ownerRoleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', activeMainAccountId)
      .single()
    ownerIsPremium = ownerRoleRow?.role === 'premium'
  }

  if (!ownerIsPremium) {
    const { count: tripCount, error: countError } = await supabase
      .from('trips')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', activeMainAccountId)

    if (countError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    if ((tripCount ?? 0) >= 10) {
      return NextResponse.json(
        {
          error: 'BETA_TRIP_LIMIT_REACHED',
          message: "You've hit your beta limit of 10 trips. Hang tight — a full plan is launching soon!",
        },
        { status: 429 },
      )
    }
  }

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

  // ── Normalise leg datetimes ───────────────────────────────────────────────

  const normalisedLegs = body.legs.map(leg => ({
    from_airport:  leg.from_airport,
    to_airport:    leg.to_airport,
    airline:       'airline' in leg ? leg.airline : null,
    flight_number: 'flight_number' in leg ? leg.flight_number : null,
    departure_at:  body.source === 'manual'
      ? `${leg.departure_at}T00:00:00.000Z`
      : (leg as { departure_at: string }).departure_at,
    arrival_at:    'arrival_at' in leg
      ? (leg as { arrival_at: string }).arrival_at
      : null,
  }))

  // ── days_outside_uk: first leg departure → last leg departure ─────────────

  const firstDeparture = normalisedLegs[0].departure_at
  const lastDeparture  = normalisedLegs[normalisedLegs.length - 1].departure_at

  // ── Insert trip ───────────────────────────────────────────────────────────

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .insert({
      owner_id:        activeMainAccountId,
      source:          body.source,
      trip_type:       body.trip_type,
      days_outside_uk: daysOutsideUK(firstDeparture, lastDeparture),
      created_by:      user.id,
      last_modified_by: user.id,
    })
    .select()
    .single()

  if (tripError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // ── Insert legs ───────────────────────────────────────────────────────────

  const { data: insertedLegs, error: legsError } = await supabase
    .from('trip_legs')
    .insert(
      normalisedLegs.map((leg, i) => ({ ...leg, trip_id: trip.id, leg_order: i + 1 }))
    )
    .select()

  if (legsError) {
    // Roll back the trip row to avoid orphaned records
    await supabase.from('trips').delete().eq('id', trip.id)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // ── Audit log ─────────────────────────────────────────────────────────────

  await logAudit({
    performedBy:  user.id,
    action:       'created',
    tripId:       trip.id,
    tripSnapshot: { ...(trip as Trip), legs: insertedLegs as TripLeg[] },
    onBehalfOf:   user.role === 'assistant' ? activeMainAccountId : undefined,
  })

  return NextResponse.json({ ...trip, legs: insertedLegs }, { status: 201 })
}
