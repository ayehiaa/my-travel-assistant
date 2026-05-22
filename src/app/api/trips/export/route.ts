import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import { exportTripsCSV } from '@/lib/exportTripsCSV'

const TripLegSchema = z.object({
  id: z.string(),
  trip_id: z.string(),
  leg_order: z.number(),
  from_airport: z.string(),
  to_airport: z.string(),
  airline: z.string().nullable(),
  flight_number: z.string().nullable(),
  departure_at: z.string(),
  arrival_at: z.string().nullable(),
  created_at: z.string(),
})

const TripRowSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  source: z.enum(['search', 'manual']),
  trip_type: z.enum(['round_trip', 'multi_city', 'one_way']),
  days_outside_uk: z.number(),
  created_by: z.string(),
  last_modified_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  creator: z.object({ display_name: z.string() }),
  modifier: z.object({ display_name: z.string() }),
  legs: z.array(TripLegSchema),
})

export async function POST() {
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

  const trips = (data ?? []).sort((a, b) => {
    const aDate = a.legs?.[0]?.departure_at ?? a.created_at
    const bDate = b.legs?.[0]?.departure_at ?? b.created_at
    return new Date(aDate).getTime() - new Date(bDate).getTime()
  })

  const parsed = z.array(TripRowSchema).safeParse(trips)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const csv = exportTripsCSV(parsed.data)
  const today = new Date().toISOString().split('T')[0]
  const filename = `trips_export_${today}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
