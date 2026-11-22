'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { preparePhoto } from './resizePhoto'
import { sendJson, errorOf } from './api'
import { BUTTON_SECONDARY, CARD, CARD_TITLE } from './ui'

/** Private progress photos (specs/029 US9): resized + metadata stripped, signed URLs, never auto-deleted. */
export default function ProgressPhotos({ today, photos }: { today: string; photos: Array<{ id: string; date: string; url: string | null }> }) {
  const toast = useToast()
  const router = useRouter()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const form = new FormData()
      form.set('date', today)
      form.set('photo', await preparePhoto(file), 'photo.jpg')
      const res = await fetch('/api/health/progress-photos', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not upload the photo', 'error'); return }
      toast('Photo saved privately', 'success')
      router.refresh()
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }
  async function remove(id: string) {
    const r = await sendJson(`/api/health/progress-photos?id=${id}`, undefined, 'DELETE')
    if (!r.ok) { toast(errorOf(r, 'Could not delete'), 'error'); return }
    router.refresh()
  }
  return (
    <section className={CARD} aria-labelledby="photo-h">
      <h2 id="photo-h" className={CARD_TITLE}>Progress photos</h2>
      <p className="text-xs text-[var(--ink-3)]">Private to you (signed links only, location data removed). Same light, pose and time of day each time.</p>
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map(p => (
            <figure key={p.id} className="relative m-0">
              {p.url
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                ? <img src={p.url} alt={`Progress photo ${p.date}`} className="aspect-[3/4] w-full rounded-lg object-cover" />
                : <div className="aspect-[3/4] w-full rounded-lg bg-[var(--paper-2)]" />}
              <figcaption className="mt-1 flex items-center justify-between text-[11px] text-[var(--ink-3)]">
                {p.date}
                <button type="button" className="font-semibold text-red-700 underline" onClick={() => remove(p.id)}>Delete</button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => upload(e.target.files?.[0])} />
      <button type="button" className={`${BUTTON_SECONDARY} mt-3`} disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Uploading…' : 'Add a photo'}</button>
    </section>
  )
}
