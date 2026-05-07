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
    { href: '/', label: 'Dashboard' },
    { href: '/search', label: 'Search Flights' },
    { href: '/timeline', label: 'Timeline' },
    { href: '/audit', label: 'Audit Log' },
    ...(user.role === 'main' ? [{ href: '/settings', label: 'Settings' }] : []),
  ]

  const activeAccountName = user.role === 'assistant'
    ? (user.linkedMainAccounts.find(a => a.id === user.activeMainAccountId)?.displayName ?? 'Select account')
    : user.displayName

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-1">
            <Link href="/" className="font-semibold text-gray-900 mr-4">
              Travel Assistant
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {links.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    pathname === href
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user.role === 'assistant' && user.linkedMainAccounts.length > 0 ? (
              <div className="hidden md:flex items-center gap-2">
                <span className="text-xs text-gray-400">Viewing:</span>
                <select
                  value={user.activeMainAccountId}
                  onChange={e => handleAccountSwitch(e.target.value)}
                  disabled={switching}
                  className="text-sm text-gray-700 border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {user.linkedMainAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.displayName}</option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="hidden md:block text-sm text-gray-500">
                {user.displayName}
              </span>
            )}
            <button
              onClick={handleSignOut}
              className="hidden md:block text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded border border-gray-200 hover:border-gray-300 transition-colors"
            >
              Sign out
            </button>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded text-gray-600 hover:text-gray-900 hover:bg-gray-50"
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
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 px-4 py-3 space-y-1 bg-white">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2 rounded text-sm font-medium transition-colors ${
                pathname === href
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {label}
            </Link>
          ))}
          {user.role === 'assistant' && user.linkedMainAccounts.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-400 px-3 mb-1">Viewing account:</p>
              {user.linkedMainAccounts.map(a => (
                <button
                  key={a.id}
                  onClick={() => { handleAccountSwitch(a.id); setMenuOpen(false) }}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    a.id === user.activeMainAccountId
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {a.displayName}
                </button>
              ))}
            </div>
          )}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 px-3 mb-1">
              {user.role === 'assistant' ? `${user.displayName} (assistant)` : activeAccountName}
            </p>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 rounded text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
