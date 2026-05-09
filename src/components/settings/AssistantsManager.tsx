'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Assistant {
  id: string
  assistantUserId: string
  displayName: string
  createdAt: string
}

function initials(name: string) {
  return name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AssistantsManager({ initial }: { initial: Assistant[] }) {
  const router = useRouter()
  const [assistants, setAssistants] = useState<Assistant[]>(initial)
  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/account-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      return
    }

    setAssistants(prev => [...prev, data])
    setEmail('')
    setInviting(false)
    router.refresh()
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
      {/* Invite row — shown when inviting */}
      {inviting ? (
        <form
          onSubmit={handleAdd}
          style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8,
            padding: 12,
            background: 'var(--blue-100)', border: '2px dashed var(--blue-500)',
            borderRadius: 'var(--r)', alignItems: 'center', marginBottom: 4,
          }}
        >
          <div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="assistant@example.com"
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
            {error && <p style={{ fontSize: 12, color: 'var(--coral)', marginTop: 4 }}>{error}</p>}
          </div>
          <button
            type="button"
            onClick={() => { setInviting(false); setEmail(''); setError(null) }}
            style={{
              background: 'none', border: '1.5px solid var(--rule)', borderRadius: 999,
              padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)',
              cursor: 'pointer', fontFamily: 'var(--sans)',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !email}
            style={{
              background: 'var(--blue-700)', color: 'white',
              border: 'none', borderRadius: 999, padding: '8px 16px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--sans)', opacity: (loading || !email) ? 0.5 : 1,
            }}
          >
            {loading ? 'Adding…' : 'Send invite'}
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
          + Invite assistant
        </button>
      )}

      {/* Assistant list */}
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
                display: 'grid', gridTemplateColumns: '40px 1.4fr 1fr auto',
                gap: 14, alignItems: 'center',
                padding: '12px 14px',
                background: 'var(--paper-2)', border: '1px solid var(--rule)',
                borderRadius: 'var(--r)',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--coral)', color: 'white',
                fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14,
                display: 'grid', placeItems: 'center',
              }}>
                {initials(a.displayName)}
              </div>

              {/* Name + email */}
              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                  {a.displayName}
                </div>
              </div>

              {/* Linked date */}
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Linked</small>
                {fmtDate(a.createdAt)}
              </div>

              {/* Unlink button */}
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
          ))}
        </div>
      )}
    </div>
  )
}
