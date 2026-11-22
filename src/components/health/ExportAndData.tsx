'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { DELETE_CONFIRMATION, isDeleteConfirmed } from '@/lib/health/dataRights'
import { healthHref } from '@/lib/health/healthHub'
import { sendJson, errorOf } from './api'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_TITLE, INPUT } from './ui'

/** Download a file from an authenticated GET (cookies) and save it with the server's filename. */
async function download(url: string, fallbackName: string): Promise<string | null> {
  const res = await fetch(url)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return (data as { error?: string }).error ?? 'Download failed'
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
  return null
}

/** Clinician export (specs/029 US14): date range → PDF or CSV; progress photos only when ticked. */
export function ClinicianExportForm({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const toast = useToast()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [photos, setPhotos] = useState(false)
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null)

  async function go(format: 'pdf' | 'csv') {
    if (!from || !to || from > to) { toast('Choose a valid date range', 'error'); return }
    setBusy(format)
    const q = new URLSearchParams({ from, to, format, photos: photos ? '1' : '0' })
    const err = await download(`/api/health/export/clinician?${q}`, `health-summary.${format}`).catch(() => 'Network error — try again')
    setBusy(null)
    if (err) toast(err, 'error')
  }

  return (
    <section className={CARD}>
      <h3 className={CARD_TITLE}>Export for a clinician</h3>
      <p className="mb-3 text-sm text-[var(--ink-2)]">
        A summary for your GP, dietitian or physio: profile, weight trend with 7-day averages, waist, lipid panels, adherence
        (components, protein, saturated fat), training and cardio, and your notes. No food details; photos only if you tick the box.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <label className="block text-xs text-[var(--ink-3)]">From<input type="date" className={INPUT} value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="block text-xs text-[var(--ink-3)]">To<input type="date" className={INPUT} value={to} onChange={e => setTo(e.target.value)} /></label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-[var(--ink-2)]">
        <input type="checkbox" checked={photos} onChange={e => setPhotos(e.target.checked)} /> Include progress photos
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={BUTTON_PRIMARY} disabled={busy !== null} onClick={() => go('pdf')}>{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
        <button type="button" className={BUTTON_SECONDARY} disabled={busy !== null} onClick={() => go('csv')}>{busy === 'csv' ? 'Preparing…' : 'Download CSV'}</button>
      </div>
    </section>
  )
}

/** Data rights (spec §2 / §8): export everything as JSON; delete everything with a typed confirmation. */
export function HealthDataRights() {
  const toast = useToast()
  const router = useRouter()
  const [exporting, setExporting] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function exportAll() {
    setExporting(true)
    const err = await download('/api/health/data/export', 'health-data.json').catch(() => 'Network error — try again')
    setExporting(false)
    if (err) toast(err, 'error')
    else toast('Export downloaded — photo links in it work for 24 hours', 'success')
  }

  async function deleteAll() {
    if (!isDeleteConfirmed(confirm)) return
    setDeleting(true)
    const res = await sendJson<{ rows: number; files: number }>('/api/health/data/delete', { confirm })
    setDeleting(false)
    if (!res.ok) { toast(errorOf(res, 'Could not delete your data'), 'error'); return }
    toast(`Deleted ${res.data.rows} records and ${res.data.files} photos`, 'success')
    router.push(healthHref())
    router.refresh()
  }

  return (
    <section className={CARD}>
      <h3 className={CARD_TITLE}>Your data</h3>
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-sm text-[var(--ink-2)]">
            Download everything Health stores about you as one JSON file. Photos are included as private links valid for 24 hours.
          </p>
          <button type="button" className={BUTTON_SECONDARY} disabled={exporting} onClick={exportAll}>{exporting ? 'Preparing…' : 'Export my health data'}</button>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-900">Delete all my health data</p>
          <p className="mb-2 text-sm text-red-900">
            Permanently removes every Health record and photo (programmes, logs, training, measurements, settings, consent). This cannot be undone.
            Type <strong>{DELETE_CONFIRMATION}</strong> to confirm.
          </p>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Confirmation" className={`${INPUT} max-w-xs`} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={DELETE_CONFIRMATION} autoComplete="off" />
            <button type="button" className="rounded-full bg-red-700 px-5 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={!isDeleteConfirmed(confirm) || deleting} onClick={deleteAll}>
              {deleting ? 'Deleting…' : 'Delete everything'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
