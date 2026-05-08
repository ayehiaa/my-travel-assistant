import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import TripTimeline from '@/components/timeline/TripTimeline'
import { daysOutsideUKInWindow } from '@/lib/daysCalculator'

export const metadata = {
  title: 'Timeline — Travel Assistant',
}

export default async function TimelinePage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  const chartWindowStart = new Date()
  chartWindowStart.setDate(chartWindowStart.getDate() - 180)

  const chartWindowEnd = new Date()
  chartWindowEnd.setDate(chartWindowEnd.getDate() + 180)

  // Fetch all trips with legs; filter by first leg departure in code
  const { data: rawTrips } = await supabase
    .from('trips')
    .select('id, days_outside_uk, legs:trip_legs(from_airport, to_airport, departure_at, leg_order)')
    .eq('owner_id', activeMainAccountId)
    .order('leg_order', { referencedTable: 'trip_legs', ascending: true })

  const windowStartIso = chartWindowStart.toISOString()
  const windowEndIso   = chartWindowEnd.toISOString()

  const filteredTrips = (rawTrips ?? [])
    .filter(t => {
      const firstDep = t.legs?.[0]?.departure_at
      return firstDep && firstDep >= windowStartIso && firstDep <= windowEndIso
    })
    .sort((a, b) => {
      const aDate = a.legs?.[0]?.departure_at ?? ''
      const bDate = b.legs?.[0]?.departure_at ?? ''
      return aDate.localeCompare(bDate)
    })

  // Fetch reference date for the active main account
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('reference_date')
    .eq('user_id', activeMainAccountId)
    .single()

  const referenceDate = roleRow?.reference_date ?? null

  let annualDaysAbroad: number | null = null

  if (referenceDate) {
    const refEnd = new Date(referenceDate)
    const refStart = new Date(referenceDate)
    refStart.setFullYear(refStart.getFullYear() - 1)

    const { data: allTrips } = await supabase
      .from('trips')
      .select('legs:trip_legs(departure_at, leg_order)')
      .eq('owner_id', activeMainAccountId)
      .order('leg_order', { referencedTable: 'trip_legs', ascending: true })

    const refStartIso = refStart.toISOString()
    const refEndIso   = refEnd.toISOString()

    annualDaysAbroad = (allTrips ?? [])
      .filter(t => {
        const legs = t.legs ?? []
        if (!legs.length) return false
        const firstDep = legs[0].departure_at
        const lastDep  = legs[legs.length - 1].departure_at
        return firstDep <= refEndIso && lastDep >= refStartIso
      })
      .reduce((acc, t) => {
        const legs = t.legs!
        return acc + daysOutsideUKInWindow(
          legs[0].departure_at,
          legs[legs.length - 1].departure_at,
          refStart,
          refEnd,
        )
      }, 0)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-100">Trip Timeline</h1>
        <p className="text-sm text-slate-500 mt-1">6 months back · Today · 6 months ahead</p>
      </div>
      <TripTimeline
        trips={filteredTrips}
        today={new Date().toISOString()}
        referenceDate={referenceDate}
        annualDaysAbroad={annualDaysAbroad}
      />
    </div>
  )
}
