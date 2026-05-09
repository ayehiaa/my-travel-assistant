'use client'

import { useState } from 'react'
import { TripWithUsers } from '@/types/database'
import DashboardHero from './DashboardHero'
import UpcomingTrips from './UpcomingTrips'
import PastTrips from './PastTrips'

interface Props {
  firstName: string
  daysUsed: number
  annualMax: number
  referenceDate: string | null
  upcoming: TripWithUsers[]
  past: TripWithUsers[]
  canDelete: boolean
}

export default function DashboardClient({
  firstName, daysUsed, annualMax, referenceDate,
  upcoming, past, canDelete,
}: Props) {
  const [showModal, setShowModal] = useState(false)

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 28px 80px' }}>

      <DashboardHero
        firstName={firstName}
        daysUsed={daysUsed}
        daysMax={annualMax}
        referenceDate={referenceDate}
        onLogPastTrip={() => setShowModal(true)}
      />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, margin: '36px 0 18px' }}>
        <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(28px,3vw,36px)', letterSpacing: '-0.02em', margin: 0 }}>Upcoming trips</h2>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          {upcoming.length} on the board
        </span>
      </div>
      <UpcomingTrips trips={upcoming} canDelete={canDelete} />

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
      />

    </div>
  )
}
