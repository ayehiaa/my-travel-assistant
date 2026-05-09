import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { UserRoleRecord } from '@/types/database'
import { daysOutsideUKInWindow } from '@/lib/daysCalculator'
import AssistantsManager from '@/components/settings/AssistantsManager'
import ReferenceDateSettings from '@/components/settings/ReferenceDateSettings'

export const metadata = {
  title: 'Settings — Sojourn',
}

function initials(name: string) {
  return name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()
}

export default async function SettingsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (user.role !== 'main') redirect('/')

  const supabase = await createClient()

  const { data: links } = await supabase
    .from('account_links')
    .select('id, assistant_user_id, created_at')
    .eq('main_user_id', user.id)
    .order('created_at', { ascending: true })

  const assistantIds = (links ?? []).map(l => l.assistant_user_id)
  let nameMap = new Map<string, Pick<UserRoleRecord, 'display_name'>>()
  if (assistantIds.length > 0) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, display_name')
      .in('user_id', assistantIds)
    nameMap = new Map((roles ?? []).map(r => [r.user_id, { display_name: r.display_name }]))
  }

  const initial = (links ?? []).map(l => ({
    id: l.id,
    assistantUserId: l.assistant_user_id,
    displayName: nameMap.get(l.assistant_user_id)?.display_name ?? 'Unknown',
    createdAt: l.created_at,
  }))

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('reference_date')
    .eq('user_id', user.id)
    .single()

  const referenceDate = roleRow?.reference_date ?? null

  // Compute annual days abroad for the reference date meter
  let annualDaysAbroad: number | null = null
  if (referenceDate) {
    const refEnd   = new Date(referenceDate)
    const refStart = new Date(referenceDate)
    refStart.setFullYear(refStart.getFullYear() - 1)

    const { data: allTrips } = await supabase
      .from('trips')
      .select('legs:trip_legs(departure_at, leg_order)')
      .eq('owner_id', user.id)
      .order('leg_order', { referencedTable: 'trip_legs', ascending: true })

    const refStartIso = refStart.toISOString()
    const refEndIso   = refEnd.toISOString()

    annualDaysAbroad = (allTrips ?? [])
      .filter(t => {
        const legs = t.legs ?? []
        if (!legs.length) return false
        return legs[0].departure_at <= refEndIso && legs[legs.length - 1].departure_at >= refStartIso
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

  const userInitials = initials(user.displayName)

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 32px' }}>
      {/* Page head */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4 }}>
          Account
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(28px,4vw,42px)', letterSpacing: '-0.02em', color: 'var(--ink)', margin: 0 }}>
          Settings
        </h1>
      </div>

      {/* 2×2 card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        {/* Your account */}
        <section style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--r-lg)', padding: '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, margin: 0, color: 'var(--ink)' }}>Your account</h3>
            <span style={{
              background: 'var(--blue-100)', color: 'var(--blue-700)',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '4px 10px', borderRadius: 999,
            }}>
              Main account
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'var(--blue-700)', color: 'white',
              fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18,
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              {userInitials}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                {user.displayName}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{user.email}</div>
            </div>
            <button style={{
              background: 'none', border: '1.5px solid var(--rule)', borderRadius: 999,
              padding: '7px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)',
              cursor: 'pointer', fontFamily: 'var(--sans)',
            }}>
              Edit profile
            </button>
          </div>
        </section>

        {/* Reference date */}
        <section style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--r-lg)', padding: '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, margin: 0, color: 'var(--ink)' }}>Annual days-abroad reference</h3>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>12-month rolling counter</span>
          </div>
          <ReferenceDateSettings
            initialDate={referenceDate}
            annualDaysAbroad={annualDaysAbroad}
          />
        </section>

        {/* Linked assistants — full width */}
        <section style={{ gridColumn: 'span 2', background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--r-lg)', padding: '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, margin: 0, color: 'var(--ink)' }}>Linked assistants</h3>
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 18px' }}>
            Assistants can plan, edit, and view all your trips on your behalf. Every change they make is logged in the audit trail.
          </p>
          <AssistantsManager initial={initial} />
        </section>

        {/* Danger zone — full width */}
        <section style={{
          gridColumn: 'span 2',
          borderRadius: 'var(--r-lg)',
          padding: '22px 24px',
          border: '1px solid var(--coral-soft)',
          background: 'linear-gradient(0deg, var(--coral-soft) 0%, white 100%)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, margin: 0, color: 'var(--ink)' }}>Danger zone</h3>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
            <div>
              <strong style={{ fontSize: 15, color: 'var(--ink)' }}>Delete account</strong>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 3 }}>
                This wipes all trips, audit history, and assistant links. Cannot be undone.
              </div>
            </div>
            <button style={{
              background: 'var(--coral)', color: 'white',
              border: 'none', borderRadius: 999, padding: '10px 20px',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--sans)', flexShrink: 0,
            }}>
              Delete account
            </button>
          </div>
        </section>

      </div>
    </div>
  )
}
