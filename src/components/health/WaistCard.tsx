'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { sendJson, errorOf } from './api'
import { BUTTON_PRIMARY, CARD, CARD_TITLE, INPUT, LABEL } from './ui'

export interface WaistRow { id: string; date: string; display: number; band: 'ok' | 'raised' | 'high' }

const BAND: Record<WaistRow['band'], { label: string; cls: string }> = {
  ok:     { label: 'below the risk bands', cls: 'text-green-700' },
  raised: { label: 'raised risk band', cls: 'text-amber-700' },
  high:   { label: 'high risk band', cls: 'text-red-700' },
}

/** Waist (specs/029 US9): fortnightly entry in cm or in, risk bands, trend. */
export default function WaistCard({ today, unit, rows, due, bandsText, changeText }: {
  today: string; unit: 'cm' | 'in'; rows: WaistRow[]; due: boolean; bandsText: string; changeText: string | null
}) {
  const toast = useToast()
  const router = useRouter()
  const [date, setDate] = useState(today)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    const v = Number(value.replace(',', '.'))
    if (!(v > 0)) { toast(`Enter your waist in ${unit}`, 'error'); return }
    setBusy(true)
    const r = await sendJson('/api/health/progress-data', { action: 'waist', date, value: v, unit })
    setBusy(false)
    if (!r.ok) { toast(errorOf(r, 'Could not save'), 'error'); return }
    toast('Waist saved', 'success')
    setValue('')
    router.refresh()
  }
  async function remove(id: string) {
    const r = await sendJson(`/api/health/progress-data?kind=waist&id=${id}`, undefined, 'DELETE')
    if (!r.ok) { toast(errorOf(r, 'Could not delete'), 'error'); return }
    router.refresh()
  }
  const latest = rows[rows.length - 1]
  return (
    <section className={CARD} aria-labelledby="waist-h">
      <h2 id="waist-h" className={CARD_TITLE}>Waist</h2>
      {latest ? (
        <p className="text-sm text-[var(--ink-2)]">
          <span className="text-2xl font-bold text-[var(--ink)]">{latest.display} {unit}</span>{' '}
          <span className={`font-semibold ${BAND[latest.band].cls}`}>({BAND[latest.band].label})</span>
          {changeText && <span className="ml-2">· {changeText} since the first measurement</span>}
        </p>
      ) : <p className="text-sm text-[var(--ink-2)]">No waist measurement yet.</p>}
      <p className="mt-1 text-xs text-[var(--ink-3)]">{bandsText} Measure at the navel, relaxed, same time of day.</p>
      {due && <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">Fortnightly measurement due.</p>}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label><span className={LABEL}>Date</span><input type="date" className={INPUT} value={date} max={today} onChange={e => setDate(e.target.value)} /></label>
        <label className="w-28"><span className={LABEL}>Waist ({unit})</span><input className={INPUT} inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /></label>
        <button type="button" className={BUTTON_PRIMARY} disabled={busy || value.trim() === ''} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {rows.length > 0 && (
        <ul className="mt-3 flex list-none flex-col gap-1 p-0 text-sm">
          {[...rows].reverse().slice(0, 8).map(r => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="text-[var(--ink-2)]">{r.date} · <strong className="text-[var(--ink)]">{r.display} {unit}</strong></span>
              <button type="button" className="text-xs font-semibold text-red-700 underline" onClick={() => remove(r.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
