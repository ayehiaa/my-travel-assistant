'use client'

import { useState, useEffect } from 'react'
import { CustomerInvitation, CustomerInvitationStatus } from '@/types/database'

function initials(name: string) {
  return name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status, expiresAt }: { status: CustomerInvitationStatus; expiresAt: string }) {
  if (status === 'accepted') {
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
        padding: '3px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534',
      }}>Accepted</span>
    )
  }
  if (status === 'pending') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: 999, background: '#fef9c3', color: '#713f12',
        }}>Pending</span>
        <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>expires {fmtDate(expiresAt)}</span>
      </div>
    )
  }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      padding: '3px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b',
    }}>Expired</span>
  )
}

function avatarBg(status: CustomerInvitationStatus) {
  if (status === 'accepted') return '#16a34a'
  if (status === 'pending') return '#ca8a04'
  return 'var(--ink-3)'
}

export default function CustomerInviteManager() {
  const [invitations, setInvitations] = useState<CustomerInvitation[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/customer-invitations')
      .then(r => r.json())
      .then((data: CustomerInvitation[]) => { setInvitations(data); setLoadingList(false) })
      .catch(() => setLoadingList(false))
  }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/customer-invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, invitedName: name }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
    setInvitations(prev => [data, ...prev])
    setName(''); setEmail(''); setInviting(false)
  }

  async function handleResend(id: string) {
    setResendingId(id)
    const res = await fetch('/api/customer-invitations/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    setResendingId(null)
    if (res.ok) {
      setInvitations(prev => prev.map(inv =>
        inv.id === id ? { ...inv, status: 'pending', expires_at: data.expiresAt } : inv
      ))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {inviting ? (
        <form
          onSubmit={handleInvite}
          style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8,
            padding: 12,
            background: 'var(--blue-100)', border: '2px dashed var(--blue-500)',
            borderRadius: 'var(--r)', alignItems: 'start', marginBottom: 4,
          }}
        >
          <div>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Customer's full name"
              required
              autoFocus
              style={{
                width: '100%', border: '1.5px solid var(--rule)', borderRadius: 8,
                padding: '10px 12px', fontSize: 14, background: 'white',
                fontFamily: 'var(--sans)', color: 'var(--ink)', outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue-700)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--rule)' }}
            />
          </div>
          <div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="customer@example.com"
              required
              style={{
                width: '100%', border: '1.5px solid var(--rule)', borderRadius: 8,
                padding: '10px 12px', fontSize: 14, background: 'white',
                fontFamily: 'var(--sans)', color: 'var(--ink)', outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue-700)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--rule)' }}
            />
            {error && <p style={{ fontSize: 12, color: 'var(--coral)', marginTop: 4 }}>{error}</p>}
          </div>
          <button
            type="button"
            onClick={() => { setInviting(false); setName(''); setEmail(''); setError(null) }}
            style={{
              background: 'none', border: '1.5px solid var(--rule)', borderRadius: 999,
              padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)',
              cursor: 'pointer', fontFamily: 'var(--sans)', marginTop: 2,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !email || !name}
            style={{
              background: 'var(--blue-700)', color: 'white',
              border: 'none', borderRadius: 999, padding: '8px 16px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--sans)', opacity: (submitting || !email || !name) ? 0.5 : 1,
              marginTop: 2,
            }}
          >
            {submitting ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      ) : (
        <button
          onClick={() => setInviting(true)}
          style={{
            alignSelf: 'flex-start',
            background: 'none', border: '2px dashed var(--blue-500)', borderRadius: 999,
            padding: '8px 18px', fontSize: 13, fontWeight: 600, color: 'var(--blue-500)',
            cursor: 'pointer', fontFamily: 'var(--sans)',
          }}
        >
          + Invite customer
        </button>
      )}

      {loadingList ? (
        <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '12px 0' }}>Loading…</div>
      ) : invitations.length === 0 ? (
        <div style={{
          border: '2px dashed var(--rule)', borderRadius: 'var(--r)',
          padding: '24px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13,
        }}>
          No invitations sent yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {invitations.map(inv => (
            <div
              key={inv.id}
              style={{
                display: 'grid', gridTemplateColumns: '40px 1.4fr 1fr auto auto',
                gap: 14, alignItems: 'center',
                padding: '12px 14px',
                background: 'var(--paper-2)', border: '1px solid var(--rule)',
                borderRadius: 'var(--r)',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: avatarBg(inv.status),
                color: 'white',
                fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14,
                display: 'grid', placeItems: 'center',
              }}>
                {initials(inv.invited_name)}
              </div>

              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                  {inv.invited_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{inv.email}</div>
              </div>

              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Invited</small>
                {fmtDate(inv.invited_at)}
              </div>

              <StatusBadge status={inv.status} expiresAt={inv.expires_at} />

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {(inv.status === 'pending' || inv.status === 'expired') && (
                  <button
                    onClick={() => handleResend(inv.id)}
                    disabled={resendingId === inv.id}
                    style={{
                      background: 'none', border: '1.5px solid var(--blue-500)', borderRadius: 999,
                      padding: '6px 14px', fontSize: 13, fontWeight: 600, color: 'var(--blue-700)',
                      cursor: 'pointer', fontFamily: 'var(--sans)',
                      opacity: resendingId === inv.id ? 0.4 : 1,
                    }}
                  >
                    {resendingId === inv.id ? 'Sending…' : 'Resend'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
