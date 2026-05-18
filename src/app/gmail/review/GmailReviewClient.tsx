'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/context/ToastContext'
import Skeleton from '@/components/ui/Skeleton'
import GmailFlightCard from '@/components/gmail/GmailFlightCard'

export interface EditableCandidate {
  gmail_message_id: string
  from: string
  subject: string
  from_airport: string
  to_airport: string
  flight_number: string
  airline: string
  departure_at: string
  return_at: string
  saving: boolean
  saved: boolean
  warning: string | null
  error: string | null
}

export default function GmailReviewClient() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<EditableCandidate[]>([])

  useEffect(() => {
    fetch('/api/gmail/import')
      .then(async res => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          // If NOT_CONNECTED, redirect to auth
          if (data?.error === 'NOT_CONNECTED') {
            const authRes = await fetch('/api/gmail/auth-url')
            if (authRes.ok) {
              const { url } = await authRes.json()
              window.location.href = url
              return
            }
          }
          toast('Failed to load Gmail emails', 'error')
          return
        }
        const data = await res.json()
        setCandidates(
          (data.candidates ?? []).map((c: {
            gmail_message_id: string
            from: string
            subject: string
            parsed: {
              from_airport: string
              to_airport: string
              flight_number: string
              airline: string
              departure_at: string
              return_at: string | null
            }
          }) => ({
            gmail_message_id: c.gmail_message_id,
            from: c.from,
            subject: c.subject,
            from_airport: c.parsed?.from_airport ?? '',
            to_airport: c.parsed?.to_airport ?? '',
            flight_number: c.parsed?.flight_number ?? '',
            airline: c.parsed?.airline ?? '',
            departure_at: c.parsed?.departure_at?.split('T')[0] ?? '',
            return_at: c.parsed?.return_at?.split('T')[0] ?? '',
            saving: false,
            saved: false,
            warning: null,
            error: null,
          }))
        )
      })
      .finally(() => setLoading(false))
  }, [toast])

  function handleFieldChange(id: string, field: keyof EditableCandidate, value: string) {
    setCandidates(prev =>
      prev.map(c => c.gmail_message_id === id ? { ...c, [field]: value } : c)
    )
  }

  async function handleSave(id: string) {
    const candidate = candidates.find(c => c.gmail_message_id === id)
    if (!candidate) return

    setCandidates(prev => prev.map(c => c.gmail_message_id === id ? { ...c, saving: true, warning: null, error: null } : c))

    const res = await fetch('/api/gmail/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gmail_message_id: candidate.gmail_message_id,
        from_airport: candidate.from_airport.toUpperCase(),
        to_airport: candidate.to_airport.toUpperCase(),
        departure_at: candidate.departure_at,
        return_at: candidate.return_at || null,
        flight_number: candidate.flight_number,
        airline: candidate.airline,
      }),
    })

    if (!res.ok) {
      setCandidates(prev => prev.map(c => c.gmail_message_id === id ? { ...c, saving: false, error: 'Failed to save trip' } : c))
      toast('Failed to save trip', 'error')
      return
    }

    const data = await res.json()
    setCandidates(prev =>
      prev.map(c => c.gmail_message_id === id ? {
        ...c,
        saving: false,
        saved: true,
        warning: data.warning ?? null,
      } : c)
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    )
  }

  if (candidates.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink-3)' }}>
        <p style={{ fontSize: 16, marginBottom: 16 }}>No new flight confirmation emails found.</p>
        <Link href="/" style={{ color: 'var(--blue-700)', fontWeight: 600, textDecoration: 'none' }}>
          &larr; Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {candidates.map(candidate => (
        <GmailFlightCard
          key={candidate.gmail_message_id}
          candidate={candidate}
          onFieldChange={(field, value) => handleFieldChange(candidate.gmail_message_id, field, value)}
          onSave={() => handleSave(candidate.gmail_message_id)}
        />
      ))}
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <Link href="/" style={{ color: 'var(--ink-3)', fontSize: 13, textDecoration: 'none' }}>
          &larr; Back to dashboard
        </Link>
      </div>
    </div>
  )
}
