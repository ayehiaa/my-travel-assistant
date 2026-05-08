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

  const { data: rawTrips } = await supabase
    .from('trips')
    .select('id, departure_airport, destination_airport, outbound_departure_at, return_departure_at, days_outside_uk')
    .eq('owner_id', activeMainAccountId)
    .gte('outbound_departure_at', chartWindowStart.toISOString())
    .lte('outbound_departure_at', chartWindowEnd.toISOString())
    .order('outbound_departure_at', { ascending: true })

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

    const { data: annualTrips } = await supabase
      .from('trips')
      .select('outbound_departure_at, return_departure_at')
      .eq('owner_id', activeMainAccountId)
      .lte('outbound_departure_at', refEnd.toISOString())
      .gte('return_departure_at', refStart.toISOString())

    annualDaysAbroad = (annualTrips ?? []).reduce((acc, t) => {
      return acc + daysOutsideUKInWindow(t.outbound_departure_at, t.return_departure_at, refStart, refEnd)
    }, 0)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-100">Trip Timeline</h1>
        <p className="text-sm text-slate-500 mt-1">6 months back · Today · 6 months ahead</p>
      </div>
      <TripTimeline
        trips={rawTrips ?? []}
        today={new Date().toISOString()}
        referenceDate={referenceDate}
        annualDaysAbroad={annualDaysAbroad}
      />
    </div>
  )
}
