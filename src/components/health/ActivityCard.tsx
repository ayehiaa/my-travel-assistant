'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { sendJson, errorOf } from './api'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_TITLE, INPUT, LABEL } from './ui'

export interface ActivityCardProps {
  date: string
  title?: string
  typeOptions: string[]
  avoidTypes: string[]
  zone: { zone: string; bpmMin: number | null; bpmMax: number | null } | null
  weekly: { minutes: number; target: number | null; note?: string | null }
  sessions: Array<{ id: string; type: string; minutes: number; avgHr: number | null; intervals: boolean; hrMessage: string | null }>
  steps: number | null
  stepsTarget: string | null
  stepsStatus: 'below' | 'in_range' | 'above' | null
  intervals: { available: boolean; reason: string; prescription: string } | null
  migrationNeeded: boolean
}

/** Cardio + manual steps (specs/029 US7): log a session (avoid-list types confirm first), HR flag, weekly minutes. */
export default function ActivityCard(p: ActivityCardProps) {
  const toast = useToast()
  const router = useRouter()
  const [type, setType] = useState(p.typeOptions[0] ?? '')
  const [minutes, setMinutes] = useState('30')
  const [hr, setHr] = useState('')
  const [intervals, setIntervals] = useState(false)
  const [steps, setSteps] = useState(p.steps !== null ? String(p.steps) : '')
  const [busy, setBusy] = useState<string | null>(null)

  if (p.migrationNeeded) {
    return (
      <section className={CARD}>
        <h2 className={CARD_TITLE}>{p.title ?? 'Cardio & steps'}</h2>
        <p className="text-sm text-amber-900">Cardio and steps need a database update — the owner must apply <code>supabase/apply_health_p2.sql</code>.</p>
      </section>
    )
  }

  async function saveCardio(confirmAvoid = false) {
    const m = Number(minutes)
    if (!Number.isInteger(m) || m < 1 || m > 300) { toast('Minutes must be 1–300', 'error'); return }
    const avgHr = hr.trim() === '' ? null : Number(hr)
    if (avgHr !== null && !(Number.isInteger(avgHr) && avgHr >= 40 && avgHr <= 220)) { toast('Average heart rate must be 40–220 bpm', 'error'); return }
    if (!type.trim()) { toast('Choose a type', 'error'); return }
    if (!confirmAvoid && p.avoidTypes.includes(type)) {
      if (!window.confirm(`${type} is on your programme's avoid list. Save it anyway?`)) return
      confirmAvoid = true
    }
    setBusy('cardio')
    const r = await sendJson('/api/health/activity', { kind: 'cardio', date: p.date, type, minutes: m, avgHr, intervals, confirmAvoid })
    setBusy(null)
    if (r.status === 409 && (r.data as { needsConfirmation?: boolean }).needsConfirmation) {
      if (window.confirm(errorOf(r))) await saveCardio(true)
      return
    }
    if (!r.ok) { toast(errorOf(r, 'Could not save the session'), 'error'); return }
    toast('Cardio logged', 'success')
    setHr(''); setIntervals(false)
    router.refresh()
  }

  async function saveSteps() {
    const s = Number(steps.replace(/[,\s]/g, ''))
    if (!Number.isInteger(s) || s < 0 || s > 100000) { toast('Steps must be a whole number up to 100,000', 'error'); return }
    setBusy('steps')
    const r = await sendJson('/api/health/activity', { kind: 'steps', date: p.date, steps: s })
    setBusy(null)
    if (!r.ok) { toast(errorOf(r, 'Could not save steps'), 'error'); return }
    toast('Steps saved', 'success')
    router.refresh()
  }

  async function remove(id: string) {
    setBusy(id)
    const r = await sendJson(`/api/health/activity?id=${id}`, undefined, 'DELETE')
    setBusy(null)
    if (!r.ok) { toast(errorOf(r, 'Could not delete'), 'error'); return }
    router.refresh()
  }

  const pct = p.weekly.target ? Math.min(100, Math.round((p.weekly.minutes / p.weekly.target) * 100)) : null
  const allTypes = [...p.typeOptions, ...p.avoidTypes.map(a => a)]

  return (
    <section className={CARD} aria-labelledby={`act-${p.date}`}>
      <h2 id={`act-${p.date}`} className={CARD_TITLE}>{p.title ?? 'Cardio & steps'}</h2>
      <p className="text-sm text-[var(--ink-2)]">
        This week: <strong className="text-[var(--ink)]">{p.weekly.minutes}</strong>{p.weekly.target !== null && <> / {p.weekly.target} min</>}
        {pct !== null && pct >= 100 && <span className="ml-1 text-xs font-bold text-green-700">· target met</span>}
        {p.weekly.note && <span className="block text-xs text-[var(--ink-3)]">{p.weekly.note}</span>}
      </p>
      {pct !== null && (
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--paper-2)]" role="presentation">
          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-600' : 'bg-[var(--blue-700)]'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {p.zone && <p className="mt-2 text-xs text-[var(--ink-3)]">{p.zone.zone}{p.zone.bpmMin !== null && p.zone.bpmMax !== null && <>: {p.zone.bpmMin}–{p.zone.bpmMax} bpm — you can talk in full sentences.</>}</p>}

      {p.sessions.length > 0 && (
        <ul className="mt-3 flex list-none flex-col gap-1 p-0">
          {p.sessions.map(s => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-[var(--ink)]">
                {s.type} · {s.minutes} min{s.avgHr !== null && <> · {s.avgHr} bpm</>}{s.intervals && ' · intervals'}
                {s.hrMessage && <span className="block text-xs text-amber-800">{s.hrMessage}</span>}
              </span>
              <button type="button" className="text-xs font-semibold text-red-700 underline" disabled={busy === s.id} onClick={() => remove(s.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="col-span-2">
          <span className={LABEL}>Type</span>
          <select className={INPUT} value={type} onChange={e => setType(e.target.value)}>
            {p.typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            {p.avoidTypes.length > 0 && (
              <optgroup label="On your avoid list">
                {p.avoidTypes.map(t => <option key={t} value={t}>{t} (avoid)</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <label><span className={LABEL}>Minutes</span><input className={INPUT} inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
        <label><span className={LABEL}>Avg HR (opt.)</span><input className={INPUT} inputMode="numeric" value={hr} onChange={e => setHr(e.target.value)} placeholder="bpm" /></label>
      </div>
      {p.avoidTypes.includes(type) && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{type} is on your programme&apos;s avoid list — choose an allowed type if you can.</p>}
      {p.intervals && (
        <div className="mt-2 text-sm">
          {p.intervals.available ? (
            <label className="flex items-center gap-2 text-[var(--ink)]">
              <input type="checkbox" checked={intervals} onChange={e => setIntervals(e.target.checked)} /> Intervals: {p.intervals.prescription}
            </label>
          ) : (
            <p className="text-xs text-[var(--ink-3)]">Intervals locked — {p.intervals.reason}</p>
          )}
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <button type="button" className={BUTTON_PRIMARY} disabled={busy !== null || allTypes.length === 0} onClick={() => saveCardio()}>{busy === 'cardio' ? 'Saving…' : 'Log cardio'}</button>
      </div>

      <div className="mt-4 border-t border-[var(--rule-soft)] pt-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[140px] flex-1">
            <span className={LABEL}>Steps{p.stepsTarget && <> (target {p.stepsTarget})</>}</span>
            <input className={INPUT} inputMode="numeric" value={steps} onChange={e => setSteps(e.target.value)} placeholder="e.g. 8500" />
          </label>
          <button type="button" className={BUTTON_SECONDARY} disabled={busy !== null || steps.trim() === ''} onClick={saveSteps}>{busy === 'steps' ? 'Saving…' : 'Save steps'}</button>
        </div>
        {p.stepsStatus && (
          <p className={`mt-1 text-xs font-semibold ${p.stepsStatus === 'below' ? 'text-amber-800' : 'text-green-700'}`}>
            {p.stepsStatus === 'below' ? 'Below the daily range' : p.stepsStatus === 'above' ? 'Above the range — great' : 'In range'}
          </p>
        )}
      </div>
    </section>
  )
}
