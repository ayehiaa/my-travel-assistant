'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { InvitationStatus } from '@/types/database'

interface Assistant {
  id: string
  assistantUserId: string
  displayName: string
  createdAt: string
  status: InvitationStatus
  expiresAt: string | null
}

function initials(name: string) {
  return name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status, expiresAt }: { status: InvitationStatus; expiresAt: string | null }) {
  if (status === 'active') {
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
        padding: '3px 10px', borderRadius: 999,
        background: '#dcfce7', color: '#166534',
      }}>Active</span>
    )
  }
  if (status === 'pending') {
    const expiry = expiresAt ? fmtDate(expiresAt) : null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: 999,
          background: '#fef9c3', color: '#713f12',
        }}>Pending</span>
        {expiry && (
          <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>expires {expiry}</span>
        )}
      </div>
    )
  }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      padding: '3px 10px', borderRadius: 999,
      background: '#fee2e2', color: '#991b1b',
    }}>Expired</span>
  )
}

export default function AssistantsManager({ initial, atAssistantLimit }: { initial: Assistant[]; atAssistantLimit: boolean }) {
  const router = useRouter()
  const [assistants, setAssistants] = useState<Assistant[]>(initial)
  const [invitingRaw, setInviting] = useState(false)
  const inviting = atAssistantLimit ? false : invitingRaw
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, assistantName: name }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      return
    }

    setAssistants(prev => [...prev, data])
    setName('')
    setEmail('')
    setInviting(false)
    router.refresh()
  }

  async function handleResend(linkId: string) {
    setResendingId(linkId)
    const res = await fetch('/api/invitations/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId }),
    })
    const data = await res.json()
    setResendingId(null)

    if (res.ok) {
      setAssistants(prev => prev.map(a =>
        a.id === linkId ? { ...a, status: 'pending', expiresAt: data.expiresAt } : a
      ))
    }
  }

  async function handleRemove(linkId: string) {
    setRemovingId(linkId)
    await fetch(`/api/account-links?id=${linkId}`, { method: 'DELETE' })
    setAssistants(prev => prev.filter(a => a.id !== linkId))
    setRemovingId(null)
    router.refresh()
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
              placeholder="Assistant's full name"
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
              placeholder="assistant@example.com"
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
            disabled={loading || !email || !name}
            style={{
              background: 'var(--blue-700)', color: 'white',
              border: 'none', borderRadius: 999, padding: '8px 16px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--sans)', opacity: (loading || !email || !name) ? 0.5 : 1,
              marginTop: 2,
            }}
          >
            {loading ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      ) : atAssistantLimit ? (
        <div style={{
          padding: '10px 16px',
          background: 'var(--paper-2)',
          border: '1.5px solid var(--rule)',
          borderRadius: 999,
          fontSize: 13,
          color: 'var(--ink-3)',
          fontFamily: 'var(--sans)',
        }}>
          Your beta plan includes 1 assistant. More seats are coming with our commercial launch!
        </div>
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
          + Invite assistant
        </button>
      )}

      {assistants.length === 0 ? (
        <div style={{
          border: '2px dashed var(--rule)', borderRadius: 'var(--r)',
          padding: '24px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13,
        }}>
          No assistants linked yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {assistants.map(a => (
            <div
              key={a.id}
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
                background: a.status === 'active' ? 'var(--coral)' : 'var(--ink-3)',
                color: 'white',
                fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14,
                display: 'grid', placeItems: 'center',
              }}>
                {initials(a.displayName)}
              </div>

              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                  {a.displayName}
                </div>
              </div>

              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Invited</small>
                {fmtDate(a.createdAt)}
              </div>

              <StatusBadge status={a.status} expiresAt={a.expiresAt} />

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {(a.status === 'pending' || a.status === 'expired') && (
                  <button
                    onClick={() => handleResend(a.id)}
                    disabled={resendingId === a.id}
                    style={{
                      background: 'none', border: '1.5px solid var(--blue-500)', borderRadius: 999,
                      padding: '6px 14px', fontSize: 13, fontWeight: 600, color: 'var(--blue-700)',
                      cursor: 'pointer', fontFamily: 'var(--sans)',
                      opacity: resendingId === a.id ? 0.4 : 1,
                    }}
                  >
                    {resendingId === a.id ? 'Sending…' : 'Resend'}
                  </button>
                )}
                <button
                  onClick={() => handleRemove(a.id)}
                  disabled={removingId === a.id}
                  style={{
                    background: 'none', border: '1.5px solid var(--rule)', borderRadius: 999,
                    padding: '6px 14px', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)',
                    cursor: 'pointer', fontFamily: 'var(--sans)',
                    opacity: removingId === a.id ? 0.4 : 1,
                  }}
                >
                  {removingId === a.id ? 'Removing…' : 'Unlink'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
