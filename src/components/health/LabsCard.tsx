'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { sendJson, errorOf } from './api'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_TITLE, INPUT, LABEL } from './ui'

export interface LabRow { id: string; date: string; total: number | null; ldl: number | null; hdl: number | null; tg: number | null; nonHdl: number | null }

/** Lipid panels (specs/029 US9): entry in mmol/L or mg/dL, non-HDL computed, history, escalation note. */
export default function LabsCard({ today, unit, rows, expectations, escalations }: {
  today: string
  unit: 'mmol' | 'mgdl'
  rows: LabRow[]
  expectations: string[]
  escalations: string[]
}) {
  const toast = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [entryUnit, setEntryUnit] = useState<'mmol' | 'mgdl'>(unit)
  const [f, setF] = useState({ date: today, total: '', ldl: '', hdl: '', tg: '' })
  const [busy, setBusy] = useState(false)
  const label = (u: 'mmol' | 'mgdl') => (u === 'mmol' ? 'mmol/L' : 'mg/dL')
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

  async function save() {
    const body = { action: 'lab', date: f.date, unit: entryUnit, total: num(f.total), ldl: num(f.ldl), hdl: num(f.hdl), tg: num(f.tg) }
    if ([body.total, body.ldl, body.hdl, body.tg].some(v => v !== null && !(v > 0))) { toast('Values must be positive numbers', 'error'); return }
    setBusy(true)
    const r = await sendJson('/api/health/progress-data', body)
    setBusy(false)
    if (!r.ok) { toast(errorOf(r, 'Could not save'), 'error'); return }
    toast('Lipid panel saved', 'success')
    setF({ date: today, total: '', ldl: '', hdl: '', tg: '' })
    setOpen(false)
    router.refresh()
  }
  async function remove(id: string) {
    const r = await sendJson(`/api/health/progress-data?kind=lab&id=${id}`, undefined, 'DELETE')
    if (!r.ok) { toast(errorOf(r, 'Could not delete'), 'error'); return }
    router.refresh()
  }
  const v = (x: number | null) => (x === null ? '—' : String(x))

  return (
    <section className={CARD} aria-labelledby="labs-h">
      <h2 id="labs-h" className={CARD_TITLE}>Lipid panel ({label(unit)})</h2>
      {escalations.map(e => <p key={e} className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">{e}</p>)}
      {rows.length === 0 ? <p className="text-sm text-[var(--ink-2)]">No results yet — the programme asks for a panel in week 1 and week 12.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead><tr className="text-left text-xs uppercase text-[var(--ink-3)]"><th className="py-1">Date</th><th>Total</th><th>LDL</th><th>HDL</th><th>TG</th><th>Non-HDL</th><th /></tr></thead>
            <tbody>
              {[...rows].reverse().map(r => (
                <tr key={r.id} className="border-t border-[var(--rule-soft)]">
                  <td className="py-1">{r.date}</td><td>{v(r.total)}</td><td className="font-semibold">{v(r.ldl)}</td><td>{v(r.hdl)}</td><td>{v(r.tg)}</td><td>{v(r.nonHdl)}</td>
                  <td className="text-right"><button type="button" className="text-xs font-semibold text-red-700 underline" onClick={() => remove(r.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {expectations.length > 0 && <p className="mt-2 text-xs text-[var(--ink-3)]">Expected: {expectations.join(' ')}</p>}
      {!open ? (
        <button type="button" className={`${BUTTON_SECONDARY} mt-3`} onClick={() => setOpen(true)}>Add a result</button>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label><span className={LABEL}>Date</span><input type="date" className={INPUT} max={today} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
          <label><span className={LABEL}>Unit</span>
            <select className={INPUT} value={entryUnit} onChange={e => setEntryUnit(e.target.value as 'mmol' | 'mgdl')}>
              <option value="mmol">mmol/L</option><option value="mgdl">mg/dL</option>
            </select>
          </label>
          {(['total', 'ldl', 'hdl', 'tg'] as const).map(k => (
            <label key={k}><span className={LABEL}>{k === 'tg' ? 'Triglycerides' : k === 'total' ? 'Total' : k.toUpperCase()}</span>
              <input className={INPUT} inputMode="decimal" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />
            </label>
          ))}
          <div className="col-span-2 flex justify-end gap-2 sm:col-span-3">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save result'}</button>
          </div>
        </div>
      )}
    </section>
  )
}
