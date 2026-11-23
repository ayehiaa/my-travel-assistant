'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { healthHref } from '@/lib/health/healthHub'
import {
  dropSetLoad, formatLoggedSet, type LoggedSet, type Prescription, type ProgressionSuggestion,
} from '@/lib/health/training'
import { EFFORT_OPTIONS, effortOf, effortText, prefillSet } from '@/lib/health/lifestyleUi'
import BottomSheet from './ui/BottomSheet'
import InfoPopover from './ui/InfoPopover'
import { MENU_ITEM } from './ui/OverflowMenu'
import type { ExerciseSafety } from '@/lib/health/painRules'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT, LABEL } from './ui'
import { newClientId, type QueueOp, type SetValues } from '@/lib/health/offlineQueue'
import { OfflineSyncBanner, isOffline, queueOps } from './offlineSync'

export interface PlayerExercise {
  key: string
  name: string
  travelName: string | null
  videoUrl: string
  travelVideoUrl: string | null
  notes: string | null
  tempo: string | null
  perSide: boolean
  supersetGroup: string | null
  jointWatch: boolean
  usesLoad: boolean
  isUnlock: boolean
  rx: Prescription
  last: { date: string; sets: LoggedSet[] } | null
  suggestion: ProgressionSuggestion | null
  startLoad: number | null
  safety: ExerciseSafety
}

interface Props {
  date: string
  isToday: boolean
  sessionKey: string
  sessionName: string
  focus: string
  banner: string
  warnings: string[]
  painCheck: boolean
  painThreshold: number | null
  exercises: PlayerExercise[]
  /** Sets already saved for this date + session (re-opening a saved session). */
  saved: Record<string, LoggedSet[]> | null
  savedTravel: boolean
  /** Travel mode pre-selected (date inside a saved trip, P2) when the session was not saved yet. */
  defaultTravel?: boolean
  savedPain: number | null
}

interface SetDraft { load: string; reps: string; hold: string; rir: number | null; failure: boolean; done: boolean }
interface DropDraft { load: string; reps: string }
interface Draft {
  travel: boolean
  startedAt: number | null
  pain: number | null
  sets: Record<string, SetDraft[]>
  drops: Record<string, DropDraft>
  notes: string
}

const SKIP_REASONS = ['Travel', 'Illness', 'Joint pain', 'No time', 'Other']

function emptySet(load: number | null): SetDraft {
  return { load: load !== null ? String(load) : '', reps: '', hold: '', rir: null, failure: false, done: false }
}

/** New set prefilled from last time (Hevy-style): same set's reps / hold, suggested or last load. */
function prefilled(ex: PlayerExercise, i: number): SetDraft {
  const p = prefillSet(ex.last?.sets ?? null, i, ex.usesLoad ? ex.startLoad : null)
  return { load: ex.usesLoad ? p.load : '', reps: ex.rx.kind === 'reps' ? p.reps : '', hold: ex.rx.kind === 'hold' ? p.hold : '', rir: null, failure: false, done: false }
}

function fromSaved(s: LoggedSet): SetDraft {
  return {
    load: s.loadKg !== null ? String(s.loadKg) : '',
    reps: s.reps !== null ? String(s.reps) : '',
    hold: s.holdSeconds !== null ? String(s.holdSeconds) : '',
    rir: s.rir,
    failure: s.toFailure,
    done: true,
  }
}

function initialDraft(p: Props): Draft {
  const sets: Record<string, SetDraft[]> = {}
  const drops: Record<string, DropDraft> = {}
  for (const ex of p.exercises) {
    const saved = p.saved?.[ex.key]?.filter(s => !s.isDropSet) ?? []
    const n = Math.max(ex.rx.sets, saved.length)
    sets[ex.key] = Array.from({ length: n }, (_, i) => (saved[i] ? fromSaved(saved[i]) : prefilled(ex, i)))
    const drop = p.saved?.[ex.key]?.find(s => s.isDropSet)
    if (drop) drops[ex.key] = { load: drop.loadKg !== null ? String(drop.loadKg) : '', reps: drop.reps !== null ? String(drop.reps) : '' }
  }
  return { travel: p.saved ? p.savedTravel : p.savedTravel || p.defaultTravel === true, startedAt: null, pain: p.savedPain, sets, drops, notes: '' }
}

