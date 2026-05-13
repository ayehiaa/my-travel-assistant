'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const STAMPS = [
  { label: 'LHR → CDG', sub: '4 days abroad', rotate: '-3deg' },
  { label: 'LHR → DXB', sub: '13 days abroad', rotate: '2deg' },
  { label: 'LHR → DUS', sub: '7 days abroad', rotate: '-1deg' },
  { label: '73 / 90 days', sub: 'annual limit', rotate: '4deg' },
]

export default function LoginPage() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(() =>
    searchParams.get('error') === 'auth_callback_failed'
      ? 'Sign-in failed. Please try again.'
      : searchParams.get('error') === 'invite_link_expired'
      ? 'This invitation link has expired or already been used. Ask your account owner to resend the invite.'
      : ''
  )
  const [loading, setLoading] = useState(false)

  const successMessage =
    searchParams.get('message') === 'password_updated'
      ? 'Password updated successfully. Sign in with your new password.'
      : ''

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.href = '/'
  }

  async function handleGoogleLogin() {
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.05fr 1fr' }}>

      {/* ── Left panel ── */}
      <div style={{
        background: 'linear-gradient(160deg, var(--blue-700) 0%, var(--blue-900) 60%, #050d24 100%)',
        color: 'white',
        padding: 56,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Radial blobs */}
        <div style={{ position: 'absolute', width: 380, height: 380, right: -100, top: -120, background: 'radial-gradient(circle,var(--yellow),transparent 65%)', opacity: 0.3, borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 320, height: 320, left: -80, bottom: -100, background: 'radial-gradient(circle,var(--coral),transparent 65%)', opacity: 0.25, borderRadius: '50%', pointerEvents: 'none' }} />

        {/* Brand mark */}
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, color: 'white', textDecoration: 'none', position: 'relative', zIndex: 2 }}>
          <div style={{ width: 38, height: 38, background: 'var(--yellow)', color: 'var(--blue-900)', borderRadius: 12, display: 'grid', placeItems: 'center', fontWeight: 800, transform: 'rotate(-6deg)', fontSize: 22 }}>S</div>
          Sojourn
        </Link>

        {/* Headline */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(42px,5vw,64px)', lineHeight: 1.02, letterSpacing: '-0.02em', maxWidth: '13ch', margin: '0 0 40px' }}>
            Track every{' '}
            <span style={{ color: 'var(--yellow)' }}>day</span>{' '}
            you spent{' '}
            <span style={{ color: 'var(--yellow)' }}>abroad.</span>
          </h1>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {STAMPS.map(s => (
              <div key={s.label} style={{
                border: '2px dashed rgba(255,255,255,.35)',
                borderRadius: 14,
                padding: '10px 14px',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: 'rgba(255,255,255,.85)',
                transform: `rotate(${s.rotate})`,
              }}>
                <div>{s.label}</div>
                <div style={{ opacity: 0.6, fontSize: 10, marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ background: 'var(--paper)', padding: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 38, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Welcome back</h2>
        <p style={{ color: 'var(--ink-3)', margin: '0 0 28px', fontSize: 15 }}>Sign in to your Sojourn account</p>

        {successMessage && (
          <div style={{ background: 'var(--mint-soft)', border: '1px solid var(--mint)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 14, color: '#1a6b4a' }}>
            {successMessage}
          </div>
        )}

        <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="email" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.02em' }}>Email</label>
            <input
              id="email" type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ border: '1.5px solid var(--rule)', borderRadius: 10, padding: '12px 14px', fontSize: 15, background: 'white', outline: 'none', fontFamily: 'var(--sans)', transition: 'border-color .15s, box-shadow .15s' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue-700)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-100)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--rule)'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="password" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.02em' }}>Password</label>
              <Link href="/forgot-password" style={{ fontSize: 12, color: 'var(--blue-700)', fontWeight: 600 }}>Forgot password?</Link>
            </div>
            <input
              id="password" type="password" required autoComplete="current-password"
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
            style={{ background: 'var(--blue-700)', color: 'white', border: 'none', borderRadius: 10, padding: '13px 18px', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, transition: 'background .15s, transform .12s', fontFamily: 'var(--sans)' }}
            onMouseOver={e => { if (!loading) e.currentTarget.style.background = 'var(--blue-900)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'var(--blue-700)' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
          or
          <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogleLogin}
          style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 18px', borderRadius: 10, border: '1.5px solid var(--rule)', background: 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--sans)', transition: 'background .15s' }}
          onMouseOver={e => { e.currentTarget.style.background = 'var(--paper-2)' }}
          onMouseOut={e => { e.currentTarget.style.background = 'white' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
