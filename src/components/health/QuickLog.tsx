'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import type { MealSlot } from '@/lib/health/programmeSchema'
import { suggestSlot, type FoodItem } from '@/lib/health/nutrition'
import FoodItemsEditor, { fromEditable, toEditable, type EditableItem } from './FoodItemsEditor'
import BarcodeScanner from './BarcodeScanner'
import NoAddedFatToggle from './NoAddedFatToggle'
import { preparePhoto } from './resizePhoto'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT, LABEL } from './ui'
import InfoPopover from './ui/InfoPopover'
import { imageFilesFrom, hasTextPayload } from '@/lib/health/pastedImages'

const MAX_PHOTOS = 4

interface Props {
  date: string
  nowTime: string
  slots: MealSlot[]
  componentLabels: Record<string, { name: string; unit: string }>
  /** Programme eating-out rules, shown in restaurant mode (P2). */
  eatingOut?: string[]
  /** Photos chosen from the + menu before the sheet opened. */
  initialFiles?: File[]
  /** Open the barcode scanner straight away (+ menu "Barcode"). */
  startScan?: boolean
  /** Called after a successful save (e.g. close the sheet). */
  onSaved?: () => void
}

/** Quick food log (specs/029 US3; compact sheet layout in specs/032): words and/or 1–4 photos → AI estimate → edit → save. */
export default function QuickLog({ date, nowTime, slots, componentLabels, eatingOut = [], initialFiles = [], startScan = false, onSaved }: Props) {
  const toast = useToast()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<Array<{ file: File; url: string }>>(() => initialFiles.slice(0, MAX_PHOTOS).map(file => ({ file, url: URL.createObjectURL(file) })))
  const [time, setTime] = useState(nowTime)
  const [slot, setSlot] = useState<string>(suggestSlot(slots, nowTime)?.key ?? '')
  const [restaurant, setRestaurant] = useState(false)
  const [noAddedFat, setNoAddedFat] = useState(false)
  const [items, setItems] = useState<EditableItem[] | null>(null)
  const [photoPaths, setPhotoPaths] = useState<string[]>([])
  const [tips, setTips] = useState<string[]>([])
  const [busy, setBusy] = useState<'estimate' | 'save' | null>(null)
  const [scan, setScan] = useState(startScan)


  function onTimeChange(v: string) {
    setTime(v)
    const s = suggestSlot(slots, v)
    if (s) setSlot(s.key)
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return
    const room = MAX_PHOTOS - photos.length
    if (list.length > room) toast(`Up to ${MAX_PHOTOS} photos`, 'info')
    const added = Array.from(list).slice(0, Math.max(0, room)).map(file => ({ file, url: URL.createObjectURL(file) }))
    setPhotos([...photos, ...added])
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

  function reset() {
    photos.forEach(p => URL.revokeObjectURL(p.url))
    setText(''); setPhotos([]); setItems(null); setPhotoPaths([]); setRestaurant(false); setNoAddedFat(false); setTips([])
    if (fileRef.current) fileRef.current.value = ''
  }

  async function estimate() {
    if (!text.trim() && photos.length === 0) { toast('Describe the food or add a photo', 'error'); return }
    setBusy('estimate')
    try {
      const form = new FormData()
      if (text.trim()) form.set('text', text.trim())
      if (slot) form.set('slot', slot)
      form.set('date', date)
      form.set('time', time)
      if (restaurant) form.set('restaurant', 'true')
      if (noAddedFat) form.set('noAddedFat', 'true')
      for (const p of photos) form.append('photos', await preparePhoto(p.file), 'photo.jpg')
      const res = await fetch('/api/health/food/estimate', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.photoPaths)) setPhotoPaths(data.photoPaths)
      if (!res.ok) { toast(data.error ?? 'Could not estimate the food', 'error'); return }
      setItems(toEditable(data.items as FoodItem[]))
      setTips(Array.isArray(data.tips) ? (data.tips as string[]).slice(0, 5) : [])
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!items || items.length === 0) return
    if (items.some(i => !i.name.trim())) { toast('Give every item a name', 'error'); return }
    setBusy('save')
    try {
      const { items: clean, remember } = fromEditable(items)
      const res = await fetch('/api/health/food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, slot: slot || null, text: text.trim() || null, restaurant, noAddedFat, photoPaths, items: clean, remember }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not save the food', 'error'); return }
      toast('Logged', 'success')
      reset()
      router.refresh()
      onSaved?.()
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setBusy(null)
    }
  }

  const manual = () => setItems(toEditable([{
    name: text.trim().slice(0, 120), quantityG: 100, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, satFatG: 0, fibreG: 0,
    components: {}, confidence: 'high', isTreat: false, source: 'manual', libraryId: null, offCode: null,
  }]))
  const full = photos.length >= MAX_PHOTOS

  return (
    <div id="log-food" onPaste={onPasteImages} onDragOver={e => e.preventDefault()} onDrop={onDropImages}>
      {items === null ? (
        <>
          <textarea
            className={`${INPUT} min-h-[88px]`}
            aria-label="What did you eat?"
            placeholder={restaurant ? 'Dish, or snap the menu' : 'What did you eat? e.g. 2 flat whites with soya'}
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={1000}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
            <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            <button type="button" className={ICON_BTN} disabled={full} onClick={() => fileRef.current?.click()}><span aria-hidden="true">📷</span> Photo</button>
            <button type="button" className={ICON_BTN} disabled={full} onClick={() => libraryRef.current?.click()} title="Paste (⌘/Ctrl+V), drop or choose a screenshot"><span aria-hidden="true">⤒</span> Upload</button>
            <button type="button" className={ICON_BTN} onClick={() => setScan(true)}><span aria-hidden="true">▦</span> Barcode</button>
            {photos.length > 0 && <span className="text-xs text-[var(--ink-3)]">{photos.length}/{MAX_PHOTOS}</span>}
          </div>
          {photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map(({ url: src }, i) => (
                <div key={src} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                  <img src={src} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
                  <button type="button" aria-label={`Remove photo ${i + 1}`} className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-xs text-white" onClick={() => { URL.revokeObjectURL(src); setPhotos(photos.filter((_, j) => j !== i)) }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={restaurant} onClick={() => setRestaurant(!restaurant)} className={`${CHIP} ${restaurant ? CHIP_ON : CHIP_OFF}`}>{restaurant ? '✓ ' : ''}Eating out</button>
            <NoAddedFatToggle checked={noAddedFat} onChange={setNoAddedFat} chip />
            {restaurant && eatingOut.length > 0 && (
              <InfoPopover label="Eating-out tips" align="left"><ul className="list-disc pl-5 text-xs">{eatingOut.map(r => <li key={r}>{r}</li>)}</ul></InfoPopover>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label><span className={LABEL}>Meal</span>
              <select className={INPUT} value={slot} onChange={e => setSlot(e.target.value)}>
                <option value="">Other</option>
                {slots.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </label>
            <label><span className={LABEL}>Time</span><input type="time" className={INPUT} value={time} onChange={e => onTimeChange(e.target.value)} /></label>
          </div>
          {scan && (
            <div className="mt-3">
              <BarcodeScanner onAdd={item => setItems(toEditable([{ ...item }]).map(i => ({ ...i, remember: true })))} onClose={() => setScan(false)} />
            </div>
          )}
          <div className="sticky bottom-0 -mx-4 mt-3 flex items-center gap-2 border-t border-[var(--rule-soft)] bg-white px-4 py-3">
            <button type="button" className="min-h-11 px-2 text-sm font-semibold text-[var(--blue-700)]" onClick={manual}>By hand</button>
            <button type="button" className={`${BUTTON_PRIMARY} ml-auto min-w-32`} disabled={busy !== null || (!text.trim() && photos.length === 0)} onClick={estimate}>
              {busy === 'estimate' ? 'Estimating…' : 'Estimate'}
            </button>
          </div>
        </>
      ) : (
        <>
          {tips.length > 0 && (
            <details className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
              <summary className="min-h-8 cursor-pointer font-semibold">When you order ({tips.length})</summary>
              <ul className="mt-1 list-disc pl-5 text-xs">{tips.map(t => <li key={t}>{t}</li>)}</ul>
            </details>
          )}
          <FoodItemsEditor items={items} onChange={setItems} componentLabels={componentLabels} />
          <div className="sticky bottom-0 -mx-4 mt-3 flex justify-end gap-2 border-t border-[var(--rule-soft)] bg-white px-4 py-3">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setItems(null)}>Back</button>
            <button type="button" className={`${BUTTON_PRIMARY} min-w-32`} disabled={busy !== null || items.length === 0} onClick={save}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const ICON_BTN = 'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--rule)] bg-white px-3 text-sm font-semibold text-[var(--ink)] disabled:opacity-50'
export const CHIP = 'inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold'
export const CHIP_ON = 'border-green-700 bg-green-50 text-green-800'
export const CHIP_OFF = 'border-[var(--rule)] bg-white text-[var(--ink-2)]'
