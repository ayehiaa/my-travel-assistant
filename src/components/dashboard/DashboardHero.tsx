'use client'

import Link from 'next/link'
import { UserRole } from '@/types/database'

interface Props {
  firstName: string
  ownerFirstName: string
  role: UserRole
  daysUsed: number
  daysMax: number
  referenceDate: string | null
  onLogPastTrip: () => void
  onImportFromGmail?: () => void
}

export default function DashboardHero({ firstName, ownerFirstName, role, daysUsed, daysMax, referenceDate, onLogPastTrip, onImportFromGmail }: Props) {
  const isAssistant = role === 'assistant'
  const pct = Math.min(100, (daysUsed / daysMax) * 100)
  const remaining = daysMax - daysUsed

  const windowEnd = referenceDate
    ? new Date(referenceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <section className="sj-hero-grid" style={{
      position: 'relative',
      background: 'linear-gradient(135deg, var(--blue-700) 0%, var(--blue-900) 100%)',
      borderRadius: 'var(--r-xl)',
      padding: '40px 44px',
      color: 'white',
      overflow: 'hidden',
      marginBottom: 32,
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr',
      gap: 40,
      alignItems: 'center',
    }}>
      {/* Radial blobs */}
      <div style={{ position: 'absolute', width: 280, height: 280, right: -60, top: -90, background: 'radial-gradient(circle,var(--yellow),transparent 70%)', opacity: 0.25, borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 240, height: 240, left: '30%', bottom: -120, background: 'radial-gradient(circle,var(--coral),transparent 70%)', opacity: 0.35, borderRadius: '50%', pointerEvents: 'none' }} />

      {/* Left — text */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        {windowEnd && (
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)', marginBottom: 12 }}>
            90-day rule · window ends {windowEnd}
          </div>
        )}
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(36px,4.4vw,56px)', lineHeight: 1.05, letterSpacing: '-0.025em', margin: '0 0 14px' }}>
          {isAssistant ? (
            <>Hello, <span style={{ color: 'var(--yellow)' }}>{firstName}</span><br />
            you&rsquo;re viewing <span style={{ color: 'var(--yellow)' }}>{ownerFirstName}</span>&rsquo;s account</>
          ) : (
            <>Hello, <span style={{ color: 'var(--yellow)' }}>{firstName}</span><br />
            where to next?</>
          )}
        </h1>
        <p style={{ margin: '0 0 22px', fontSize: 16, opacity: 0.85, maxWidth: '38ch' }}>
          {isAssistant
            ? `Search and log trips on ${ownerFirstName}'s behalf — all changes are recorded in the audit log.`
            : 'Plan flights, log every day abroad, stay on the right side of the SRT — without spreadsheets.'
          }
        </p>
        <div style={{ display: 'inline-flex', gap: 10 }}>
          <Link
            href="/search"
            style={{ background: 'var(--yellow)', color: 'var(--blue-900)', boxShadow: '0 2px 0 #d99500', borderRadius: 'var(--r)', padding: '12px 20px', fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            + Plan a new trip
          </Link>
          <button
            onClick={onLogPastTrip}
            style={{ background: 'rgba(255,255,255,.10)', color: 'white', border: '1px solid rgba(255,255,255,.25)', borderRadius: 'var(--r)', padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--sans)' }}
          >
            + Log a past trip
          </button>
          {onImportFromGmail && (
            <button
              onClick={onImportFromGmail}
              style={{ background: 'rgba(255,255,255,.10)', color: 'white', border: '1px solid rgba(255,255,255,.25)', borderRadius: 'var(--r)', padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--sans)' }}
            >
              Import from Gmail
            </button>
          )}
        </div>
      </div>

      {/* Right — glass days card */}
      <div className="sj-hero-glass" style={{
        position: 'relative', zIndex: 2,
        background: 'rgba(255,255,255,.08)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,.18)',
        borderRadius: 'var(--r-lg)',
        padding: '22px 24px',
      }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 6 }}>
          {isAssistant ? `${ownerFirstName}'s days abroad` : 'Annual days abroad'}{windowEnd ? ` · till ${windowEnd}` : ''}
        </div>
        <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 92, lineHeight: 0.95, letterSpacing: '-0.04em' }}>
          {daysUsed}<span style={{ fontSize: 28, opacity: 0.6, fontWeight: 500 }}> / {daysMax}</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.15)', overflow: 'hidden', margin: '14px 0 10px' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,var(--mint),var(--yellow) 70%,var(--coral))' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.8 }}>
          <span>Used {Math.round(pct)}%</span>
          <span>{remaining} days remaining</span>
        </div>
      </div>
    </section>
  )
}
