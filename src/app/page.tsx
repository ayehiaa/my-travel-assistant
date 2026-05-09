import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'
import LandingPage from '@/components/landing/LandingPage'
import { TripWithUsers, UserRoleRecord } from '@/types/database'
import { getAirportInfo } from '@/lib/airportCountry'

export const metadata = {
  title: 'Sojourn — Dashboard',
  description: 'Track every day outside the UK. Stay on the right side of the Statutory Residence Test.',
}

export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) return <LandingPage />

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  const [{ data: rawTrips }, { data: roleRow }] = await Promise.all([
    supabase
      .from('trips')
      .select('*, legs:trip_legs(*)')
      .eq('owner_id', activeMainAccountId)
      .order('leg_order', { referencedTable: 'trip_legs', ascending: true }),
    supabase
      .from('user_roles')
      .select('reference_date')
      .eq('user_id', activeMainAccountId)
      .single(),
  ])

  const trips = (rawTrips ?? []).sort((a, b) => {
    const aDate = a.legs?.[0]?.departure_at ?? a.created_at
    const bDate = b.legs?.[0]?.departure_at ?? b.created_at
    return new Date(aDate).getTime() - new Date(bDate).getTime()
  })

  const userIds = [...new Set([
    ...trips.map((t: { created_by: string }) => t.created_by),
    ...trips.map((t: { last_modified_by: string }) => t.last_modified_by),
  ])]

  let roleMap = new Map<string, Pick<UserRoleRecord, 'display_name'>>()
  if (userIds.length > 0) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, display_name')
      .in('user_id', userIds)
    roleMap = new Map((roles ?? []).map((r: Pick<UserRoleRecord, 'user_id' | 'display_name'>) => [r.user_id, { display_name: r.display_name }]))
  }

  const enriched: TripWithUsers[] = trips.map((t: TripWithUsers & { legs: TripWithUsers['legs'] }) => ({
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

  // ── Stat computations ──────────────────────────────────────────────────
  const currentYear = new Date().getFullYear()

  const thisYearTrips = enriched.filter(t =>
    new Date(t.legs[0]?.departure_at ?? t.created_at).getFullYear() === currentYear
  )

  const totalDaysThisYear = thisYearTrips.reduce((s, t) => s + (t.days_outside_uk ?? 0), 0)
  const journeysThisYear  = thisYearTrips.length
  const multiCityCount    = upcoming.filter(t => t.trip_type === 'multi_city').length

  const countriesThisYear = new Set(
    thisYearTrips.flatMap(t =>
      t.legs
        .filter(l => l.to_airport)
        .map(l => getAirportInfo(l.to_airport)?.country)
        .filter((c): c is string => !!c && c !== 'United Kingdom')
    )
  ).size

  const referenceDate = roleRow?.reference_date ?? null
  const annualMax = 90
  const firstName = user.displayName.split(' ')[0]
  const canDelete = user.role === 'main'

  return (
    <DashboardClient
      firstName={firstName}
      daysUsed={totalDaysThisYear}
      annualMax={annualMax}
      referenceDate={referenceDate}
      upcoming={upcoming}
      past={past}
      allTrips={enriched}
      multiCityCount={multiCityCount}
      countriesThisYear={countriesThisYear}
      totalDaysThisYear={totalDaysThisYear}
      journeysThisYear={journeysThisYear}
      currentYear={currentYear}
      canDelete={canDelete}
    />
  )
}
