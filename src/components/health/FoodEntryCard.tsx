'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { sumNutrients, uncertaintyBand, type FoodItem } from '@/lib/health/nutrition'
import { itemSourceLabel } from '@/lib/health/itemMeta'
import FoodItemsEditor, { fromEditable, toEditable, type EditableItem } from './FoodItemsEditor'
import AssumptionChips from './AssumptionChips'
import NoAddedFatToggle from './NoAddedFatToggle'
import { preparePhoto } from './resizePhoto'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, INPUT, LABEL, fmtNum } from './ui'
import { imageFilesFrom, hasTextPayload } from '@/lib/health/pastedImages'

const MAX_PHOTOS = 4

export interface FoodEntryView {
  id: string
  time: string
  slot: string | null
  text: string | null
  restaurant: boolean
  noAddedFat?: boolean
  items: FoodItem[]
  photos: Array<{ path: string; url: string }>
}

interface Props {
  entry: FoodEntryView
  slots: Array<{ key: string; name: string }>
  componentLabels: Record<string, { name: string; unit: string }>
  /** Inside a sheet: no card frame. */
  bare?: boolean
}

/**
 * One logged meal (Log tab and Today): view, edit items / slot / time, and (P3.1) edit the description, photos,
 * eating-out flag and the no-added-fat toggle, then Re-calculate with the full estimation pipeline. New items are
 * shown for review; Save replaces the entry's items (same entry, updated_at bumped), Cancel keeps the old version.
 */