const toNum = (v: string): number | null => {
  const t = v.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const toInt = (v: string): number | null => {
  const n = toNum(v)
  return n === null ? null : Math.round(n)
}

function setValues(ex: PlayerExercise, s: SetDraft): SetValues | null {
  const reps = ex.rx.kind === 'reps' ? toInt(s.reps) : null
  const hold = ex.rx.kind === 'hold' ? toInt(s.hold) : null
  if (reps === null && hold === null) return null
  return { loadKg: ex.usesLoad ? toNum(s.load) : null, reps, holdSeconds: hold, rir: s.failure ? null : s.rir, toFailure: s.failure }
}

/** Wall-clock milliseconds (event handlers / timers only). */
const clock = () => Date.now()

function readStored(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

function fmtRest(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

/** Guided session player (specs/029 US5; Hevy-style in specs/032): Set | Previous | kg | reps | ✓ rows prefilled from
 *  last time, one-tap ✓ starts the rest timer (±15 s / skip, vibrate + notification), effort after ✓, supersets,
 *  drop-set prompt, travel variants (⋯), pain score + notes in the finish sheet. Draft autosaves in this browser. */
export default function SessionPlayer(props: Props) {
  const { date, sessionKey, exercises, painCheck, painThreshold } = props
  const toast = useToast()
  const router = useRouter()
  const draftKey = `health-training-draft:${date}:${sessionKey}`
  const [draft, setDraftState] = useState<Draft>(() => initialDraft(props))
  // Unsaved draft from an earlier visit on this device (per-browser convenience only): offered, never auto-applied.
  const stored = useSyncExternalStore(subscribeStorage, () => readStored(draftKey), () => null)
  const [touched, setTouched] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipReason, setSkipReason] = useState(SKIP_REASONS[0])
  const [skipText, setSkipText] = useState('')
  const [rest, setRest] = useState<{ label: string; endsAt: number } | null>(null)
  const [finishOpen, setFinishOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const vibrated = useRef(false)

  function setDraft(update: (d: Draft) => Draft) {
    setTouched(true)
    setDraftState(update)
  }

  function restoreStored() {
    try {
      const parsed = JSON.parse(stored ?? '') as Draft
      if (parsed && typeof parsed === 'object' && parsed.sets) {
        setDraft(d => ({ ...d, ...parsed, sets: { ...d.sets, ...parsed.sets }, drops: { ...d.drops, ...(parsed.drops ?? {}) } }))
      }
    } catch { /* unreadable draft */ }
    setDismissed(true)
  }

  function discardStored() {
    try { window.localStorage.removeItem(draftKey) } catch { /* storage unavailable */ }
    setDismissed(true)
  }

  useEffect(() => {
    if (!touched) return
    try { window.localStorage.setItem(draftKey, JSON.stringify(draft)) } catch { /* storage unavailable */ }
  }, [draft, draftKey, touched])

  useEffect(() => {
    if (!rest) return
    vibrated.current = false
    const id = window.setInterval(() => setNowMs(clock()), 500)
    return () => window.clearInterval(id)
  }, [rest])

  const restLeft = rest ? Math.max(0, Math.ceil((rest.endsAt - nowMs) / 1000)) : 0
  useEffect(() => {
    if (rest && restLeft === 0 && !vibrated.current) {
      vibrated.current = true
      try { navigator.vibrate?.([200, 100, 200]) } catch { /* not supported */ }
      notifyRestOver(rest.label)
    }
  }, [rest, restLeft])

  // Group consecutive exercises that share a superset group.
  const groups = useMemo(() => {
    const out: PlayerExercise[][] = []
    for (const ex of exercises) {
      const prev = out[out.length - 1]
      if (prev && ex.supersetGroup && prev[0].supersetGroup === ex.supersetGroup) prev.push(ex)
      else out.push([ex])
    }
    return out
  }, [exercises])

  function updateSet(exKey: string, i: number, patch: Partial<SetDraft>) {
    setDraft(d => ({ ...d, sets: { ...d.sets, [exKey]: d.sets[exKey].map((s, j) => (j === i ? { ...s, ...patch } : s)) } }))
  }

  function addSet(ex: PlayerExercise) {
    setDraft(d => {
      const list = d.sets[ex.key]
      if (list.length >= ex.rx.sets + 2) return d
      const prev = list[list.length - 1]
      return { ...d, sets: { ...d.sets, [ex.key]: [...list, { ...emptySet(null), load: prev?.load ?? '', reps: prev?.reps ?? '', hold: prev?.hold ?? '' }] } }
    })
  }

  function completeSet(ex: PlayerExercise, group: PlayerExercise[], i: number) {
    const cur = draft.sets[ex.key][i]
    // Empty value → the target (one tap ✓ like Hevy); nothing to fall back on → ask for it.
    const fallbackReps = ex.rx.reps ? String(ex.rx.reps.max) : ''
    const fallbackHold = ex.rx.holdSeconds !== null ? String(ex.rx.holdSeconds) : ''
    const s = !cur.done && ex.rx.kind === 'reps' && cur.reps.trim() === '' ? { ...cur, reps: fallbackReps }
      : !cur.done && ex.rx.kind === 'hold' && cur.hold.trim() === '' ? { ...cur, hold: fallbackHold } : cur
    const hasValue = ex.rx.kind === 'hold' ? toInt(s.hold) !== null : toInt(s.reps) !== null
    if (!hasValue) { toast(ex.rx.kind === 'hold' ? 'Enter the seconds held' : 'Enter the reps', 'error'); return }
    updateSet(ex.key, i, { reps: s.reps, hold: s.hold, done: !s.done })
    // Offline (P3): queue the change on this device; it syncs when the connection is back.
    if (isOffline()) {
      queueOps([{ kind: 'set', clientId: newClientId(), date, sessionKey, exerciseKey: ex.key, setIndex: i, isDropSet: false, set: s.done ? null : setValues(ex, s), at: clock() }])
    }
    if (s.done) return
    askNotificationPermission()
    const t = clock()
    setDraft(d => (d.startedAt ? d : { ...d, startedAt: t }))
    // Superset: no rest until the last exercise of the pair.
    const lastInGroup = group[group.length - 1].key === ex.key
    const restSec = ex.rx.restSeconds ?? 0
    if (lastInGroup && restSec > 0) {
      setNowMs(t)
      setRest({ label: draft.travel && ex.travelName ? ex.travelName : ex.name, endsAt: t + restSec * 1000 })
    }
  }

  function adjustRest(deltaSec: number) {
    const t = clock()
    setNowMs(t)
    setRest(r => (r ? { ...r, endsAt: Math.max(t, r.endsAt + deltaSec * 1000) } : r))
    vibrated.current = false
  }

  function buildPayload(status: 'done' | 'partial' | 'skipped') {
    const exercisesOut = exercises
      .filter(ex => !ex.safety.disabled)
      .map(ex => {
        const sets: LoggedSet[] = []
        draft.sets[ex.key].forEach((s, i) => {
          const reps = ex.rx.kind === 'reps' ? toInt(s.reps) : null
          const hold = ex.rx.kind === 'hold' ? toInt(s.hold) : null
          if (reps === null && hold === null) return
          sets.push({ setIndex: i, loadKg: ex.usesLoad ? toNum(s.load) : null, reps, holdSeconds: hold, rir: s.failure ? null : s.rir, toFailure: s.failure, isDropSet: false })
        })
        const drop = draft.drops[ex.key]
        const dropReps = drop ? toInt(drop.reps) : null
        if (ex.rx.dropSetOnFinalSet && drop && dropReps !== null && sets.length > 0) {
          sets.push({ setIndex: sets[sets.length - 1].setIndex, loadKg: toNum(drop.load), reps: dropReps, holdSeconds: null, rir: null, toFailure: true, isDropSet: true })
        }
        return { exerciseKey: ex.key, sets }
      })
      .filter(e => e.sets.length > 0)
    const skippedExercises = exercises.filter(ex => ex.safety.disabled).map(ex => ({ exerciseKey: ex.key, reason: 'Paused by the joint rule' }))
    const duration = draft.startedAt ? Math.min(600, Math.round((clock() - draft.startedAt) / 60000)) : null
    return {
      date,
      sessionKey,
      status,
      skipReason: status === 'skipped' ? (skipReason === 'Other' ? skipText.trim() || 'Other' : skipText.trim() ? `${skipReason}: ${skipText.trim()}` : skipReason) : null,
      travelMode: draft.travel,
      durationMinutes: status === 'skipped' ? null : duration,
      notes: draft.notes.trim() || null,
      exercises: status === 'skipped' ? [] : exercisesOut,
      skippedExercises: status === 'skipped' ? [] : skippedExercises,
      duringPain: painCheck && status !== 'skipped' ? draft.pain : null,
    }
  }

  async function save(status: 'done' | 'partial' | 'skipped') {
    if (status !== 'skipped' && painCheck && draft.pain === null) {
      toast('Record your joint pain score (0–10) before finishing', 'error')
      setFinishOpen(true)
      return
    }
    const payload = buildPayload(status)
    if (isOffline()) { queueSession(payload); return }
    setSaving(true)
    try {
      const res = await fetch('/api/health/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not save the session', 'error'); return }
      try { window.localStorage.removeItem(draftKey) } catch { /* ignore */ }
      toast(status === 'skipped' ? 'Session marked as skipped' : status === 'done' ? 'Session saved — well done' : 'Saved as partial', 'success')
      router.push(healthHref({ tab: 'train' }))
      router.refresh()
    } catch {
      // Connection dropped mid-save: queue it on this device (same as offline) — nothing is lost.
      queueSession(payload)
    } finally {
      setSaving(false)
    }
  }

  /** Offline save (P3): every set as a "last write wins" op + a finish op, synced when back online. */
  function queueSession(payload: ReturnType<typeof buildPayload>) {
    const at = clock()
    const ops: QueueOp[] = []
    for (const ex of exercises) {
      const logged = payload.exercises.find(e => e.exerciseKey === ex.key)?.sets ?? []
      const n = Math.max(draft.sets[ex.key]?.length ?? 0, ...logged.map(x => x.setIndex + 1))
      for (let i = 0; i < n; i++) {
        const set = logged.find(x => x.setIndex === i && !x.isDropSet)
        ops.push({ kind: 'set', clientId: newClientId(), date, sessionKey, exerciseKey: ex.key, setIndex: i, isDropSet: false, at,
          set: set ? { loadKg: set.loadKg, reps: set.reps, holdSeconds: set.holdSeconds, rir: set.rir, toFailure: set.toFailure } : null })
      }
      const drop = logged.find(x => x.isDropSet)
      if (drop) ops.push({ kind: 'set', clientId: newClientId(), date, sessionKey, exerciseKey: ex.key, setIndex: drop.setIndex, isDropSet: true, at,
        set: { loadKg: drop.loadKg, reps: drop.reps, holdSeconds: drop.holdSeconds, rir: drop.rir, toFailure: drop.toFailure } })
    }
    ops.push({
      kind: 'finish', clientId: newClientId(), date, sessionKey, at: at + 1,
      status: payload.status, skipReason: payload.skipReason, travelMode: payload.travelMode, durationMinutes: payload.durationMinutes,
      notes: payload.notes, duringPain: payload.duringPain, skippedExercises: payload.skippedExercises,
    })
    queueOps(ops)
    try { window.localStorage.removeItem(draftKey) } catch { /* ignore */ }
    toast("You're offline — the session is saved on this device and will sync when you're back online", 'info')
    router.push(healthHref({ tab: 'train' }))
  }

  const doneSets = Object.values(draft.sets).flat().filter(s => s.done).length
  const totalSets = exercises.filter(e => !e.safety.disabled).reduce((n, e) => n + e.rx.sets, 0)

  return (
    <div className="flex flex-col gap-3 pb-36 md:pb-24">
      <div className="flex items-start gap-2">
        <Link href={healthHref({ tab: 'train' })} aria-label="Back to Train" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--rule)] bg-white text-lg text-[var(--ink)]">‹</Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-[var(--ink)]">{props.sessionName}</h2>
          <p className="truncate text-xs text-[var(--ink-3)]">{props.focus} · {props.banner}{!props.isToday && <> · {date}</>}</p>
        </div>
        <button type="button" aria-label="More actions" onClick={() => setMenuOpen(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl text-[var(--ink-2)] hover:bg-[var(--paper-2)]">⋯</button>
      </div>

      <div className="flex items-center gap-3">
        <svg className="block h-2 w-full overflow-hidden rounded-full" role="presentation" aria-hidden="true">
          <rect width="100%" height="100%" rx="4" className="fill-[var(--paper-3)]" />
          <rect width={`${totalSets ? Math.round((Math.min(doneSets, totalSets) / totalSets) * 100) : 0}%`} height="100%" rx="4" className="fill-green-600" />
        </svg>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--ink-2)]">{doneSets}/{totalSets} sets</span>
      </div>

      {draft.travel && <p className="text-xs font-semibold text-teal-800">✈ Travel mode · hotel swaps shown</p>}
      {props.warnings.map(w => <p key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">! {w}</p>)}
      <OfflineSyncBanner />
      {stored && !touched && !dismissed && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-1 text-sm text-blue-900">
          <span>Unsaved sets on this device.</span>
          <button type="button" className="min-h-11 font-bold underline" onClick={restoreStored}>Restore</button>
          <button type="button" className="min-h-11 underline" onClick={discardStored}>Discard</button>
        </div>
      )}

      {groups.map(group => (
        <div key={group.map(g => g.key).join('+')} className={group.length > 1 ? 'rounded-2xl border-2 border-[var(--blue-700)]/30 bg-[var(--blue-50)] p-1.5' : ''}>
          {group.length > 1 && <p className="px-2 pb-1.5 pt-0.5 text-xs font-bold text-[var(--blue-700)]">Superset · rest after both</p>}
          <div className="flex flex-col gap-2">
            {group.map(ex => {
              const name = draft.travel && ex.travelName ? ex.travelName : ex.name
              const video = draft.travel && ex.travelName && ex.travelVideoUrl ? ex.travelVideoUrl : ex.videoUrl
              const list = draft.sets[ex.key] ?? []
              const finalIdx = ex.rx.sets - 1
              const finalSet = list[finalIdx]
              const finalLoad = finalSet ? toNum(finalSet.load) : null
              const cols = ex.usesLoad ? 'grid-cols-[1.75rem_minmax(0,1fr)_4.25rem_3.75rem_2.75rem]' : 'grid-cols-[1.75rem_minmax(0,1fr)_4.25rem_2.75rem]'
              const effort = effortText(ex.rx.rir)
              return (
                <section key={ex.key} className={`rounded-xl border border-[var(--rule)] bg-white px-3 pb-2 pt-2 ${ex.safety.disabled ? 'opacity-70' : ''}`} aria-labelledby={`ex-${ex.key}`}>
                  <div className="flex items-start gap-1">
                    <div className="min-w-0 flex-1 pt-1.5">
                      <h3 id={`ex-${ex.key}`} className="text-base font-bold leading-snug text-[var(--ink)]">
                        {name}
                        {ex.isUnlock && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 align-middle text-[10px] font-bold uppercase text-green-800">Unlocked</span>}
                      </h3>
                      <p className="text-xs text-[var(--ink-3)]">
                        {ex.rx.sets} × {ex.rx.target}{ex.perSide && ' / side'}{ex.rx.restSeconds ? ` · rest ${fmtRest(ex.rx.restSeconds)}` : ''}
                      </p>
                    </div>
                    <InfoPopover label={`About ${name}`}>
                      <p className="font-semibold text-[var(--ink)]">{name}</p>
                      <ul className="mt-1 flex list-none flex-col gap-1 p-0 text-xs">
                        {effort && <li>Effort: {effort}</li>}
                        {ex.tempo && <li>Tempo {ex.tempo}</li>}
                        {ex.rx.notes.map(n => <li key={n}>{n}</li>)}
                        {ex.notes && <li>{ex.notes}</li>}
                        {ex.last && <li>Last time ({ex.last.date}): {ex.last.sets.map(formatLoggedSet).join(' · ')}</li>}
                      </ul>
                      <p className="mt-2 flex gap-4 text-sm font-semibold">
                        <a href={video} target="_blank" rel="noopener noreferrer" className="text-[var(--blue-700)] underline">Video ↗</a>
                        <Link href={healthHref({ tab: 'train', exercise: ex.key })} className="text-[var(--blue-700)] underline">History</Link>
                      </p>
                    </InfoPopover>
                  </div>
                  {ex.suggestion && ex.suggestion.kind !== 'none' && (
                    <p className="mt-1"><span className="inline-block rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-800">↑ {ex.suggestion.message}</span></p>
                  )}
                  {ex.safety.warning && (
                    <p className={`mt-1 rounded-lg px-3 py-2 text-xs ${ex.safety.disabled ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'}`} role={ex.safety.disabled ? 'alert' : undefined}>
                      {ex.safety.disabled ? '▲ Paused: ' : '! '}{ex.safety.warning}
                    </p>
                  )}

                  {!ex.safety.disabled && (
                    <div className="mt-1">
                      <div aria-hidden="true" className={`grid ${cols} items-center gap-1.5 px-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-3)]`}>
                        <span>Set</span>
                        <span>Previous</span>
                        {ex.usesLoad && <span className="text-center">kg</span>}
                        <span className="text-center">{ex.rx.kind === 'reps' ? 'Reps' : 'Secs'}</span>
                        <span className="text-center"><span aria-hidden="true">✓</span><span className="sr-only">Done</span></span>
                      </div>
                      {list.map((s, i) => {
                        const isLast = i === finalIdx
                        const prev = ex.last ? prefillSet(ex.last.sets, i, null).previous : null
                        const eff = effortOf(s.rir, s.failure)
                        return (
                          <div key={i} className={`rounded-lg ${s.done ? 'bg-green-50' : ''}`}>
                            <div className={`grid ${cols} items-center gap-1.5 px-0.5 py-1`}>
                              <span className="text-sm font-bold text-[var(--ink-2)]">{i + 1}{i >= ex.rx.sets ? '+' : ''}</span>
                              <span className="truncate text-xs text-[var(--ink-3)]">{prev ?? '—'}</span>
                              {ex.usesLoad && (
                                <input className={`${INPUT} px-1 text-center`} inputMode="decimal" value={s.load} onChange={e => updateSet(ex.key, i, { load: e.target.value })} aria-label={`Set ${i + 1} load in kg`} />
                              )}
                              {ex.rx.kind === 'reps' ? (
                                <input className={`${INPUT} px-1 text-center`} inputMode="numeric" placeholder={ex.rx.reps ? String(ex.rx.reps.max) : ''} value={s.reps} onChange={e => updateSet(ex.key, i, { reps: e.target.value })} aria-label={`Set ${i + 1} reps`} />
                              ) : (
                                <input className={`${INPUT} px-1 text-center`} inputMode="numeric" placeholder={String(ex.rx.holdSeconds ?? '')} value={s.hold} onChange={e => updateSet(ex.key, i, { hold: e.target.value })} aria-label={`Set ${i + 1} seconds held`} />
                              )}
                              <button
                               
                                type="button"
                                onClick={() => completeSet(ex, group, i)}
                                className={`grid h-11 w-11 place-items-center rounded-lg text-lg font-bold ${s.done ? 'bg-green-600 text-white' : 'border border-[var(--rule)] bg-[var(--paper-2)] text-[var(--ink-3)]'}`}
                                aria-pressed={s.done}
                                aria-label={`Set ${i + 1} done`}
                              >
                                ✓
                              </button>
                            </div>
                            {s.done && ex.rx.kind === 'reps' && (
                              eff === null ? (
                                <div className="flex flex-wrap items-center gap-1 px-0.5 pb-1.5" role="group" aria-label={`Set ${i + 1} effort`}>
                                  {EFFORT_OPTIONS.map(o => (
                                    <button key={o.key} type="button" title={o.hint}
                                      onClick={() => updateSet(ex.key, i, { rir: o.rir, failure: o.failure })}
                                      className={`min-h-9 flex-1 rounded-full border px-2 text-xs font-semibold ${o.key === 'failure' ? 'border-red-200 text-red-800' : 'border-[var(--rule)] bg-white text-[var(--ink-2)]'}`}>
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <button type="button" onClick={() => updateSet(ex.key, i, { rir: null, failure: false })} className="min-h-8 px-1 pb-1 text-xs text-[var(--ink-3)]">
                                  Effort: <strong className={eff === 'failure' ? 'text-red-800' : 'text-[var(--ink-2)]'}>{EFFORT_OPTIONS.find(o => o.key === eff)?.label}</strong> · change
                                </button>
                              )
                            )}
                            {isLast && ex.rx.lastSetToFailure && !s.done && <p className="px-0.5 pb-1 text-xs font-semibold text-red-800">Last set: to failure</p>}
                            {isLast && ex.rx.dropSetOnFinalSet && (
                              <div className="mb-1 flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-2 py-1.5">
                                <span className="text-xs font-semibold text-blue-900">Drop set −30%{finalLoad ? ` (≈ ${dropSetLoad(finalLoad)} kg)` : ''}</span>
                                <label className="ml-auto flex items-center gap-1 text-xs text-blue-900">kg
                                  <input className={`${INPUT} w-16 px-1 text-center`} inputMode="decimal" placeholder={finalLoad ? String(dropSetLoad(finalLoad)) : ''}
                                    value={draft.drops[ex.key]?.load ?? ''}
                                    onChange={e => setDraft(d => ({ ...d, drops: { ...d.drops, [ex.key]: { load: e.target.value, reps: d.drops[ex.key]?.reps ?? '' } } }))} />
                                </label>
                                <label className="flex items-center gap-1 text-xs text-blue-900">reps
                                  <input className={`${INPUT} w-14 px-1 text-center`} inputMode="numeric"
                                    value={draft.drops[ex.key]?.reps ?? ''}
                                    onChange={e => setDraft(d => ({ ...d, drops: { ...d.drops, [ex.key]: { load: d.drops[ex.key]?.load ?? (finalLoad ? String(dropSetLoad(finalLoad)) : ''), reps: e.target.value } } }))} />
                                </label>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {!ex.safety.disabled && list.length < ex.rx.sets + 2 && (
                    <button type="button" onClick={() => addSet(ex)} className="mt-1 min-h-11 w-full rounded-lg bg-[var(--paper-2)] text-sm font-semibold text-[var(--ink-2)]">+ Add set</button>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      ))}

      <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-4">
        <div className="mx-auto flex max-w-[928px] flex-col gap-2">
          {rest && (
            <div className="flex items-center gap-2 rounded-full bg-[var(--ink)] py-1 pl-4 pr-1 text-white shadow-lg" role="status" aria-live="polite">
              <span className="min-w-0 flex-1 truncate text-sm">Rest · {rest.label}</span>
              <strong className="w-14 text-center text-lg tabular-nums">{restLeft > 0 ? fmtRest(restLeft) : 'Go!'}</strong>
              <button type="button" className="h-11 rounded-full bg-white/15 px-3 text-xs font-bold" onClick={() => adjustRest(-15)} aria-label="15 seconds less">−15</button>
              <button type="button" className="h-11 rounded-full bg-white/15 px-3 text-xs font-bold" onClick={() => adjustRest(15)} aria-label="15 seconds more">+15</button>
              <button type="button" className="h-11 rounded-full bg-white/25 px-3 text-xs font-bold" onClick={() => setRest(null)}>{restLeft > 0 ? 'Skip' : 'Close'}</button>
            </div>
          )}
          <button type="button" className={`${BUTTON_PRIMARY} w-full shadow-lg`} disabled={saving} onClick={() => setFinishOpen(true)}>
            Finish workout
          </button>
        </div>
      </div>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={props.sessionName}>
        <div className="flex flex-col gap-1">
          <label className={`${MENU_ITEM} justify-between`}>
            <span>✈ Travel mode <span className="block text-xs font-normal text-[var(--ink-3)]">Hotel swaps, same sets and reps</span></span>
            <input type="checkbox" checked={draft.travel} onChange={e => setDraft(d => ({ ...d, travel: e.target.checked }))} className="h-5 w-5" />
          </label>
          <button type="button" className={MENU_ITEM} onClick={() => { setMenuOpen(false); setSkipOpen(true); setFinishOpen(true) }}>Skip this session…</button>
          <Link href={healthHref({ tab: 'train' })} className={MENU_ITEM}>Back to Train</Link>
        </div>
      </BottomSheet>

      <BottomSheet open={finishOpen} onClose={() => { setFinishOpen(false); setSkipOpen(false) }} title={skipOpen ? 'Skip session' : 'Finish workout'}>
        {skipOpen ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reason">
              {SKIP_REASONS.map(r => (
                <button key={r} type="button" aria-pressed={skipReason === r} onClick={() => setSkipReason(r)}
                  className={`min-h-11 rounded-full px-3 text-sm font-semibold ${skipReason === r ? 'bg-[var(--blue-700)] text-white' : 'border border-[var(--rule)] text-[var(--ink-2)]'}`}>
                  {r}
                </button>
              ))}
            </div>
            <input className={INPUT} maxLength={200} placeholder="Details (optional)" value={skipText} onChange={e => setSkipText(e.target.value)} />
            <div className="flex justify-between gap-2">
              <button type="button" className={BUTTON_SECONDARY} onClick={() => setSkipOpen(false)}>Back</button>
              <button type="button" className={BUTTON_PRIMARY} disabled={saving} onClick={() => save('skipped')}>Mark skipped</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--ink-2)]"><strong className="text-[var(--ink)]">{doneSets}/{totalSets}</strong> sets done</p>
            {painCheck && (
              <div id="pain-score">
                <p className={LABEL}>Joint pain (0–10){painThreshold !== null && <> · OK ≤ {painThreshold}</>}</p>
                <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11" role="group" aria-label="Pain score 0 to 10">
                  {Array.from({ length: 11 }, (_, v) => (
                    <button key={v} type="button" aria-pressed={draft.pain === v} onClick={() => setDraft(d => ({ ...d, pain: v }))}
                      className={`h-11 rounded-full text-sm font-bold ${draft.pain === v ? (painThreshold !== null && v > painThreshold ? 'bg-red-700 text-white' : 'bg-[var(--blue-700)] text-white') : 'border border-[var(--rule)] text-[var(--ink-2)]'}`}>
                      {v}
                    </button>
                  ))}
                </div>
                {painThreshold !== null && draft.pain !== null && draft.pain > painThreshold && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">! Next session will ask you to shorten the range or lighten the load.</p>
                )}
              </div>
            )}
            <label className="block">
              <span className={LABEL}>Notes</span>
              <textarea className={INPUT} rows={2} maxLength={1000} value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Optional" />
            </label>
            <button type="button" className={`${BUTTON_PRIMARY} w-full`} disabled={saving} onClick={() => save('done')}>{saving ? 'Saving…' : 'Finish'}</button>
            <div className="flex justify-between gap-2">
              <button type="button" className={BUTTON_SECONDARY} disabled={saving} onClick={() => save('partial')}>Save as partial</button>
              <button type="button" className="min-h-11 px-2 text-sm font-semibold text-[var(--ink-3)]" onClick={() => setSkipOpen(true)}>Skip session</button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

/** Ask once (inside the ✓ tap) so the rest timer can notify when the screen is off. */
function askNotificationPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
  } catch { /* not supported */ }
}

function notifyRestOver(label: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return
    const body = `Next set: ${label}`
    void navigator.serviceWorker?.getRegistration().then(reg => {
      if (reg) return reg.showNotification('Rest over', { body, tag: 'rest-timer' })
      new Notification('Rest over', { body, tag: 'rest-timer' })
    }).catch(() => { /* ignore */ })
  } catch { /* not supported */ }
}
