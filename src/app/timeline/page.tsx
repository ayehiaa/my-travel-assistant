import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import TripTimeline from '@/components/timeline/TripTimeline'
import { daysOutsideUKInWindow } from '@/lib/daysCalculator'

export const metadata = {
  title: 'Timeline — Sojourn',
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
    .select('id, days_outside_uk, trip_type, source, legs:trip_legs(from_airport, to_airport, departure_at, leg_order)')
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

  const windowStart = chartWindowStart
  const windowEnd   = chartWindowEnd
  const eyebrow = `${windowStart.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} → ${windowEnd.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px clamp(16px, 4vw, 32px)' }}>
      {/* Page head */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4 }}>
            12-month view · {eyebrow}
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(28px,4vw,42px)', letterSpacing: '-0.02em', color: 'var(--ink)', margin: 0 }}>
            Timeline
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/search" style={{
            background: 'var(--yellow)', color: 'var(--blue-900)',
            border: 'none', borderRadius: 999, padding: '8px 18px',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'var(--sans)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
          }}>
            + New trip
          </a>
        </div>
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
