'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSubmitted(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Brand */}
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)', textDecoration: 'none', marginBottom: 28 }}>
          <div style={{ width: 32, height: 32, background: 'var(--blue-700)', color: 'white', borderRadius: 9, display: 'grid', placeItems: 'center', fontWeight: 800, transform: 'rotate(-6deg)', fontSize: 17 }}>S</div>
          Sojourn
        </Link>

        <div style={{ background: 'var(--paper)', borderRadius: 20, border: '1px solid var(--rule)', boxShadow: 'var(--shadow)', padding: '28px 32px' }}>
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Reset password</h2>
          <p style={{ color: 'var(--ink-3)', margin: '0 0 24px', fontSize: 14 }}>We&apos;ll send a reset link to your inbox.</p>

          {submitted ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--mint-soft)', border: '1px solid var(--mint)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#1a6b4a' }}>
                If an account exists for <strong>{email}</strong>, you&apos;ll receive a reset link shortly. Check your inbox.
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-3)', textAlign: 'center' }}>
                Didn&apos;t get it? Check spam or{' '}
                <button onClick={() => { setSubmitted(false); setEmail('') }} style={{ color: 'var(--blue-700)', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', fontSize: 13, fontFamily: 'var(--sans)' }}>try again</button>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="email" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.02em' }}>Email</label>
                <input
                  id="email" type="email" required autoComplete="email" autoFocus
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
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
                style={{ background: 'var(--blue-700)', color: 'white', border: 'none', borderRadius: 10, padding: '13px 18px', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'var(--sans)', transition: 'background .15s' }}
                onMouseOver={e => { if (!loading) e.currentTarget.style.background = 'var(--blue-900)' }}
                onMouseOut={e => { e.currentTarget.style.background = 'var(--blue-700)' }}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--ink-3)' }}>
          <Link href="/login" style={{ color: 'var(--blue-700)', fontWeight: 600 }}>← Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