export default function FoodEntryCard({ entry, slots, componentLabels, bare = false }: Props) {
  const toast = useToast()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const initialItems = () => toEditable(entry.items).map(i => ({ ...i, remember: false }))
  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState<EditableItem[]>(initialItems)
  const [slot, setSlot] = useState(entry.slot ?? '')
  const [time, setTime] = useState(entry.time)
  const [text, setText] = useState(entry.text ?? '')
  const [restaurant, setRestaurant] = useState(entry.restaurant)
  const [noAddedFat, setNoAddedFat] = useState(entry.noAddedFat === true)
  /** Stored photos still attached (path + signed URL) and new local files not uploaded yet. */
  const [kept, setKept] = useState(entry.photos)
  const [added, setAdded] = useState<Array<{ file: File; url: string }>>([])
  /** Paths returned by a re-calculation (kept + newly uploaded) — what Save will store. */
  const [recalcPaths, setRecalcPaths] = useState<string[] | null>(null)
  const [recalculated, setRecalculated] = useState(false)
  const [busy, setBusy] = useState<'save' | 'recalc' | 'delete' | null>(null)

  const totals = sumNutrients(entry.items)
  const band = uncertaintyBand(totals.kcal)
  const slotName = slots.find(s => s.key === entry.slot)?.name ?? 'Other'
  const inputsChanged = text.trim() !== (entry.text ?? '').trim() || restaurant !== entry.restaurant
    || noAddedFat !== (entry.noAddedFat === true) || added.length > 0 || kept.length !== entry.photos.length

  function startEdit() {
    setItems(initialItems()); setSlot(entry.slot ?? ''); setTime(entry.time); setText(entry.text ?? '')
    setRestaurant(entry.restaurant); setNoAddedFat(entry.noAddedFat === true); setKept(entry.photos)
    setAdded([]); setRecalcPaths(null); setRecalculated(false); setEditing(true)
  }

  function cancel() {
    added.forEach(a => URL.revokeObjectURL(a.url))
    setAdded([]); setRecalcPaths(null); setRecalculated(false); setEditing(false)
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return
    const room = MAX_PHOTOS - kept.length - added.length
    if (list.length > room) toast(`Up to ${MAX_PHOTOS} photos`, 'info')
    setAdded([...added, ...Array.from(list).slice(0, Math.max(0, room)).map(file => ({ file, url: URL.createObjectURL(file) }))])
    setRecalcPaths(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  /** Paste (⌘/Ctrl+V, long-press → Paste) or drop a screenshot / photo: images are added, text still pastes. */
  function onPasteImages(e: React.ClipboardEvent) {
    const files = imageFilesFrom(e.clipboardData)
    if (files.length === 0) return
    if (!hasTextPayload(e.clipboardData)) e.preventDefault()
    addFiles(files)
  }

  function onDropImages(e: React.DragEvent) {
    const files = imageFilesFrom(e.dataTransfer)
    if (files.length === 0) return
    e.preventDefault()
    addFiles(files)
  }

  async function recalculate() {
    if (!text.trim() && kept.length === 0 && added.length === 0) { toast('Describe the food or add a photo', 'error'); return }
    setBusy('recalc')
    try {
      const form = new FormData()
      if (text.trim()) form.set('text', text.trim())
      if (slot) form.set('slot', slot)
      if (restaurant) form.set('restaurant', 'true')
      if (noAddedFat) form.set('noAddedFat', 'true')
      form.set('keepPhotos', JSON.stringify(kept.map(k => k.path)))
      for (const a of added) form.append('photos', await preparePhoto(a.file), 'photo.jpg')
      const res = await fetch(`/api/health/food/${entry.id}`, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not re-calculate', 'error'); return }
      // New uploads are now stored: further re-calculations reuse them instead of uploading again.
      const paths: string[] = Array.isArray(data.photoPaths) ? data.photoPaths : kept.map(k => k.path)
      const newOnes = paths.filter(p => !kept.some(k => k.path === p))
      setKept([...kept, ...newOnes.map((path, i) => ({ path, url: added[i]?.url ?? '' }))])
      setAdded([])
      setRecalcPaths(paths)
      setItems(toEditable(data.items as FoodItem[]))
      setRecalculated(true)
      toast('Re-calculated — review the items, then Save', 'info')
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (items.length === 0 || items.some(i => !i.name.trim())) { toast('Every item needs a name', 'error'); return }
    if (added.length > 0) { toast('Re-calculate first to include the new photos', 'error'); return }
    setBusy('save')
    try {
      const { items: clean, remember } = fromEditable(items)
      const res = await fetch(`/api/health/food/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: clean, remember, slot: slot || null, time,
          text: text.trim() || null, restaurant, noAddedFat,
          photoPaths: recalcPaths ?? kept.map(k => k.path),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not save', 'error'); return }
      toast('Saved', 'success')
      setEditing(false)
      router.refresh()
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!window.confirm('Delete this entry and its photos?')) return
    setBusy('delete')
    try {
      const res = await fetch(`/api/health/food/${entry.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not delete', 'error'); return }
      toast('Deleted', 'success')
      router.refresh()
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className={bare ? '' : CARD}>
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-[var(--ink)]">
          <span className="mr-2 font-mono text-sm text-[var(--ink-3)]">{entry.time}</span>{slotName}
          {entry.restaurant && <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-800">eating out</span>}
          {entry.noAddedFat && <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-800">no butter/oil</span>}
        </h3>
        <span className="text-sm text-[var(--ink-2)]"><strong className="text-[var(--ink)]">{totals.kcal} kcal</strong> ({band.low}–{band.high})</span>
      </header>

      {editing ? (
        <>
          <label className="mb-3 block">
            <span className={LABEL}>What you ate</span>
            <textarea className={`${INPUT} min-h-[64px]`} value={text} maxLength={1000} onChange={e => { setText(e.target.value); setRecalculated(false) }} onPaste={onPasteImages} onDragOver={e => e.preventDefault()} onDrop={onDropImages} />
          </label>
          <div className="mb-3 flex flex-wrap gap-2">
            {kept.map((p, i) => (
              <div key={p.path} className="relative">
                {p.url
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL / local preview
                  ? <img src={p.url} alt={`Meal photo ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
                  : <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[var(--paper-2)] text-[10px] text-[var(--ink-3)]">photo</div>}
                <button type="button" aria-label={`Remove photo ${i + 1}`} className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-black/70 text-xs text-white" onClick={() => { setKept(kept.filter(k => k.path !== p.path)); setRecalcPaths(null) }}>×</button>
              </div>
            ))}
            {added.map((a, i) => (
              <div key={a.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={a.url} alt={`New photo ${i + 1}`} className="h-16 w-16 rounded-lg object-cover ring-2 ring-[var(--blue-700)]" />
                <button type="button" aria-label={`Remove new photo ${i + 1}`} className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-black/70 text-xs text-white" onClick={() => { URL.revokeObjectURL(a.url); setAdded(added.filter(x => x.url !== a.url)) }}>×</button>
              </div>
            ))}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
            <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            {kept.length + added.length < MAX_PHOTOS && (
              <>
                <button type="button" className={BUTTON_SECONDARY} onClick={() => fileRef.current?.click()}>Photo</button>
                <button type="button" className={BUTTON_SECONDARY} onClick={() => libraryRef.current?.click()}>Upload</button>
              </>
            )}
          </div>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:max-w-md">
            <label><span className={LABEL}>Time</span><input type="time" className={INPUT} value={time} onChange={e => setTime(e.target.value)} /></label>
            <label><span className={LABEL}>Meal</span>
              <select className={INPUT} value={slot} onChange={e => setSlot(e.target.value)}>
                <option value="">Other</option>
                {slots.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-[var(--ink-2)]">
              <input type="checkbox" checked={restaurant} onChange={e => setRestaurant(e.target.checked)} /> Eating out
            </label>
            <div className="col-span-2"><NoAddedFatToggle checked={noAddedFat} onChange={setNoAddedFat} prominent={restaurant} /></div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" className={BUTTON_SECONDARY} disabled={busy !== null} onClick={recalculate}>
              {busy === 'recalc' ? 'Re-calculating…' : 'Re-calculate'}
            </button>
            {(recalculated || inputsChanged) && (
              <span className="text-xs text-[var(--ink-3)]">{recalculated ? 'New estimate — Save to keep' : 'Changed — re-calculate'}</span>
            )}
          </div>
          <FoodItemsEditor items={items} onChange={setItems} componentLabels={componentLabels} />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={BUTTON_SECONDARY} disabled={busy !== null} onClick={cancel}>Cancel</button>
            <button type="button" className={BUTTON_PRIMARY} disabled={busy !== null} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      ) : (
        <>
          {entry.text && <p className="mb-2 text-sm italic text-[var(--ink-3)]">“{entry.text}”</p>}
          {entry.photos.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {entry.photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
                <img key={p.path} src={p.url} alt={`Meal photo ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" />
              ))}
            </div>
          )}
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {entry.items.map((i, idx) => (
              <li key={idx}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-[var(--ink)]">{i.name} <span className="text-xs text-[var(--ink-3)]">{i.quantityG} g</span>
                    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${i.source === 'ai' ? 'bg-amber-50 text-amber-900' : 'bg-[var(--paper-2)] text-[var(--ink-3)]'}`}>{itemSourceLabel(i.source)}</span>
                    {i.confidence === 'low' && <span className="ml-1 text-xs font-bold text-amber-700">check portion</span>}
                  </span>
                  <span className="text-xs text-[var(--ink-2)]">{Math.round(i.kcal)} kcal · P {fmtNum(i.proteinG)} · sat {fmtNum(i.satFatG)}</span>
                </div>
                <AssumptionChips assumptions={i.assumptions} />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" className="min-h-11 px-2 text-sm font-semibold text-red-700" disabled={busy !== null} onClick={remove}>Delete</button>
            <button type="button" className={BUTTON_PRIMARY} disabled={busy !== null} onClick={startEdit}>Edit</button>
          </div>
        </>
      )}
    </article>
  )
}
