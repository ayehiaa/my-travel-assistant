'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from './ui'

async function post(url: string, body: unknown, method = 'POST'): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Something went wrong' }
  } catch {
    return { ok: false, error: 'Network error — try again' }
  }
}

/** "My physiotherapist has cleared me" after a red flag (re-enables joint-watched exercises). */
export function JointClearanceButton({ checkId }: { checkId: string }) {
  const toast = useToast()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  async function clear() {
    setBusy(true)
    const r = await post('/api/health/joint-checks', { action: 'clearance', checkId })
    setBusy(false)
    if (!r.ok) { toast(r.error ?? 'Could not save', 'error'); return }
    toast('Clearance recorded', 'success')
    router.refresh()
  }
  if (!confirming) return <button type="button" className={BUTTON_SECONDARY} onClick={() => setConfirming(true)}>My physiotherapist has cleared me</button>
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-[var(--ink)]">Only confirm after a physiotherapist has seen you and cleared leg work.</span>
      <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={clear}>Confirm clearance</button>
      <button type="button" className={BUTTON_SECONDARY} onClick={() => setConfirming(false)}>Cancel</button>
    </div>
  )
}

/** "Approved by my physio" tick for unlocks that need professional approval. */
export function ApprovalToggle({ unlockKey, approved, movement }: { unlockKey: string; approved: boolean; movement: string }) {
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function toggle() {
    setBusy(true)
    const r = await post('/api/health/approvals', { unlockKey, approved: !approved })
    setBusy(false)
    if (!r.ok) { toast(r.error ?? 'Could not save', 'error'); return }
    toast(approved ? 'Approval withdrawn' : 'Approval recorded', 'success')
    router.refresh()
  }
  return (
    <label className="mt-2 flex items-center gap-2 text-sm text-[var(--ink)]">
      <input type="checkbox" className="h-4 w-4" checked={approved} disabled={busy} onChange={toggle} />
      Approved by my physio for {movement.toLowerCase()}
    </label>
  )
}

export function DeleteWorkoutButton({ id }: { id: string }) {
  const toast = useToast()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  async function del() {
    setBusy(true)
    const r = await post(`/api/health/workouts/${id}`, undefined, 'DELETE')
    setBusy(false)
    if (!r.ok) { toast(r.error ?? 'Could not delete', 'error'); return }
    toast('Session deleted', 'success')
    router.refresh()
  }
  if (!confirming) return <button type="button" className="text-xs font-semibold text-red-700 underline" onClick={() => setConfirming(true)}>Delete</button>
  return (
    <span className="flex items-center gap-2">
      <button type="button" className="text-xs font-bold text-red-700 underline" disabled={busy} onClick={del}>Confirm delete</button>
      <button type="button" className="text-xs underline" onClick={() => setConfirming(false)}>Cancel</button>
    </span>
  )
}
