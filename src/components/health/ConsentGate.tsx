'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { BUTTON_PRIMARY, CARD } from './ui'

/** Explicit consent before any health data is stored (specs/029 §8 — UK GDPR special-category data). */
export default function ConsentGate({ consentVersion }: { consentVersion: string }) {
  const toast = useToast()
  const router = useRouter()
  const [agree, setAgree] = useState(false)
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      const res = await fetch('/api/health/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agree: true, consentVersion }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not save your consent', 'error'); return }
      router.refresh()
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`${CARD} mx-auto max-w-xl`}>
      <h2 className="mb-2 text-lg font-bold text-[var(--ink)]">Before you start</h2>
      <div className="space-y-2 text-sm text-[var(--ink-2)]">
        <p>Health stores information about your body and habits — weight, sleep, food and supplements. This is
          special-category personal data, so we need your explicit consent.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your health data is private to you. Assistants linked to your account and the app admin cannot see it
            (the admin only sees whether Health is on and the date you last logged).</li>
          <li>Food photos are stored in a private bucket with location data removed. AI food estimates are sent to
            Anthropic using your own API key.</li>
          <li>This is not medical advice. Follow the plan you and your clinicians agreed.</li>
        </ul>
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-[var(--ink)]">
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>I consent to Sojourn storing and processing my health data for this feature.</span>
      </label>
      <div className="mt-4 flex justify-end">
        <button type="button" className={BUTTON_PRIMARY} disabled={!agree || saving} onClick={submit}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
