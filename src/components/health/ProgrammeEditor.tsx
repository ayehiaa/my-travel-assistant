'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { IMPORT_SECTIONS, validateSection, type SectionKey, type SectionValue } from '@/lib/health/programmeImport'
import { sendJson, errorOf } from './api'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_TITLE, INPUT } from './ui'
import SectionValueEditor from './SectionValueEditor'

export interface VersionRow { id: string; versionNo: number; source: string; changeSummary: string[]; createdAt: string; name: string }
export interface ProgrammeRow { id: string; name: string; versionNo: number; source: string; createdAt: string }

const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Edit the active programme one section at a time (specs/029 US1.4). Each save is a new version with a diff summary. */
export function ProgrammeSectionEditor({ sections }: { sections: Record<SectionKey, SectionValue> }) {
  const toast = useToast()
  const router = useRouter()
  const [key, setKey] = useState<SectionKey>('identity')
  const [value, setValue] = useState<SectionValue>(sections.identity)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const validation = useMemo(() => validateSection(key, value), [key, value])

  function choose(k: SectionKey) {
    if (dirty && !window.confirm('Discard your unsaved edits to this section?')) return
    setKey(k)
    setValue(sections[k])
    setDirty(false)
  }

  async function save() {
    setBusy(true)
    const res = await sendJson<{ version: number; summary: string[]; targetsChanged: boolean }>('/api/health/programme', { section: key, value }, 'PATCH')
    setBusy(false)
    if (!res.ok) { toast(errorOf(res, 'Could not save'), 'error'); return }
    toast(`Saved as version ${res.data.version}${res.data.targetsChanged ? ' — daily targets updated' : ''}`, 'success')
    setDirty(false)
    router.refresh()
  }

  return (
    <section className={CARD}>
      <h3 className={CARD_TITLE}>Edit by section</h3>
      <label className="mb-3 block text-xs text-[var(--ink-3)] sm:hidden">
        Section
        <select className={INPUT} value={key} onChange={e => choose(e.target.value as SectionKey)}>
          {IMPORT_SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
      <div className="mb-3 hidden flex-wrap gap-1.5 sm:flex">
        {IMPORT_SECTIONS.map(s => (
          <button key={s.key} type="button" onClick={() => choose(s.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${s.key === key ? 'border-[var(--blue-700)] bg-[var(--blue-700)] text-white' : 'border-[var(--rule)] text-[var(--ink-2)]'}`}>
            {s.label}
          </button>
        ))}
      </div>
      <SectionValueEditor key={key} section={key} value={value} onChange={v => { setValue(v); setDirty(true) }} />
      {!validation.ok && (
        <ul className="mt-3 list-disc rounded-lg bg-red-50 py-2 pl-8 pr-3 text-sm text-red-800">
          {validation.errors.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={BUTTON_PRIMARY} disabled={busy || !dirty || !validation.ok} onClick={save}>Save as new version</button>
        <button type="button" className={BUTTON_SECONDARY} disabled={busy || !dirty} onClick={() => { setValue(sections[key]); setDirty(false) }}>Undo edits</button>
      </div>
      <p className="mt-2 text-xs text-[var(--ink-3)]">Energy and macro changes recompute your daily targets; accepted fortnightly adjustments are kept.</p>
    </section>
  )
}

/** Version history of the active programme with diff summaries; restore = a new version with the old content. */
export function VersionHistory({ versions, currentId }: { versions: VersionRow[]; currentId: string }) {
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function restore(v: VersionRow) {
    if (!window.confirm(`Restore version ${v.versionNo}? It is saved as a new version.`)) return
    setBusy(v.id)
    const res = await sendJson<{ version: number }>('/api/health/programme', { restore: v.id }, 'PATCH')
    setBusy(null)
    if (!res.ok) { toast(errorOf(res, 'Could not restore'), 'error'); return }
    toast(`Restored as version ${res.data.version}`, 'success')
    router.refresh()
  }

  return (
    <section className={CARD}>
      <h3 className={CARD_TITLE}>Version history</h3>
      {versions.length === 0 && <p className="text-sm text-[var(--ink-3)]">No versions recorded yet.</p>}
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {versions.map(v => (
          <li key={v.id} className="border-l-2 border-[var(--rule)] pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[var(--ink)]">Version {v.versionNo}</strong>
              <span className="text-xs text-[var(--ink-3)]">{fmtDate(v.createdAt)} · {v.source === 'edit' ? 'edited' : v.source === 'import' ? 'imported' : 'from template'}</span>
              {v.id === currentId
                ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-900">Current</span>
                : <button type="button" className="text-xs font-semibold text-[var(--blue-700)] underline" disabled={busy !== null} onClick={() => restore(v)}>{busy === v.id ? 'Restoring…' : 'Restore'}</button>}
            </div>
            {v.changeSummary.length > 0 && (
              <ul className="m-0 mt-1 list-disc pl-5 text-sm text-[var(--ink-2)]">{v.changeSummary.map(s => <li key={s}>{s}</li>)}</ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The user's programmes (latest version each) with "Switch" — ends the current enrolment, keeps its history. */
export function ProgrammeSwitcher({ programmes, excludeIds, today }: { programmes: ProgrammeRow[]; excludeIds: string[]; today: string }) {
  const toast = useToast()
  const router = useRouter()
  const [target, setTarget] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const others = programmes.filter(p => !excludeIds.includes(p.id))

  async function doSwitch() {
    if (!target) return
    setBusy(true)
    const res = await sendJson('/api/health/programme/switch', { programmeId: target, startDate })
    setBusy(false)
    if (!res.ok) { toast(errorOf(res, 'Could not switch'), 'error'); return }
    toast('Programme switched — your previous programme is kept in history', 'success')
    router.refresh()
  }

  return (
    <section className={CARD}>
      <h3 className={CARD_TITLE}>Your programmes</h3>
      {others.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">No other programmes yet — import one to switch to it.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {others.map(p => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--rule)] p-3 text-sm">
              <input type="radio" name="switch-programme" checked={target === p.id} onChange={() => setTarget(p.id)} />
              <span><strong className="text-[var(--ink)]">{p.name}</strong> <span className="text-xs text-[var(--ink-3)]">v{p.versionNo} · {p.source} · {fmtDate(p.createdAt)}</span></span>
            </label>
          ))}
          {target && (
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="block text-xs text-[var(--ink-3)]">
                Start date
                <input type="date" className={INPUT} value={startDate} onChange={e => setStartDate(e.target.value)} />
              </label>
              <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={doSwitch}>{busy ? 'Switching…' : 'Switch programme'}</button>
            </div>
          )}
          <p className="text-xs text-[var(--ink-3)]">Switching ends your current programme (its logs stay) and starts the chosen one with fresh targets from your profile.</p>
        </div>
      )}
    </section>
  )
}
