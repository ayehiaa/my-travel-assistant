import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import TripTimeline from '@/components/timeline/TripTimeline'

export const metadata = {
  title: 'Timeline — Travel Assistant',
}

export default async function TimelinePage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - 180)

  const windowEnd = new Date()
  windowEnd.setDate(windowEnd.getDate() + 180)

  const { data: rawTrips } = await supabase
    .from('trips')
    .select('id, departure_airport, destination_airport, outbound_departure_at, return_departure_at')
    .eq('owner_id', activeMainAccountId)
    .gte('outbound_departure_at', windowStart.toISOString())
    .lte('outbound_departure_at', windowEnd.toISOString())
    .order('outbound_departure_at', { ascending: true })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-100">Trip Timeline</h1>
        <p className="text-sm text-slate-500 mt-1">6 months back · Today · 6 months ahead</p>
      </div>
      <TripTimeline trips={rawTrips ?? []} today={new Date().toISOString()} />
    </div>
  )
}
