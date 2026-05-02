import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { Trip } from '@/types/database'

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Omit<Trip, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'last_modified_by'>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { data: trip, error } = await supabase
    .from('trips')
    .insert({ ...body, created_by: user.id, last_modified_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit({
    performedBy: user.id,
    action: 'created',
    tripId: trip.id,
    tripSnapshot: trip as Trip,
  })

  return NextResponse.json(trip, { status: 201 })
}
