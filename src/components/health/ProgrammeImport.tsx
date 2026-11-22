'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { healthHref } from '@/lib/health/healthHub'
import {
  IMPORT_SECTIONS, MAX_IMPORT_PDF_BYTES, SECTION_STATUS_LABELS, validateSection,
  type DraftSections, type SectionKey, type SectionStatus,
} from '@/lib/health/programmeImport'
import { createClient } from '@/lib/supabase/client'
import { sendJson, errorOf } from './api'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_TITLE, INPUT, LABEL } from './ui'
import SectionValueEditor from './SectionValueEditor'

const STATUS_STYLE: Record<SectionStatus, string> = {
  extracted: 'bg-green-50 text-green-800',
  needs_review: 'bg-amber-50 text-amber-900',
  not_found: 'bg-[var(--paper-2,#f1f3f6)] text-[var(--ink-3)]',
}

export interface OpenDraft { id: string; fileName: string | null; sourceKind: 'pdf' | 'text'; createdAt: string; confirmed: string[] }

/** Step 1 (specs/029 US1): upload a PDF or paste text → the AI drafts a programme. */
export function ImportUpload({ drafts }: { drafts: OpenDraft[] }) {
  const toast = useToast()
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!file && text.trim().length < 50) { toast('Choose a PDF or paste the programme text', 'error'); return }
    if (file && file.size > MAX_IMPORT_PDF_BYTES) { toast('The PDF must be 10 MB or smaller', 'error'); return }
    setBusy(true)
    try {
      let body: Record<string, string>
      if (file) {
        // Browser → private bucket directly (signed one-time URL); the server reads it once and deletes it.
        const signed = await sendJson<{ path: string; token: string }>('/api/health/programme/import/upload-url', {})
        if (!signed.ok) { toast(errorOf(signed, 'Could not prepare the upload'), 'error'); return }
        const up = await createClient().storage.from('health-photos').uploadToSignedUrl(signed.data.path, signed.data.token, file, { contentType: 'application/pdf' })
        if (up.error) { toast('Upload failed — try again', 'error'); return }
        body = { storagePath: signed.data.path, fileName: file.name }
      } else {
        body = { text: text.trim() }
      }
      const res = await fetch('/api/health/programme/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Import failed', 'error'); return }
      toast('Draft ready — review each section', 'success')
      router.push(healthHref({ tab: 'plan', view: 'import', import: data.id }))
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h3 className={CARD_TITLE}>Import a programme</h3>
        <p className="mb-3 text-sm text-[var(--ink-2)]">
          Upload your programme as a PDF (up to 10 MB) or paste its text. The AI (your own Anthropic key) turns it into a draft;
          you then review and confirm every section before it can be used. The file is stored privately only until it has been read, then deleted.
        </p>
        <label className={LABEL} htmlFor="import-file">PDF</label>
        <input id="import-file" type="file" accept="application/pdf,.pdf" className="mb-3 block w-full text-sm" disabled={busy || text.trim().length > 0}
          onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <label className={LABEL} htmlFor="import-text">…or paste the text</label>
        <textarea id="import-text" className={`${INPUT} min-h-[140px]`} value={text} disabled={busy || !!file}
          onChange={e => setText(e.target.value)} placeholder="Paste the whole programme here" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={submit}>{busy ? 'Reading your programme…' : 'Create draft'}</button>
          {busy && <span className="text-sm text-[var(--ink-3)]">This can take up to a minute for a long document.</span>}
        </div>
        {busy && (
          <div className="mt-4 flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2].map(i => <div key={i} className="h-4 animate-pulse rounded bg-[var(--rule)]" style={{ width: `${90 - i * 15}%` }} />)}
          </div>
        )}
      </section>
      {drafts.length > 0 && (
        <section className={CARD}>
          <h3 className={CARD_TITLE}>Drafts in review</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {drafts.map(d => (
              <li key={d.id}>
                <Link className="font-semibold text-[var(--blue-700)] underline" href={healthHref({ tab: 'plan', view: 'import', import: d.id })}>
                  {d.fileName ?? 'Pasted text'}
                </Link>
                <span className="text-xs text-[var(--ink-3)]"> · {new Date(d.createdAt).toLocaleDateString('en-GB')} · {d.confirmed.length}/{IMPORT_SECTIONS.length} sections confirmed</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

interface ReviewProps {
  id: string
  fileName: string | null
  sections: DraftSections
  statuses: Record<SectionKey, SectionStatus>
  notes: Partial<Record<SectionKey, string>>
  confirmed: SectionKey[]
  today: string
  hasActive: boolean
}

/** Step 2: section-by-section review. Each section must be confirmed; then save (and optionally start it). */
export function ImportReview(props: ReviewProps) {
  const toast = useToast()
  const router = useRouter()
  const [sections, setSections] = useState<DraftSections>(props.sections)
  const [statuses, setStatuses] = useState(props.statuses)
  const [confirmed, setConfirmed] = useState<SectionKey[]>(props.confirmed)
  const firstOpen = IMPORT_SECTIONS.findIndex(s => !props.confirmed.includes(s.key))
  const [step, setStep] = useState(firstOpen < 0 ? IMPORT_SECTIONS.length : firstOpen)
  const [busy, setBusy] = useState(false)
  const [startDate, setStartDate] = useState(props.today)
  const [dirty, setDirty] = useState(false)

  const current = step < IMPORT_SECTIONS.length ? IMPORT_SECTIONS[step] : null
  const validation = useMemo(() => (current ? validateSection(current.key, sections[current.key]) : null), [current, sections])
  const allConfirmed = IMPORT_SECTIONS.every(s => confirmed.includes(s.key))

  async function patch(confirm: boolean) {
    if (!current) return
    setBusy(true)
    const res = await sendJson<{ draft: { statuses: Record<SectionKey, SectionStatus>; confirmed: SectionKey[]; sections: DraftSections } }>(
      `/api/health/programme/import/${props.id}`, { section: current.key, value: sections[current.key], confirmed: confirm }, 'PATCH')
    setBusy(false)
    if (!res.ok) { toast(errorOf(res, 'Could not save the section'), 'error'); return }
    setStatuses(res.data.draft.statuses)
    setConfirmed(res.data.draft.confirmed)
    setSections(res.data.draft.sections)
    setDirty(false)
    if (confirm) {
      const next = IMPORT_SECTIONS.findIndex((s, i) => i > step && !res.data.draft.confirmed.includes(s.key))
      setStep(next < 0 ? IMPORT_SECTIONS.length : next)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else toast('Draft saved', 'success')
  }

  async function save(activate: boolean) {
    setBusy(true)
    const res = await sendJson<{ activated: boolean }>(`/api/health/programme/import/${props.id}/save`, activate ? { activate, startDate } : { activate })
    setBusy(false)
    if (!res.ok) { toast(errorOf(res, 'Could not save the programme'), 'error'); return }
    toast(res.data.activated ? 'Programme started' : 'Programme saved — switch to it any time from Edit & versions', 'success')
    router.push(healthHref({ tab: 'plan', view: res.data.activated ? 'overview' : 'edit' }))
    router.refresh()
  }

  async function discard() {
    if (!window.confirm('Discard this draft?')) return
    setBusy(true)
    const res = await sendJson(`/api/health/programme/import/${props.id}`, undefined, 'DELETE')
    setBusy(false)
    if (!res.ok) { toast(errorOf(res, 'Could not discard'), 'error'); return }
    router.push(healthHref({ tab: 'plan', view: 'import' }))
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink)]">Review: {props.fileName ?? 'pasted programme'}</h3>
            <p className="text-sm text-[var(--ink-2)]">{confirmed.length} of {IMPORT_SECTIONS.length} sections confirmed. Nothing is used until you save.</p>
          </div>
          <button type="button" className="text-sm text-red-700 underline" disabled={busy} onClick={discard}>Discard draft</button>
        </div>
        <ol className="mt-3 flex list-none flex-wrap gap-1.5 p-0">
          {IMPORT_SECTIONS.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => { if (!dirty || window.confirm('Leave this section without saving your edits?')) { setStep(i); setDirty(false) } }}
                aria-current={i === step ? 'step' : undefined}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${i === step ? 'ring-2 ring-[var(--blue-700)]' : ''} ${STATUS_STYLE[statuses[s.key]]}`}
              >
                {confirmed.includes(s.key) ? '✓ ' : ''}{s.label}
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setStep(IMPORT_SECTIONS.length)} className={`rounded-full px-3 py-1 text-xs font-semibold ${step === IMPORT_SECTIONS.length ? 'ring-2 ring-[var(--blue-700)]' : ''} ${allConfirmed ? 'bg-blue-50 text-blue-900' : 'bg-[var(--paper-2,#f1f3f6)] text-[var(--ink-3)]'}`}>
              Save
            </button>
          </li>
        </ol>
      </section>

      {current && (
        <section className={CARD}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[var(--ink)]">{step + 1}. {current.label}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[statuses[current.key]]}`}>{SECTION_STATUS_LABELS[statuses[current.key]]}</span>
            {confirmed.includes(current.key) && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-900">Confirmed</span>}
          </div>
          {props.notes[current.key] && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">AI note: {props.notes[current.key]}</p>}
          {statuses[current.key] === 'not_found' && <p className="mb-3 text-sm text-[var(--ink-2)]">Not found in the document. Add it here, or confirm to leave it empty.</p>}
          <SectionValueEditor
            section={current.key}
            value={sections[current.key]}
            onChange={v => { setSections(s => ({ ...s, [current.key]: v })); setDirty(true) }}
          />
          {validation && !validation.ok && (
            <ul className="mt-3 list-disc rounded-lg bg-red-50 py-2 pl-8 pr-3 text-sm text-red-800">
              {validation.errors.map(e => <li key={e}>{e}</li>)}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={BUTTON_PRIMARY} disabled={busy || (validation !== null && !validation.ok)} onClick={() => patch(true)}>Confirm section</button>
            <button type="button" className={BUTTON_SECONDARY} disabled={busy || !dirty} onClick={() => patch(false)}>Save draft</button>
            {step > 0 && <button type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
          </div>
        </section>
      )}

      {!current && (
        <section className={CARD}>
          <h3 className={CARD_TITLE}>Save the programme</h3>
          {!allConfirmed ? (
            <p className="text-sm text-[var(--ink-2)]">Confirm every section first ({IMPORT_SECTIONS.length - confirmed.length} left).</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[var(--ink-2)]">
                Save it to your programmes, or save and start it now.{props.hasActive && ' Starting it ends your current programme (its history is kept).'} Targets are personalised from your profile.
              </p>
              <label className="block max-w-xs text-xs text-[var(--ink-3)]">
                Start date
                <input type="date" className={INPUT} value={startDate} onChange={e => setStartDate(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={() => save(true)}>Save & start</button>
                <button type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={() => save(false)}>Save only</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
