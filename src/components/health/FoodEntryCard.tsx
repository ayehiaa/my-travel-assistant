'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { sumNutrients, uncertaintyBand, type FoodItem } from '@/lib/health/nutrition'
import FoodItemsEditor, { fromEditable, toEditable, type EditableItem } from './FoodItemsEditor'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, INPUT, LABEL, fmtNum } from './ui'

interface Props {
  entry: { id: string; time: string; slot: string | null; text: string | null; restaurant: boolean; items: FoodItem[] }
  photoUrls: string[]
  slots: Array<{ key: string; name: string }>
  componentLabels: Record<string, { name: string; unit: string }>
}

/** One logged meal on the Log tab: view, edit items / slot / time, delete (photos go with it). */
export default function FoodEntryCard({ entry, photoUrls, slots, componentLabels }: Props) {
  const toast = useToast()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState<EditableItem[]>(() => toEditable(entry.items).map(i => ({ ...i, remember: false })))
  const [slot, setSlot] = useState(entry.slot ?? '')
  const [time, setTime] = useState(entry.time)
  const [busy, setBusy] = useState(false)

  const totals = sumNutrients(entry.items)
  const band = uncertaintyBand(totals.kcal)
  const slotName = slots.find(s => s.key === entry.slot)?.name ?? 'Other'

  async function save() {
    if (items.length === 0 || items.some(i => !i.name.trim())) { toast('Every item needs a name', 'error'); return }
    setBusy(true)
    try {
      const { items: clean, remember } = fromEditable(items)
      const res = await fetch(`/api/health/food/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: clean, remember, slot: slot || null, time }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not save', 'error'); return }
      toast('Saved', 'success')
      setEditing(false)
      router.refresh()
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('Delete this entry and its photos?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/health/food/${entry.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not delete', 'error'); return }
      toast('Deleted', 'success')
      router.refresh()
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={CARD}>
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-[var(--ink)]">
          <span className="mr-2 font-mono text-sm text-[var(--ink-3)]">{entry.time}</span>{slotName}
          {entry.restaurant && <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-800">eating out</span>}
        </h3>
        <span className="text-sm text-[var(--ink-2)]"><strong className="text-[var(--ink)]">{totals.kcal} kcal</strong> ({band.low}–{band.high})</span>
      </header>
      {entry.text && <p className="mb-2 text-sm italic text-[var(--ink-3)]">“{entry.text}”</p>}
      {photoUrls.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {photoUrls.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
            <img key={i} src={src} alt={`Meal photo ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" />
          ))}
        </div>
      )}

      {editing ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:max-w-sm">
            <label><span className={LABEL}>Time</span><input type="time" className={INPUT} value={time} onChange={e => setTime(e.target.value)} /></label>
            <label><span className={LABEL}>Meal</span>
              <select className={INPUT} value={slot} onChange={e => setSlot(e.target.value)}>
                <option value="">Other</option>
                {slots.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <FoodItemsEditor items={items} onChange={setItems} componentLabels={componentLabels} />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {entry.items.map((i, idx) => (
              <li key={idx} className="flex flex-wrap justify-between gap-2">
                <span className="text-[var(--ink)]">{i.name} <span className="text-xs text-[var(--ink-3)]">{i.quantityG} g</span>
                  {i.confidence === 'low' && <span className="ml-1 text-xs font-bold text-amber-700">check portion</span>}
                </span>
                <span className="text-xs text-[var(--ink-2)]">{Math.round(i.kcal)} kcal · P {fmtNum(i.proteinG)} · sat {fmtNum(i.satFatG)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={remove}>Delete</button>
            <button type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={() => setEditing(true)}>Edit</button>
          </div>
        </>
      )}
    </article>
  )
}
