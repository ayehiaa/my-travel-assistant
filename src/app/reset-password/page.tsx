'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Stage = 'verifying' | 'ready' | 'invalid'

export default function ResetPasswordPage() {
  const [stage, setStage] = useState<Stage>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [validationError, setValidationError] = useState('')
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const checked = useRef(false)

  useEffect(() => {
    if (checked.current) return
    checked.current = true
    async function checkSession() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setStage(user ? 'ready' : 'invalid')
    }
    checkSession()
  }, [])

  function validate(): boolean {
    if (password.length < 8) { setValidationError('Password must be at least 8 characters.'); return false }
    if (password !== confirm) { setValidationError('Passwords do not match.'); return false }
    setValidationError('')
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setServerError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setServerError(error.message); setLoading(false); return }
    await supabase.auth.signOut()
    window.location.href = '/login?message=password_updated'
  }

  const inputStyle = {
    border: '1.5px solid var(--rule)', borderRadius: 10, padding: '12px 14px',
    fontSize: 15, background: 'white', outline: 'none', fontFamily: 'var(--sans)',
    width: '100%', boxSizing: 'border-box' as const, transition: 'border-color .15s, box-shadow .15s',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Brand */}
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)', textDecoration: 'none', marginBottom: 28 }}>
          <div style={{ width: 32, height: 32, background: 'var(--blue-700)', color: 'white', borderRadius: 9, display: 'grid', placeItems: 'center', fontWeight: 800, transform: 'rotate(-6deg)', fontSize: 17 }}>S</div>
          Sojourn
        </Link>

        <div style={{ background: 'var(--paper)', borderRadius: 20, border: '1px solid var(--rule)', boxShadow: 'var(--shadow)', padding: '28px 32px' }}>
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Choose a new password</h2>
          <p style={{ color: 'var(--ink-3)', margin: '0 0 24px', fontSize: 14 }}>Pick something you haven&apos;t used before.</p>

          {stage === 'verifying' && (
            <p style={{ fontSize: 14, color: 'var(--ink-3)', textAlign: 'center', padding: '16px 0' }}>Verifying your reset link…</p>
          )}

          {stage === 'invalid' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--coral-soft)', border: '1px solid var(--coral)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#b8493d' }}>
                This reset link is invalid or has expired. Reset links are valid for 1 hour.
              </div>
              <Link
                href="/forgot-password"
                style={{ display: 'block', textAlign: 'center', background: 'var(--blue-700)', color: 'white', borderRadius: 10, padding: '13px 18px', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}
              >
                Request a new link
              </Link>
            </div>
          )}

          {stage === 'ready' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="password" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.02em' }}>New password</label>
                <input
                  id="password" type="password" required autoComplete="new-password" autoFocus
                  value={password} onChange={e => { setPassword(e.target.value); setValidationError('') }}
                  placeholder="Min. 8 characters" style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue-700)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-100)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--rule)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="confirm" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.02em' }}>Confirm new password</label>
                <input
                  id="confirm" type="password" required autoComplete="new-password"
                  value={confirm} onChange={e => { setConfirm(e.target.value); setValidationError('') }}
                  placeholder="Repeat your new password" style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue-700)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--blue-100)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--rule)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>

              {(validationError || serverError) && (
                <div style={{ background: 'var(--coral-soft)', border: '1px solid var(--coral)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#b8493d' }}>
                  {validationError || serverError}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                style={{ background: 'var(--blue-700)', color: 'white', border: 'none', borderRadius: 10, padding: '13px 18px', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'var(--sans)', transition: 'background .15s' }}
                onMouseOver={e => { if (!loading) e.currentTarget.style.background = 'var(--blue-900)' }}
                onMouseOut={e => { e.currentTarget.style.background = 'var(--blue-700)' }}
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>

        {stage !== 'invalid' && (
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--ink-3)' }}>
            <Link href="/login" style={{ color: 'var(--blue-700)', fontWeight: 600 }}>← Back to sign in</Link>
          </p>
        )}
      </div>
    </div>
  )
}
