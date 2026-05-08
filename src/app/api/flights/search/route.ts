import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchOneWay } from '@/lib/serpapi'
import { rankAndFilter } from '@/lib/flightRanker'
import { FlightSearchRequest, MultiCitySearchResponse, RoundTripSearchResponse } from '@/types/flights'

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

  if (!body.tripType) {
    return NextResponse.json({ error: 'Missing tripType' }, { status: 400 })
  }

  try {
    if (body.tripType === 'round_trip') {
      const { origin, destination, departureDate, returnDate, outboundSlot, returnSlot } = body

      if (!origin || !destination || !departureDate || !returnDate || !outboundSlot || !returnSlot) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }

      const [outboundRaw, returnRaw] = await Promise.all([
        searchOneWay({ origin, destination, date: departureDate }),
        searchOneWay({ origin: destination, destination: origin, date: returnDate }),
      ])

      const response: RoundTripSearchResponse = {
        tripType: 'round_trip',
        outbound: rankAndFilter(outboundRaw, outboundSlot),
        return: rankAndFilter(returnRaw, returnSlot),
      }

      return NextResponse.json(response)
    }

    // multi_city
    const { legs } = body

    if (!legs?.length || legs.length < 2 || legs.length > 3) {
      return NextResponse.json({ error: 'Multi-city requires 2–3 legs' }, { status: 400 })
    }

    const rawResults = await Promise.all(
      legs.map(leg => searchOneWay({ origin: leg.origin, destination: leg.destination, date: leg.date }))
    )

    const response: MultiCitySearchResponse = {
      tripType: 'multi_city',
      legs: rawResults.map((raw, i) => rankAndFilter(raw, legs[i].slot)),
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('Flight search error:', err)
    return NextResponse.json({ error: 'Flight search failed' }, { status: 502 })
  }
}
