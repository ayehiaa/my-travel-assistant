'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { kgTo, toKg } from '@/lib/health/units'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, INPUT, LABEL } from './ui'

interface Props {
  date: string
  supplements: Array<{ key: string; name: string; dose: string }>
  existing: { weightKg: number | null; bedTime: string | null; wakeTime: string | null; supplementsTaken: string[] } | null
  /** Bed/wake defaults from the typical times of recent nights. */
  typicalBed: string | null
  typicalWake: string | null
  /** Display / entry unit (stored in kg). */
  weightUnit?: 'kg' | 'lb'
  /** Open in edit mode (e.g. from the + menu's "Weight"). */
  startEditing?: boolean
}

/** Morning check-in (specs/029 US2; compact row in specs/032): weight + sleep window + supplements → Save. */
export default function CheckinCard({ date, supplements, existing, typicalBed, typicalWake, weightUnit = 'kg', startEditing = false }: Props) {
  const toUnit = (kg: number) => (weightUnit === 'lb' ? kgTo(kg, 'lb') : kg)
  const toast = useToast()
  const router = useRouter()
  const [editing, setEditing] = useState(existing === null || startEditing)
  const [weight, setWeight] = useState(existing?.weightKg != null ? String(toUnit(existing.weightKg)) : '')
  const [bed, setBed] = useState(existing?.bedTime ?? typicalBed ?? '23:00')
  const [wake, setWake] = useState(existing?.wakeTime ?? typicalWake ?? '07:00')
  const [taken, setTaken] = useState<string[]>(existing?.supplementsTaken ?? [])
  const [saving, setSaving] = useState(false)

  async function save() {
    const entered = weight.trim() === '' ? null : Number(weight.replace(',', '.'))
    const w = entered === null ? null : toKg(entered, weightUnit)
    if (w !== null && !(w >= 30 && w <= 350)) { toast(`Enter your weight in ${weightUnit} (e.g. ${weightUnit === 'lb' ? '177.4' : '80.4'})`, 'error'); return }
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
      <div id="checkin" className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-1.5">
        <p className="min-w-0 truncate text-sm text-green-900">
          <span aria-hidden="true">✓ </span><span className="font-semibold">Check-in</span>
          {existing.weightKg != null && <> · {toUnit(existing.weightKg)} {weightUnit}</>}
          {existing.bedTime && existing.wakeTime && <> · {existing.bedTime}–{existing.wakeTime}</>}
          {existing.supplementsTaken.length > 0 && <> · {supplements.filter(s => existing.supplementsTaken.includes(s.key)).map(s => s.name.split(' ')[0]).join(', ')} ✓</>}
        </p>
        <button type="button" className="min-h-11 shrink-0 px-2 text-sm font-semibold text-[var(--blue-700)]" onClick={() => setEditing(true)}>Edit</button>
      </div>
    )
  }

  return (
    <div id="checkin" className={`${CARD} border-[var(--blue-700)]`}>
      <h2 className="mb-2 text-sm font-bold text-[var(--ink)]">Morning check-in</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-24">
          <span className={LABEL}>{weightUnit}</span>
          <input className={INPUT} inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder={weightUnit === 'lb' ? '177.4' : '80.4'} aria-label={`Weight in ${weightUnit}`} autoFocus={existing === null && startEditing} />
        </label>
        <label className="w-[6.5rem]"><span className={LABEL}>Slept</span><input type="time" className={INPUT} value={bed} onChange={e => setBed(e.target.value)} aria-label="Bed time" /></label>
        <label className="w-[6.5rem]"><span className={LABEL}>Woke</span><input type="time" className={INPUT} value={wake} onChange={e => setWake(e.target.value)} aria-label="Wake time" /></label>
        {supplements.map(s => {
          const on = taken.includes(s.key)
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              title={`${s.name} (${s.dose})`}
              onClick={() => setTaken(prev => (on ? prev.filter(k => k !== s.key) : [...prev, s.key]))}
              className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${on ? 'border-green-700 bg-green-50 text-green-800' : 'border-[var(--rule)] text-[var(--ink-2)]'}`}
            >
              {on ? '✓ ' : ''}{s.name.split(' ')[0]}
            </button>
          )
        })}
        <div className="ml-auto flex gap-2">
          {existing && <button type="button" className={BUTTON_SECONDARY} onClick={() => setEditing(false)}>Cancel</button>}
          <button type="button" className={BUTTON_PRIMARY} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
