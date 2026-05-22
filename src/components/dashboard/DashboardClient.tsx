'use client'

import { useState } from 'react'
import { TripWithUsers, UserRole, ExpenseWithCategory } from '@/types/database'
import { useToast } from '@/context/ToastContext'
import DashboardHero from './DashboardHero'
import UpcomingTrips from './UpcomingTrips'
import PastTrips from './PastTrips'
import AddPastTripModal from './AddPastTripModal'


interface Props {
  firstName: string
  ownerFirstName: string
  role: UserRole
  daysUsed: number
  annualMax: number
  referenceDate: string | null
  upcoming: TripWithUsers[]
  past: TripWithUsers[]
  canDelete: boolean
  atTripLimit: boolean
  expensesByTripId: Record<string, ExpenseWithCategory[]>
}

export default function DashboardClient({
  firstName, ownerFirstName, role, daysUsed, annualMax, referenceDate,
  upcoming, past, canDelete, atTripLimit, expensesByTripId,
}: Props) {
  const [showModal, setShowModal] = useState(false)
  const [tripToEdit, setTripToEdit] = useState<TripWithUsers | null>(null)
  const toast = useToast()

  async function handleImportFromGmail() {
    const res = await fetch('/api/gmail/auth-url')
    if (!res.ok) {
      toast('Failed to connect to Gmail', 'error')
      return
    }
    const { url } = await res.json()
    window.location.href = url
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px clamp(16px, 4vw, 28px) 80px' }}>

      <DashboardHero
        firstName={firstName}
        ownerFirstName={ownerFirstName}
        role={role}
        daysUsed={daysUsed}
        daysMax={annualMax}
        referenceDate={referenceDate}
        onLogPastTrip={() => setShowModal(true)}
        onImportFromGmail={role === 'premium' ? handleImportFromGmail : undefined}
      />

      {atTripLimit && (
        <div style={{
          margin: '28px 0 0',
          padding: '16px 20px',
          background: 'var(--yellow)',
          borderRadius: 'var(--r-lg)',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>🌍</span>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--blue-900)', lineHeight: 1.5 }}>
            <strong>You&apos;ve reached your beta limit of 10 trips, explorer!</strong>{' '}
            Thank you for being one of our first users — a full commercial plan with monthly subscriptions is on its way. We&apos;ll let you know the moment it&apos;s ready.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, margin: '36px 0 18px' }}>
        <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(28px,3vw,36px)', letterSpacing: '-0.02em', margin: 0 }}>Upcoming trips</h2>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          {upcoming.length} on the board
        </span>
      </div>
      <UpcomingTrips trips={upcoming} canDelete={canDelete} atTripLimit={atTripLimit} expensesByTripId={expensesByTripId} onEditTrip={setTripToEdit} />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, margin: '36px 0 18px' }}>
        <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(28px,3vw,36px)', letterSpacing: '-0.02em', margin: 0 }}>Past trips</h2>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          {past.length} logged
        </span>
      </div>
      <PastTrips
        trips={past}
        canDelete={canDelete}
        showModal={showModal}
        onShowModal={setShowModal}
        atTripLimit={atTripLimit}
        expensesByTripId={expensesByTripId}
        onEditTrip={setTripToEdit}
      />

      {tripToEdit && (
        <AddPastTripModal
          tripToEdit={tripToEdit}
          isUpcoming={upcoming.some(t => t.id === tripToEdit.id)}
          onClose={() => setTripToEdit(null)}
        />
      )}

    </div>
  )
}
