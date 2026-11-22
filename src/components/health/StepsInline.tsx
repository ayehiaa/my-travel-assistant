'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { sendJson, errorOf } from './api'

/** Steps input + Save inside a plan row (same API as the cardio card). */
export default function StepsInline({ date, steps }: { date: string; steps: number | null }) {
  const toast = useToast()
  const router = useRouter()
  const [v, setV] = useState(steps !== null ? String(steps) : '')
  const [busy, setBusy] = useState(false)
  async function save() {
    const s = Number(v.replace(/[,\s]/g, ''))
    if (!Number.isInteger(s) || s < 0 || s > 100000) { toast('Steps must be a whole number up to 100,000', 'error'); return }
    setBusy(true)
    const r = await sendJson('/api/health/activity', { kind: 'steps', date, steps: s })
    setBusy(false)
    if (!r.ok) { toast(errorOf(r, 'Could not save steps'), 'error'); return }
    toast('Steps saved', 'success')
    router.refresh()
  }
  return (
    <span className="flex items-center gap-1.5">
      <input aria-label="Steps today" inputMode="numeric" value={v} onChange={e => setV(e.target.value)} placeholder="0"
        className="min-h-11 w-24 rounded-lg border border-[var(--rule)] bg-white px-2 text-right text-base text-[var(--ink)] md:text-sm" />
      <button type="button" disabled={busy || v.trim() === '' || v === String(steps ?? '')} onClick={save}
        className="min-h-11 rounded-full border border-[var(--rule)] px-3 text-xs font-bold text-[var(--ink)] disabled:opacity-40">
        {busy ? '…' : 'Save'}
      </button>
    </span>
  )
}
