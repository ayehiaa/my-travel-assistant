import Link from 'next/link'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import UpcomingTrips from '@/components/dashboard/UpcomingTrips'
import PastTrips from '@/components/dashboard/PastTrips'
import { TripWithUsers, UserRoleRecord } from '@/types/database'
import LandingPage from '@/components/landing/LandingPage'

export const metadata = {
  title: 'Sojourn — Your trusted travel tracker',
  description: 'Track every day outside the UK. Stay on the right side of the Statutory Residence Test.',
}

export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) return <LandingPage />

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  const { data: rawTrips } = await supabase
    .from('trips')
    .select('*, legs:trip_legs(*)')
    .eq('owner_id', activeMainAccountId)
    .order('leg_order', { referencedTable: 'trip_legs', ascending: true })

  const trips = (rawTrips ?? []).sort((a, b) => {
    const aDate = a.legs?.[0]?.departure_at ?? a.created_at
    const bDate = b.legs?.[0]?.departure_at ?? b.created_at
    return new Date(aDate).getTime() - new Date(bDate).getTime()
  })

  const userIds = [...new Set([
    ...trips.map(t => t.created_by),
    ...trips.map(t => t.last_modified_by),
  ])]

  let roleMap = new Map<string, Pick<UserRoleRecord, 'display_name'>>()
  if (userIds.length > 0) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, display_name')
      .in('user_id', userIds)
    roleMap = new Map((roles ?? []).map(r => [r.user_id, { display_name: r.display_name }]))
  }

  const enriched: TripWithUsers[] = trips.map(t => ({
    ...t,
    legs: t.legs ?? [],
    creator: roleMap.get(t.created_by) ?? { display_name: 'Unknown' },
    modifier: roleMap.get(t.last_modified_by) ?? { display_name: 'Unknown' },
  }))

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const upcoming = enriched.filter(t => {
    const dep = t.legs[0]?.departure_at ?? t.created_at
    return new Date(dep) >= todayStart
  })
  const past = enriched
    .filter(t => {
      const dep = t.legs[0]?.departure_at ?? t.created_at
      return new Date(dep) < todayStart
    })
    .reverse()

  const canDelete = user.role === 'main'

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">My Trips</h1>
        <Link
          href="/search"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Search flights
        </Link>
      </div>

      <div className="space-y-10">
        <UpcomingTrips trips={upcoming} canDelete={canDelete} />
        <PastTrips trips={past} canDelete={canDelete} />
      </div>
    </div>
  )
}
