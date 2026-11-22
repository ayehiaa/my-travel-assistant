'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { healthHref } from '@/lib/health/healthHub'
import {
  dropSetLoad, formatLoggedSet, RIR_VALUES, type LoggedSet, type Prescription, type ProgressionSuggestion,
} from '@/lib/health/training'
import type { ExerciseSafety } from '@/lib/health/painRules'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_TITLE, INPUT, LABEL } from './ui'

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
    sets[ex.key] = Array.from({ length: n }, (_, i) => (saved[i] ? fromSaved(saved[i]) : emptySet(ex.usesLoad ? ex.startLoad : null)))
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

/** Guided session player (specs/029 US5): prescriptions, last time, per-set inputs, RIR, rest timer, supersets,
 *  drop-set prompt, travel variants, pain score, finish / partial / skip. Draft autosaves in this browser. */
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
      const prevLoad = list[list.length - 1]?.load ?? ''
      return { ...d, sets: { ...d.sets, [ex.key]: [...list, { ...emptySet(null), load: prevLoad }] } }
    })
  }

  function completeSet(ex: PlayerExercise, group: PlayerExercise[], i: number) {
    const s = draft.sets[ex.key][i]
    const hasValue = ex.rx.kind === 'hold' ? toInt(s.hold) !== null : toInt(s.reps) !== null
    if (!hasValue) { toast(ex.rx.kind === 'hold' ? 'Enter the seconds held' : 'Enter the reps', 'error'); return }
    updateSet(ex.key, i, { done: !s.done })
    if (s.done) return
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
      document.getElementById('pain-score')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/health/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(status)),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not save the session', 'error'); return }
      try { window.localStorage.removeItem(draftKey) } catch { /* ignore */ }
      toast(status === 'skipped' ? 'Session marked as skipped' : status === 'done' ? 'Session saved — well done' : 'Saved as partial', 'success')
      router.push(healthHref({ tab: 'training' }))
      router.refresh()
    } catch {
      toast('Network error — your sets are kept on this device; try again', 'error')
    } finally {
      setSaving(false)
    }
  }

  const doneSets = Object.values(draft.sets).flat().filter(s => s.done).length
  const totalSets = exercises.filter(e => !e.safety.disabled).reduce((n, e) => n + e.rx.sets, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={healthHref({ tab: 'training' })} className="text-sm font-semibold text-[var(--blue-700)] underline">← Training</Link>
            <h2 className="mt-1 text-xl font-bold text-[var(--ink)]">{props.sessionName} <span className="font-normal text-[var(--ink-3)]">· {props.focus}</span></h2>
            <p className="text-sm text-[var(--ink-2)]">{props.banner}{!props.isToday && <> · logging for {date}</>}</p>
          </div>
          <label className="flex items-center gap-2 rounded-full border border-[var(--rule)] px-3 py-1.5 text-sm font-semibold text-[var(--ink)]">
            <input type="checkbox" checked={draft.travel} onChange={e => setDraft(d => ({ ...d, travel: e.target.checked }))} className="h-4 w-4" />
            Travel mode
          </label>
        </div>
        {draft.travel && <p className="mt-2 text-xs text-[var(--ink-3)]">Hotel variants shown where the programme has one — same sets, reps and RIR.</p>}
        {props.warnings.map(w => <p key={w} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{w}</p>)}
        <p className="mt-2 text-xs text-[var(--ink-3)]">{doneSets} of {totalSets} sets done</p>
        {stored && !touched && !dismissed && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <span>Unsaved sets from earlier on this device.</span>
            <button type="button" className="font-bold underline" onClick={restoreStored}>Restore</button>
            <button type="button" className="underline" onClick={discardStored}>Discard</button>
          </div>
        )}
      </div>

      {groups.map(group => (
        <div key={group.map(g => g.key).join('+')} className={group.length > 1 ? 'rounded-xl border-2 border-dashed border-[var(--blue-700)]/40 p-2' : ''}>
          {group.length > 1 && <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-[var(--blue-700)]">Superset — no rest between these, rest after the pair</p>}
          <div className="flex flex-col gap-3">
            {group.map(ex => {
              const name = draft.travel && ex.travelName ? ex.travelName : ex.name
              const video = draft.travel && ex.travelName && ex.travelVideoUrl ? ex.travelVideoUrl : ex.videoUrl
              const list = draft.sets[ex.key] ?? []
              const finalIdx = ex.rx.sets - 1
              const finalSet = list[finalIdx]
              const finalLoad = finalSet ? toNum(finalSet.load) : null
              return (
                <section key={ex.key} className={`${CARD} ${ex.safety.disabled ? 'opacity-70' : ''}`} aria-labelledby={`ex-${ex.key}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 id={`ex-${ex.key}`} className="text-base font-bold text-[var(--ink)]">
                      {name}
                      {ex.isUnlock && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-800">Unlocked</span>}
                    </h3>
                    <a href={video} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[var(--blue-700)] underline">Video ↗</a>
                  </div>
                  <p className="mt-1 text-sm text-[var(--ink)]">
                    <strong>{ex.rx.sets} × {ex.rx.target}</strong>{ex.perSide && ' per side'}
                    {ex.rx.rir && <> · RIR {ex.rx.rir}</>}
                    {ex.rx.restSeconds ? <> · rest {fmtRest(ex.rx.restSeconds)}</> : null}
                    {ex.tempo && <> · tempo {ex.tempo}</>}
                  </p>
                  {ex.rx.notes.map(n => <p key={n} className="mt-1 text-xs font-semibold text-[var(--blue-700)]">{n}</p>)}
                  {ex.notes && <p className="mt-1 text-xs text-[var(--ink-3)]">{ex.notes}</p>}
                  {ex.safety.warning && (
                    <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${ex.safety.disabled ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'}`} role={ex.safety.disabled ? 'alert' : undefined}>
                      {ex.safety.disabled ? 'Paused: ' : ''}{ex.safety.warning}
                    </p>
                  )}
                  {ex.last && (
                    <p className="mt-2 text-xs text-[var(--ink-2)]">
                      <span className="font-semibold">Last time ({ex.last.date}):</span> {ex.last.sets.map(formatLoggedSet).join(' · ')}
                    </p>
                  )}
                  {ex.suggestion && ex.suggestion.kind !== 'none' && (
                    <p className="mt-1 text-xs font-semibold text-green-800">{ex.suggestion.message}</p>
                  )}

                  {!ex.safety.disabled && (
                    <ol className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
                      {list.map((s, i) => {
                        const isLast = i === finalIdx
                        return (
                          <li key={i} className={`rounded-lg border p-2 ${s.done ? 'border-green-600 bg-green-50' : 'border-[var(--rule)]'}`}>
                            <div className="flex flex-wrap items-end gap-2">
                              <span className="w-12 shrink-0 text-xs font-bold text-[var(--ink-3)]">Set {i + 1}{i >= ex.rx.sets ? ' +' : ''}</span>
                              {ex.usesLoad && (
                                <label className="w-20">
                                  <span className={LABEL}>kg</span>
                                  <input className={INPUT} inputMode="decimal" value={s.load} onChange={e => updateSet(ex.key, i, { load: e.target.value })} aria-label={`Set ${i + 1} load in kg`} />
                                </label>
                              )}
                              {ex.rx.kind === 'reps' ? (
                                <label className="w-20">
                                  <span className={LABEL}>Reps</span>
                                  <input className={INPUT} inputMode="numeric" placeholder={ex.rx.reps ? String(ex.rx.reps.max) : ''} value={s.reps} onChange={e => updateSet(ex.key, i, { reps: e.target.value })} aria-label={`Set ${i + 1} reps`} />
                                </label>
                              ) : (
                                <label className="w-20">
                                  <span className={LABEL}>Secs</span>
                                  <input className={INPUT} inputMode="numeric" placeholder={String(ex.rx.holdSeconds ?? '')} value={s.hold} onChange={e => updateSet(ex.key, i, { hold: e.target.value })} aria-label={`Set ${i + 1} seconds held`} />
                                </label>
                              )}
                              <button
                                type="button"
                                onClick={() => completeSet(ex, group, i)}
                                className={`ml-auto rounded-full px-4 py-2 text-sm font-bold ${s.done ? 'bg-green-700 text-white' : 'border border-[var(--rule)] text-[var(--ink)]'}`}
                                aria-pressed={s.done}
                              >
                                {s.done ? '✓ Done' : 'Done'}
                              </button>
                            </div>
                            {ex.rx.kind === 'reps' && (
                              <div className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label={`Set ${i + 1} reps in reserve`}>
                                <span className="mr-1 text-xs text-[var(--ink-3)]">RIR</span>
                                {RIR_VALUES.map(v => (
                                  <button key={v} type="button" aria-pressed={!s.failure && s.rir === v}
                                    onClick={() => updateSet(ex.key, i, { rir: v, failure: false })}
                                    className={`h-8 min-w-8 rounded-full px-2 text-sm font-semibold ${!s.failure && s.rir === v ? 'bg-[var(--blue-700)] text-white' : 'border border-[var(--rule)] text-[var(--ink-2)]'}`}>
                                    {v}
                                  </button>
                                ))}
                                <button type="button" aria-pressed={s.failure}
                                  onClick={() => updateSet(ex.key, i, { failure: !s.failure, rir: null })}
                                  className={`h-8 rounded-full px-3 text-sm font-semibold ${s.failure ? 'bg-red-700 text-white' : 'border border-[var(--rule)] text-[var(--ink-2)]'}`}>
                                  Failure
                                </button>
                                {isLast && ex.rx.lastSetToFailure && <span className="ml-1 text-xs font-semibold text-red-800">take this set to failure</span>}
                              </div>
                            )}
                            {isLast && ex.rx.dropSetOnFinalSet && (
                              <div className="mt-2 rounded-lg bg-blue-50 p-2">
                                <p className="text-xs font-semibold text-blue-900">
                                  Drop set: after this set, take 30% off{finalLoad ? ` (≈ ${dropSetLoad(finalLoad)} kg)` : ''} and go again to failure.
                                </p>
                                <div className="mt-1 flex gap-2">
                                  <label className="w-20"><span className={LABEL}>kg</span>
                                    <input className={INPUT} inputMode="decimal" placeholder={finalLoad ? String(dropSetLoad(finalLoad)) : ''}
                                      value={draft.drops[ex.key]?.load ?? ''}
                                      onChange={e => setDraft(d => ({ ...d, drops: { ...d.drops, [ex.key]: { load: e.target.value, reps: d.drops[ex.key]?.reps ?? '' } } }))} />
                                  </label>
                                  <label className="w-20"><span className={LABEL}>Reps</span>
                                    <input className={INPUT} inputMode="numeric"
                                      value={draft.drops[ex.key]?.reps ?? ''}
                                      onChange={e => setDraft(d => ({ ...d, drops: { ...d.drops, [ex.key]: { load: d.drops[ex.key]?.load ?? (finalLoad ? String(dropSetLoad(finalLoad)) : ''), reps: e.target.value } } }))} />
                                  </label>
                                </div>
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ol>
                  )}
                  {!ex.safety.disabled && list.length < ex.rx.sets + 2 && (
                    <button type="button" onClick={() => addSet(ex)} className="mt-2 text-sm font-semibold text-[var(--blue-700)] underline">+ Add a set</button>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      ))}

      {painCheck && (
        <section id="pain-score" className={CARD} aria-labelledby="pain-h">
          <h3 id="pain-h" className={CARD_TITLE}>Joint pain during the session</h3>
          <p className="mb-2 text-sm text-[var(--ink-2)]">0 = none, 10 = worst. {painThreshold !== null && <>Up to {painThreshold} is OK if it has settled by tomorrow morning.</>}</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Pain score 0 to 10">
            {Array.from({ length: 11 }, (_, v) => (
              <button key={v} type="button" aria-pressed={draft.pain === v} onClick={() => setDraft(d => ({ ...d, pain: v }))}
                className={`h-10 w-10 rounded-full text-sm font-bold ${draft.pain === v ? (painThreshold !== null && v > painThreshold ? 'bg-red-700 text-white' : 'bg-[var(--blue-700)] text-white') : 'border border-[var(--rule)] text-[var(--ink-2)]'}`}>
                {v}
              </button>
            ))}
          </div>
          {painThreshold !== null && draft.pain !== null && draft.pain > painThreshold && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Above {painThreshold}: next session the joint-watched exercises will ask you to shorten the range or reduce the load.</p>
          )}
        </section>
      )}

      <section className={CARD} aria-labelledby="finish-h">
        <h3 id="finish-h" className={CARD_TITLE}>Finish</h3>
        <label className="block">
          <span className={LABEL}>Notes (optional)</span>
          <textarea className={INPUT} rows={2} maxLength={1000} value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={BUTTON_PRIMARY} disabled={saving} onClick={() => save('done')}>{saving ? 'Saving…' : 'Finish — done'}</button>
          <button type="button" className={BUTTON_SECONDARY} disabled={saving} onClick={() => save('partial')}>Save as partial</button>
          <button type="button" className={BUTTON_SECONDARY} disabled={saving} onClick={() => setSkipOpen(o => !o)} aria-expanded={skipOpen}>Skip session</button>
        </div>
        {skipOpen && (
          <div className="mt-3 rounded-lg border border-[var(--rule)] p-3">
            <span className={LABEL}>Why are you skipping?</span>
            <div className="flex flex-wrap gap-1">
              {SKIP_REASONS.map(r => (
                <button key={r} type="button" aria-pressed={skipReason === r} onClick={() => setSkipReason(r)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${skipReason === r ? 'bg-[var(--blue-700)] text-white' : 'border border-[var(--rule)] text-[var(--ink-2)]'}`}>
                  {r}
                </button>
              ))}
            </div>
            <input className={`${INPUT} mt-2`} maxLength={200} placeholder="Details (optional)" value={skipText} onChange={e => setSkipText(e.target.value)} />
            <button type="button" className={`${BUTTON_SECONDARY} mt-2`} disabled={saving} onClick={() => save('skipped')}>Mark as skipped</button>
          </div>
        )}
      </section>

      {rest && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-[calc(100%-2rem)] max-w-md rounded-full bg-[var(--ink)] px-4 py-2 text-white shadow-lg md:bottom-6" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">Rest · {rest.label}</span>
            <strong className="text-lg tabular-nums">{restLeft > 0 ? fmtRest(restLeft) : 'Go!'}</strong>
            <button type="button" className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold" onClick={() => setRest(null)}>{restLeft > 0 ? 'Skip' : 'Close'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
