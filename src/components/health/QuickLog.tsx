'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import type { MealSlot } from '@/lib/health/programmeSchema'
import { suggestSlot, type FoodItem } from '@/lib/health/nutrition'
import FoodItemsEditor, { fromEditable, toEditable, type EditableItem } from './FoodItemsEditor'
import { preparePhoto } from './resizePhoto'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_TITLE, INPUT, LABEL } from './ui'

const MAX_PHOTOS = 4

interface Props {
  date: string
  nowTime: string
  slots: MealSlot[]
  componentLabels: Record<string, { name: string; unit: string }>
}

/** Quick food log (specs/029 US3): words and/or 1–4 photos → AI estimate → edit → save. */
export default function QuickLog({ date, nowTime, slots, componentLabels }: Props) {
  const toast = useToast()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<Array<{ file: File; url: string }>>([])
  const [time, setTime] = useState(nowTime)
  const [slot, setSlot] = useState<string>(suggestSlot(slots, nowTime)?.key ?? '')
  const [restaurant, setRestaurant] = useState(false)
  const [items, setItems] = useState<EditableItem[] | null>(null)
  const [photoPaths, setPhotoPaths] = useState<string[]>([])
  const [busy, setBusy] = useState<'estimate' | 'save' | null>(null)


  function onTimeChange(v: string) {
    setTime(v)
    const s = suggestSlot(slots, v)
    if (s) setSlot(s.key)
  }

  function addFiles(list: FileList | null) {
    if (!list) return
    const room = MAX_PHOTOS - photos.length
    if (list.length > room) toast(`Up to ${MAX_PHOTOS} photos`, 'info')
    const added = Array.from(list).slice(0, Math.max(0, room)).map(file => ({ file, url: URL.createObjectURL(file) }))
    setPhotos([...photos, ...added])
  }

  function reset() {
    photos.forEach(p => URL.revokeObjectURL(p.url))
    setText(''); setPhotos([]); setItems(null); setPhotoPaths([]); setRestaurant(false)
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
      for (const p of photos) form.append('photos', await preparePhoto(p.file), 'photo.jpg')
      const res = await fetch('/api/health/food/estimate', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.photoPaths)) setPhotoPaths(data.photoPaths)
      if (!res.ok) { toast(data.error ?? 'Could not estimate the food', 'error'); return }
      setItems(toEditable(data.items as FoodItem[]))
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
        body: JSON.stringify({ date, time, slot: slot || null, text: text.trim() || null, restaurant, photoPaths, items: clean, remember }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not save the food', 'error'); return }
      toast('Logged', 'success')
      reset()
      router.refresh()
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={CARD} id="log-food">
      <h2 className={CARD_TITLE}>Log food</h2>
      {items === null ? (
        <>
          <textarea
            className={`${INPUT} min-h-[72px]`}
            placeholder="e.g. 2 flat whites with soya and half a cinnamon roll"
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={1000}
          />
          {photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map(({ url: src }, i) => (
                <div key={src} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                  <img src={src} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
                  <button type="button" aria-label={`Remove photo ${i + 1}`} className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-black/70 text-xs text-white" onClick={() => { URL.revokeObjectURL(src); setPhotos(photos.filter((_, j) => j !== i)) }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label><span className={LABEL}>Time</span><input type="time" className={INPUT} value={time} onChange={e => onTimeChange(e.target.value)} /></label>
            <label><span className={LABEL}>Meal</span>
              <select className={INPUT} value={slot} onChange={e => setSlot(e.target.value)}>
                <option value="">Other</option>
                {slots.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </label>
            <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm text-[var(--ink-2)] sm:col-span-1">
              <input type="checkbox" checked={restaurant} onChange={e => setRestaurant(e.target.checked)} /> Eating out
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
            <button type="button" className={BUTTON_SECONDARY} disabled={photos.length >= MAX_PHOTOS} onClick={() => fileRef.current?.click()}>
              Add photo{photos.length > 0 ? ` (${photos.length}/${MAX_PHOTOS})` : ''}
            </button>
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setItems(toEditable([{
              name: text.trim().slice(0, 120), quantityG: 100, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, satFatG: 0, fibreG: 0,
              components: {}, confidence: 'high', isTreat: false, source: 'manual', libraryId: null, offCode: null,
            }]))}>
              Enter by hand
            </button>
            <button type="button" className={`${BUTTON_PRIMARY} ml-auto`} disabled={busy !== null || (!text.trim() && photos.length === 0)} onClick={estimate}>
              {busy === 'estimate' ? 'Estimating…' : 'Estimate'}
            </button>
          </div>
        </>
      ) : (
        <>
          <FoodItemsEditor items={items} onChange={setItems} componentLabels={componentLabels} />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setItems(null)}>Back</button>
            <button type="button" className={BUTTON_PRIMARY} disabled={busy !== null || items.length === 0} onClick={save}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
