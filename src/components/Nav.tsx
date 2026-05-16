'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/UserContext'

export default function Nav() {
  const user = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleAccountSwitch(mainAccountId: string) {
    if (mainAccountId === user.activeMainAccountId) return
    setSwitching(true)
    await fetch('/api/active-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mainAccountId }),
    })
    router.refresh()
    setSwitching(false)
  }

  const links = [
    { href: '/',         label: 'Dashboard'  },
    { href: '/expenses', label: 'Expenses'   },
    { href: '/search',   label: 'Plan a trip' },
    { href: '/timeline', label: 'Timeline'   },
    { href: '/audit',    label: 'Audit log'  },
    ...(user.role === 'main' || user.role === 'premium' ? [{ href: '/settings', label: 'Settings' }] : []),
  ]

  const initials = user.displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const viewingAccount = user.role === 'assistant'
    ? (user.linkedMainAccounts.find(a => a.id === user.activeMainAccountId) ?? user.linkedMainAccounts[0])
    : null

  const firstName = user.displayName.split(' ')[0]

  return (
    <nav style={{ background: 'var(--blue-700)' }} className="text-white">
      <div className="max-w-[1280px] mx-auto px-7 flex items-center justify-between h-[62px] gap-4">

        {/* Brand mark */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0" style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>
          <span style={{
            width: 34, height: 34,
            background: 'var(--yellow)',
            borderRadius: 10,
            display: 'grid', placeItems: 'center',
            color: 'var(--blue-900)',
            fontWeight: 800,
            fontSize: 20,
            transform: 'rotate(-6deg)',
            flexShrink: 0,
          }}>S</span>
          <span className="text-white">Sojourn</span>
        </Link>

        {/* Pill tab group — desktop */}
        <div
          className="hidden md:flex items-center gap-1 p-1 rounded-full"
          style={{ background: 'rgba(255,255,255,.10)' }}
        >
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-full px-4 py-2 text-[13px] font-semibold transition-colors"
              style={pathname === href
                ? { background: 'white', color: 'var(--blue-700)' }
                : { color: 'rgba(255,255,255,.85)' }
              }
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="hidden md:flex items-center gap-4 shrink-0">
          {user.role === 'assistant' && user.linkedMainAccounts.length > 0 ? (
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7 }}>
                Viewing
              </span>
              <select
                value={user.activeMainAccountId ?? ''}
                onChange={e => handleAccountSwitch(e.target.value)}
                disabled={switching}
                className="rounded-full text-white text-[12px] font-semibold px-3 py-1.5 disabled:opacity-50 focus:outline-none cursor-pointer"
                style={{
                  background: 'rgba(255,255,255,.12)',
                  border: '1px solid rgba(255,255,255,.25)',
                  appearance: 'none',
                }}
              >
                {user.linkedMainAccounts.map(a => (
                  <option key={a.id} value={a.id} style={{ color: 'var(--ink)', background: 'white' }}>
                    {a.displayName}
                  </option>
                ))}
              </select>
              {viewingAccount && (
                <span style={{ fontSize: 11, opacity: 0.7, fontStyle: 'italic' }}>
                  on behalf of {viewingAccount.displayName.split(' ')[0]}
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,.85)' }}>
              {firstName} · {user.role === 'premium' ? 'Premium' : 'Main'}
            </span>
          )}

          {/* Avatar */}
          <div style={{
            width: 34, height: 34,
            borderRadius: '50%',
            background: 'var(--yellow)',
            color: 'var(--blue-900)',
            display: 'grid', placeItems: 'center',
            fontWeight: 700, fontSize: 13,
          }}>
            {initials}
          </div>

          <button
            onClick={handleSignOut}
            style={{ fontSize: 13, color: 'rgba(255,255,255,.70)' }}
            className="hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded text-white/80 hover:text-white hover:bg-white/10"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="md:hidden px-4 py-3 space-y-1"
          style={{ borderTop: '1px solid rgba(255,255,255,.12)', background: 'var(--blue-900)' }}
        >
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={pathname === href
                ? { background: 'rgba(255,255,255,.15)', color: 'white' }
                : { color: 'rgba(255,255,255,.75)' }
              }
            >
              {label}
            </Link>
          ))}

          {user.role === 'assistant' && user.linkedMainAccounts.length > 0 && (
            <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
              <p className="text-[10px] uppercase tracking-widest px-3 mb-1" style={{ opacity: 0.5 }}>Viewing account</p>
              {user.linkedMainAccounts.map(a => (
                <button
                  key={a.id}
                  onClick={() => { handleAccountSwitch(a.id); setMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={a.id === user.activeMainAccountId
                    ? { background: 'rgba(255,255,255,.15)', color: 'white' }
                    : { color: 'rgba(255,255,255,.65)' }
                  }
                >
                  {a.displayName}
                </button>
              ))}
            </div>
          )}

          <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
            <p className="text-[11px] px-3 mb-1" style={{ opacity: 0.5 }}>
              {user.role === 'assistant' ? `${user.displayName} (assistant)` : `${user.displayName} · ${user.role === 'premium' ? 'Premium' : 'Main'}`}
            </p>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ color: 'rgba(255,255,255,.65)' }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
