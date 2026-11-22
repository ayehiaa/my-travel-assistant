'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import type { ProgrammeDefinition } from '@/lib/health/programmeSchema'
import {
  ACTIVITY_LABELS, ACTIVITY_LEVELS, ProfileSchema, TARGET_KEYS, TARGET_LABELS, computeTargets,
  type ActivityLevel, type TargetKey, type TargetOverrides,
} from '@/lib/health/targets'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, INPUT, LABEL } from './ui'

interface Template { key: string; definition: ProgrammeDefinition }

const UNITS: Record<TargetKey, string> = {
  kcal: 'kcal', proteinG: 'g', fatG: 'g', satFatTargetG: 'g', satFatCeilingG: 'g', carbsG: 'g', fibreMinG: 'g',
}

/** Enrolment (specs/029 US1): template → profile → targets with formulas (editable) → start date → active. */
export default function EnrolmentWizard({ templates, today }: { templates: Template[]; today: string }) {
  const toast = useToast()
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? '')
  const [sex, setSex] = useState<'male' | 'female'>('male')
  const [age, setAge] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate')
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London' } catch { return 'Europe/London' }
  })
  const [overrides, setOverrides] = useState<Partial<Record<TargetKey, string>>>({})
  const [startDate, setStartDate] = useState(today)
  const [saving, setSaving] = useState(false)

  const template = templates.find(t => t.key === templateKey) ?? null
  const profile = ProfileSchema.safeParse({
    sex, age: Number(age), heightCm: Number(heightCm), weightKg: Number(weightKg), activityLevel, timezone,
  })
  const parsedOverrides = useMemo(() => {
    const o: TargetOverrides = {}
    for (const k of TARGET_KEYS) {
      const v = overrides[k]
      if (v !== undefined && v !== '' && Number.isFinite(Number(v))) o[k] = Number(v)
    }
    return o
  }, [overrides])
  const computed = template && profile.success ? computeTargets(template.definition, profile.data, parsedOverrides) : null

  async function activate() {
    if (!template || !profile.success) return
    setSaving(true)
    try {
      const res = await fetch('/api/health/enrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateKey, profile: profile.data, overrides: parsedOverrides, startDate }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not start the programme', 'error'); return }
      toast('Programme started', 'success')
      router.refresh()
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`${CARD} mx-auto max-w-2xl`}>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">Step {step} of 4</p>

      {step === 1 && (
        <>
          <h2 className="mb-3 text-lg font-bold text-[var(--ink)]">Choose a programme</h2>
          <div className="flex flex-col gap-2">
            {templates.map(t => (
              <label key={t.key} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${templateKey === t.key ? 'border-[var(--blue-700)] bg-blue-50' : 'border-[var(--rule)]'}`}>
                <input type="radio" name="template" checked={templateKey === t.key} onChange={() => setTemplateKey(t.key)} className="mt-1" />
                <span>
                  <strong className="text-[var(--ink)]">{t.definition.identity.name}</strong>
                  <span className="ml-1 text-xs text-[var(--ink-3)]">{t.definition.identity.durationWeeks} weeks</span>
                  <span className="block text-sm text-[var(--ink-2)]">{t.definition.identity.description}</span>
                </span>
              </label>
            ))}
          </div>
          {template?.definition.identity.disclaimer && <p className="mt-3 text-xs text-[var(--ink-3)]">{template.definition.identity.disclaimer}</p>}
          <div className="mt-4 flex justify-end"><button type="button" className={BUTTON_PRIMARY} disabled={!template} onClick={() => setStep(2)}>Next</button></div>
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="mb-1 text-lg font-bold text-[var(--ink)]">About you</h2>
          <p className="mb-3 text-sm text-[var(--ink-2)]">Used only to personalise your targets (e.g. protein per kg of body weight).</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="m-0 border-0 p-0">
              <legend className={LABEL}>Sex</legend>
              <div className="flex gap-4 text-sm">
                {(['male', 'female'] as const).map(s => (
                  <label key={s} className="flex items-center gap-1.5"><input type="radio" checked={sex === s} onChange={() => setSex(s)} />{s === 'male' ? 'Male' : 'Female'}</label>
                ))}
              </div>
            </fieldset>
            <label><span className={LABEL}>Age</span><input className={INPUT} inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} placeholder="40" /></label>
            <label><span className={LABEL}>Height (cm)</span><input className={INPUT} inputMode="decimal" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="180" /></label>
            <label><span className={LABEL}>Weight (kg)</span><input className={INPUT} inputMode="decimal" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="80.5" /></label>
            <label className="sm:col-span-2"><span className={LABEL}>Activity</span>
              <select className={INPUT} value={activityLevel} onChange={e => setActivityLevel(e.target.value as ActivityLevel)}>
                {ACTIVITY_LEVELS.map(a => <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>)}
              </select>
            </label>
            <label className="sm:col-span-2"><span className={LABEL}>Timezone (day boundaries)</span>
              <input className={INPUT} value={timezone} onChange={e => setTimezone(e.target.value.trim())} />
            </label>
          </div>
          {!profile.success && (age || heightCm || weightKg) && (
            <p className="mt-2 text-xs text-red-700">{profile.error.issues[0]?.path.join('.')}: {profile.error.issues[0]?.message}</p>
          )}
          <div className="mt-4 flex justify-between">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setStep(1)}>Back</button>
            <button type="button" className={BUTTON_PRIMARY} disabled={!profile.success} onClick={() => setStep(3)}>Next</button>
          </div>
        </>
      )}

      {step === 3 && computed && (
        <>
          <h2 className="mb-1 text-lg font-bold text-[var(--ink)]">Your daily targets</h2>
          <p className="mb-3 text-sm text-[var(--ink-2)]">Calculated from your profile — the formula is shown under each. Type a number to override it.</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {TARGET_KEYS.map(k => (
              <li key={k} className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--rule-soft)] pb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[var(--ink)]">{TARGET_LABELS[k]}: {computed.targets[k]} {UNITS[k]}</div>
                  <div className="text-xs text-[var(--ink-3)]">{computed.formulas[k]}</div>
                </div>
                <input
                  aria-label={`Override ${TARGET_LABELS[k]}`}
                  className={`${INPUT} w-24`}
                  inputMode="decimal"
                  placeholder="override"
                  value={overrides[k] ?? ''}
                  onChange={e => setOverrides(prev => ({ ...prev, [k]: e.target.value }))}
                />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setStep(2)}>Back</button>
            <button type="button" className={BUTTON_PRIMARY} onClick={() => setStep(4)}>Next</button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <h2 className="mb-1 text-lg font-bold text-[var(--ink)]">Start date</h2>
          <p className="mb-3 text-sm text-[var(--ink-2)]">Week 1 starts on this date. You can pick a past date if you have already started.</p>
          <input type="date" className={`${INPUT} max-w-xs`} value={startDate} onChange={e => setStartDate(e.target.value)} />
          <div className="mt-4 flex justify-between">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setStep(3)}>Back</button>
            <button type="button" className={BUTTON_PRIMARY} disabled={saving || !startDate || !computed} onClick={activate}>
              {saving ? 'Starting…' : 'Start programme'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
