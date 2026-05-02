import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchOneWay } from '@/lib/serpapi'
import { rankAndFilter } from '@/lib/flightRanker'
import { FlightSearchRequest, FlightSearchResponse } from '@/types/flights'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: FlightSearchRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { origin, destination, departureDate, returnDate, outboundSlot, returnSlot } = body

  if (!origin || !destination || !departureDate || !returnDate || !outboundSlot || !returnSlot) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    const [outboundRaw, returnRaw] = await Promise.all([
      searchOneWay({ origin, destination, date: departureDate }),
      searchOneWay({ origin: destination, destination: origin, date: returnDate }),
    ])

    const response: FlightSearchResponse = {
      outbound: rankAndFilter(outboundRaw, outboundSlot),
      return: rankAndFilter(returnRaw, returnSlot),
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('Flight search error:', err)
    return NextResponse.json({ error: 'Flight search failed' }, { status: 502 })
  }
}
