import { getAuthUser, isPremiumOrAbove } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'
import LandingPage from '@/components/landing/LandingPage'
import { TripWithUsers, UserRoleRecord, ExpenseWithCategory } from '@/types/database'
import { daysOutsideUKInWindow } from '@/lib/daysCalculator'

export const metadata = {
  title: 'Sojourn — Dashboard',
  description: 'Track every day outside the UK. Stay on the right side of the Statutory Residence Test.',
}

export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) return <LandingPage />

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  const [{ data: rawTrips }, { data: roleRow }, { data: rawExpenses }] = await Promise.all([
    supabase
      .from('trips')
      .select('*, legs:trip_legs(*)')
      .eq('owner_id', activeMainAccountId)
      .order('leg_order', { referencedTable: 'trip_legs', ascending: true }),
    supabase
      .from('user_roles')
      .select('reference_date, display_name, role')
      .eq('user_id', activeMainAccountId)
      .single(),
    supabase
      .from('expenses')
      .select('*, category:expense_categories(name)')
      .eq('owner_id', activeMainAccountId)
      .order('expense_date', { ascending: false }),
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

  const referenceDate = roleRow?.reference_date ?? null
  const annualMax = 90

  // Rolling 12-month days abroad ending at referenceDate (same logic as Timeline/Settings)
  let annualDaysAbroad = 0
  if (referenceDate) {
    const refEnd   = new Date(referenceDate)
    const refStart = new Date(referenceDate)
    refStart.setFullYear(refStart.getFullYear() - 1)
    const refStartIso = refStart.toISOString()
    const refEndIso   = refEnd.toISOString()

    annualDaysAbroad = enriched
      .filter(t => {
        if (!t.legs.length) return false
        const firstDep = t.legs[0].departure_at
        const lastDep  = t.legs[t.legs.length - 1].departure_at
        return firstDep <= refEndIso && lastDep >= refStartIso
      })
      .reduce((acc, t) => acc + daysOutsideUKInWindow(
        t.legs[0].departure_at,
        t.legs[t.legs.length - 1].departure_at,
        refStart,
        refEnd,
      ), 0)
  }
  const atTripLimit = !(roleRow?.role && isPremiumOrAbove(roleRow.role)) && enriched.length >= 10

  const expensesByTripId = ((rawExpenses ?? []) as ExpenseWithCategory[]).reduce<Record<string, ExpenseWithCategory[]>>((acc, e) => {
    if (!e.trip_id) return acc
    acc[e.trip_id] = [...(acc[e.trip_id] ?? []), e]
    return acc
  }, {})

  const firstName = user.displayName.split(' ')[0]
  const canDelete = true

  let ownerFirstName = firstName
  if (user.role === 'assistant') {
    const ownerDisplayName = roleRow && 'display_name' in roleRow ? (roleRow as { display_name?: string }).display_name : undefined
    if (ownerDisplayName) ownerFirstName = ownerDisplayName.split(' ')[0]
  }

  return (
    <DashboardClient
      firstName={firstName}
      ownerFirstName={ownerFirstName}
      role={user.role}
      daysUsed={annualDaysAbroad}
      annualMax={annualMax}
      referenceDate={referenceDate}
      upcoming={upcoming}
      past={past}
      canDelete={canDelete}
      atTripLimit={atTripLimit}
      expensesByTripId={expensesByTripId}
    />
  )
}
