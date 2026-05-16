'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

  async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
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
    <div className="min-h-screen bg-paper-2 flex flex-col items-center justify-center px-4 py-12">

      {/* Logo lockup */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-yellow rounded-[12px] grid place-items-center font-extrabold text-[22px] text-[var(--blue-900)] -rotate-6 select-none">S</div>
        <span className="font-display font-bold text-2xl tracking-tight text-ink">Sojourn</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-paper rounded-2xl shadow-[var(--shadow-lg)] p-8 sm:p-10">

        <h2 className="font-display font-bold text-[2rem] leading-tight tracking-tight text-ink mb-1.5">Welcome back</h2>
        <p className="text-sm text-ink-3 mb-7">Sign in to your Sojourn account</p>

        {successMessage && (
          <div className="bg-mint-soft border border-mint rounded-[10px] px-3.5 py-3 mb-4 text-[14px] text-[#1a6b4a]">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[12px] font-bold text-ink-2 tracking-wide">Email</label>
            <input
              id="email" type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border-[1.5px] border-rule rounded-[10px] px-3.5 py-3 text-[15px] bg-paper font-sans outline-none transition-colors focus:border-brand focus:ring-3 focus:ring-brand-light"
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label htmlFor="password" className="text-[12px] font-bold text-ink-2 tracking-wide">Password</label>
              <Link href="/forgot-password" className="text-[12px] font-semibold text-brand hover:text-brand-dark transition-colors">Forgot password?</Link>
            </div>
            <input
              id="password" type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border-[1.5px] border-rule rounded-[10px] px-3.5 py-3 text-[15px] bg-paper font-sans outline-none transition-colors focus:border-brand focus:ring-3 focus:ring-brand-light"
            />
          </div>

          {error && (
            <div className="bg-coral-soft border border-coral rounded-[10px] px-3.5 py-3 text-[14px] text-[#b8493d]">{error}</div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full bg-brand text-white rounded-[10px] px-4 py-3.5 text-[15px] font-bold font-sans transition-colors hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5 text-[11px] font-bold tracking-[0.12em] uppercase text-ink-4">
          <div className="flex-1 h-px bg-rule" />
          or
          <div className="flex-1 h-px bg-rule" />
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-[10px] border-[1.5px] border-rule bg-paper font-semibold text-[14px] font-sans transition-colors hover:bg-paper-2"
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
