'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_TITLE, INPUT, LABEL } from './ui'

interface Props {
  date: string
  supplements: Array<{ key: string; name: string; dose: string }>
  existing: { weightKg: number | null; bedTime: string | null; wakeTime: string | null; supplementsTaken: string[] } | null
  /** Bed/wake defaults from the typical times of recent nights. */
  typicalBed: string | null
  typicalWake: string | null
}

/** Morning check-in (specs/029 US2): one number + a few taps. First card on Today until done. */
export default function CheckinCard({ date, supplements, existing, typicalBed, typicalWake }: Props) {
  const toast = useToast()
  const router = useRouter()
  const [editing, setEditing] = useState(existing === null)
  const [weight, setWeight] = useState(existing?.weightKg != null ? String(existing.weightKg) : '')
  const [bed, setBed] = useState(existing?.bedTime ?? typicalBed ?? '23:00')
  const [wake, setWake] = useState(existing?.wakeTime ?? typicalWake ?? '07:00')
  const [taken, setTaken] = useState<string[]>(existing?.supplementsTaken ?? [])
  const [saving, setSaving] = useState(false)

  async function save() {
    const w = weight.trim() === '' ? null : Number(weight.replace(',', '.'))
    if (w !== null && !(w >= 30 && w <= 350)) { toast('Enter your weight in kg (e.g. 80.4)', 'error'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/health/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, weightKg: w, bedTime: bed || null, wakeTime: wake || null, supplementsTaken: taken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not save the check-in', 'error'); return }
      toast('Check-in saved', 'success')
      setEditing(false)
      router.refresh()
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!editing && existing) {
    return (
      <div className={`${CARD} flex flex-wrap items-center justify-between gap-2`}>
        <div className="text-sm text-[var(--ink-2)]">
          <span className="font-semibold text-[var(--ink)]">Morning check-in done</span>
          {existing.weightKg != null && <> · {existing.weightKg} kg</>}
          {existing.bedTime && existing.wakeTime && <> · slept {existing.bedTime}–{existing.wakeTime}</>}
          {existing.supplementsTaken.length > 0 && <> · {existing.supplementsTaken.length} supplement{existing.supplementsTaken.length > 1 ? 's' : ''}</>}
        </div>
        <button type="button" className={BUTTON_SECONDARY} onClick={() => setEditing(true)}>Edit</button>
      </div>
    )
  }

  return (
    <div className={`${CARD} border-[var(--blue-700)]`}>
      <h2 className={CARD_TITLE}>Morning check-in</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="col-span-2 sm:col-span-1">
          <span className={LABEL}>Weight (kg)</span>
          <input className={INPUT} inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder="80.4" autoFocus={existing === null} />
        </label>
        <label><span className={LABEL}>Bed</span><input type="time" className={INPUT} value={bed} onChange={e => setBed(e.target.value)} /></label>
        <label><span className={LABEL}>Woke</span><input type="time" className={INPUT} value={wake} onChange={e => setWake(e.target.value)} /></label>
      </div>
      {supplements.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {supplements.map(s => {
            const on = taken.includes(s.key)
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => setTaken(prev => (on ? prev.filter(k => k !== s.key) : [...prev, s.key]))}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-green-700 bg-green-50 text-green-800' : 'border-[var(--rule)] text-[var(--ink-2)]'}`}
              >
                {on ? '✓ ' : ''}{s.name} <span className="font-normal">({s.dose})</span>
              </button>
            )
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-[var(--ink-3)]">Weigh yourself under the same conditions each morning (after the bathroom, before food).</p>
      <div className="mt-3 flex justify-end gap-2">
        {existing && <button type="button" className={BUTTON_SECONDARY} onClick={() => setEditing(false)}>Cancel</button>}
        <button type="button" className={BUTTON_PRIMARY} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save check-in'}</button>
      </div>
    </div>
  )
}
