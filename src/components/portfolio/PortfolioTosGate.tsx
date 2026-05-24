'use client'

import { useState } from 'react'
import { useToast } from '@/context/ToastContext'

export default function PortfolioTosGate() {
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  async function handleConfirm() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/portfolio/tos-accept', { method: 'POST' })
      if (!res.ok) {
        toast('Something went wrong. Please try again.', 'error')
        setSubmitting(false)
        return
      }
      window.location.href = '/portfolio'
    } catch {
      toast('Something went wrong. Please try again.', 'error')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--surface)' }}>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
        <h1
          className="mb-4"
          style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, color: 'var(--ink)' }}
        >
          Before you continue
        </h1>
        <p className="mb-6" style={{ color: 'var(--ink-muted)', fontSize: 15, lineHeight: 1.6 }}>
          Portfolio analysis is for informational purposes only. It does not constitute regulated
          financial advice. Past performance is not indicative of future results. Always consult a
          qualified financial advisor before making investment decisions.
        </p>
        <label className="flex items-start gap-3 cursor-pointer mb-8">
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded"
            style={{ accentColor: 'var(--blue-700)' }}
          />
          <span style={{ color: 'var(--ink)', fontSize: 14 }}>
            I understand and agree — this is not regulated financial advice
          </span>
        </label>
        <button
          onClick={handleConfirm}
          disabled={!checked || submitting}
          className="w-full py-3 rounded-xl font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: 'var(--blue-700)', fontSize: 15 }}
        >
          {submitting ? 'Confirming…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
