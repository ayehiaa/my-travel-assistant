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
    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters.')
      return false
    }
    if (password !== confirm) {
      setValidationError('Passwords do not match.')
      return false
    }
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

    if (error) {
      setServerError(error.message)
      setLoading(false)
      return
    }

    await supabase.auth.signOut()
    window.location.href = '/login?message=password_updated'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Travel Assistant</h1>
          <p className="mt-1 text-sm text-gray-500">Choose a new password</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          {stage === 'verifying' && (
            <p className="text-sm text-gray-500 text-center py-4">Verifying your reset link…</p>
          )}

          {stage === 'invalid' && (
            <div className="space-y-4">
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-3">
                This reset link is invalid or has expired. Reset links are valid for 1 hour.
              </div>
              <Link
                href="/forgot-password"
                className="block w-full text-center py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Request a new link
              </Link>
            </div>
          )}

          {stage === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={e => { setPassword(e.target.value); setValidationError('') }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Min. 8 characters"
                />
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setValidationError('') }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Repeat your new password"
                />
              </div>

              {validationError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {validationError}
                </p>
              )}

              {serverError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>

        {stage !== 'invalid' && (
          <p className="text-center text-sm text-gray-500 mt-4">
            <Link href="/login" className="text-blue-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
