'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [token, setToken] = useState<string | null>(null)
  const [validating, setValidating] = useState(true)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const t = searchParams.get('token')
    if (!t) { router.replace('/login?error=invite_only'); return }

    fetch(`/api/customer-invitations/validate?token=${encodeURIComponent(t)}`)
      .then(r => r.json())
      .then((data: { valid: boolean; email?: string; invited_name?: string }) => {
        if (!data.valid) { router.replace('/login?error=invite_only'); return }
        setToken(t)
        setEmail(data.email ?? '')
        setFullName(data.invited_name ?? '')
        setValidating(false)
      })
      .catch(() => router.replace('/login?error=invite_only'))
  }, [searchParams, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (fullName.trim().length === 0) { setError('Full name is required'); return }
    if (fullName.trim().length > 100) { setError('Full name must be under 100 characters'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }

    setLoading(true)
    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (signUpError) { setError(signUpError.message); setLoading(false); return }

    // Consume the invitation token — fire and don't block on failure
    if (token) {
      fetch('/api/customer-invitations/accept', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {})
    }

    setLoading(false)
    setSubmitted(true)
  }

  if (validating) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--rule)', borderTopColor: 'var(--blue-700)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: 'white', borderRadius: 18, padding: '48px 40px', maxWidth: 420, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,.07)', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, background: '#dcfce7', borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto 24px', fontSize: 28 }}>✉️</div>
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Check your inbox</h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.6, margin: '0 0 8px' }}>
            We sent a confirmation link to <strong>{email}</strong>.
          </p>
          <p style={{ color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.6, margin: '0 0 28px' }}>
            Click it to activate your account and be taken straight to your dashboard.
          </p>
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>
            Didn&apos;t get it? Check spam, or{' '}
            <button
              onClick={() => setSubmitted(false)}
              style={{ background: 'none', border: 'none', color: 'var(--blue-700)', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'var(--sans)' }}
            >
              try again
            </button>
            .
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: 'white', borderRadius: 18, padding: '48px 40px', maxWidth: 420, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,.07)' }}>

        {/* Brand mark */}
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)', textDecoration: 'none', marginBottom: 32 }}>
          <div style={{ width: 34, height: 34, background: 'var(--yellow)', color: 'var(--blue-900)', borderRadius: 10, display: 'grid', placeItems: 'center', fontWeight: 800, transform: 'rotate(-6deg)', fontSize: 20 }}>S</div>
          Sojourn
        </Link>

        <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Create your account</h2>
        <p style={{ color: 'var(--ink-3)', margin: '0 0 28px', fontSize: 15 }}>You&apos;ve been invited — set a password to get started.</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="fullName" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.02em' }}>Full name</label>
            <input
              id="fullName" type="text" required autoComplete="name"
              value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Jane Smith"
              style={{ border: '1.5px solid var(--rule)', borderRadius: 10, padding: '12px 14px', fontSize: 15, background: 'white', outline: 'none', fontFamily: 'var(--sans)', transition: 'border-color .15s, box-shadow .15s' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue-700)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-100)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--rule)'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="email" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.02em' }}>Email</label>
            <input
              id="email" type="email" required readOnly
              value={email}
              style={{ border: '1.5px solid var(--rule)', borderRadius: 10, padding: '12px 14px', fontSize: 15, background: 'var(--paper)', outline: 'none', fontFamily: 'var(--sans)', color: 'var(--ink-2)', cursor: 'not-allowed' }}
            />
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Locked to your invitation</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="password" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.02em' }}>Password</label>
            <input
              id="password" type="password" required autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ border: '1.5px solid var(--rule)', borderRadius: 10, padding: '12px 14px', fontSize: 15, background: 'white', outline: 'none', fontFamily: 'var(--sans)', transition: 'border-color .15s, box-shadow .15s' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue-700)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-100)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--rule)'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          {error && (
            <div style={{ background: 'var(--coral-soft)', border: '1px solid var(--coral)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#b8493d' }}>{error}</div>
          )}

          <button
            type="submit" disabled={loading}
            style={{ background: 'var(--blue-700)', color: 'white', border: 'none', borderRadius: 10, padding: '13px 18px', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, transition: 'background .15s', fontFamily: 'var(--sans)' }}
            onMouseOver={e => { if (!loading) e.currentTarget.style.background = 'var(--blue-900)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'var(--blue-700)' }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-3)', marginTop: 20, marginBottom: 0 }}>
          Already have an account?{' '}
          <Link href="/login" style={{ fontWeight: 600, color: 'var(--blue-700)' }}>
            Sign in →
          </Link>
        </p>
      </div>
    </div>
  )
}
