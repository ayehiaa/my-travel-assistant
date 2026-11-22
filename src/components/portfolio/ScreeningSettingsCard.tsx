'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import {
  describeScreeningConfig,
  effectiveScreeningConfig,
  screeningModeLabel,
  screeningWeakenings,
  type ScreeningSettings,
} from '@/lib/screeningConfig'
import { SETTINGS_CARD, SETTINGS_CARD_TITLE } from './settingsCard'

interface Props {
  initial: ScreeningSettings
  /** False when the screening_settings column does not exist yet (migration 20261122e not applied). */
  migrationApplied: boolean
}

function Toggle({
  id, label, help, checked, disabled, onChange,
}: {
  id: string
  label: string
  help: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-semibold text-[var(--ink)]">{label}</label>
        <p id={`${id}-help`} className="text-xs text-[var(--ink-3)]">{help}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-help`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed ${
          checked ? 'bg-[var(--blue-700)]' : 'bg-gray-300'
        }`}
      >
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  )
}

/**
 * Islamic screening settings (specs/030): master toggle, business / financial sub-toggles (greyed while the master is
 * off) and an independent "Individual stocks only" toggle. Any change that turns a check off is confirmed in a dialog.
 */
export default function ScreeningSettingsCard({ initial, migrationApplied }: Props) {
  const toast = useToast()
  const router = useRouter()
  const [saved, setSaved] = useState<ScreeningSettings>(initial)
  const [draft, setDraft] = useState<ScreeningSettings>(initial)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState<string | null>(
    migrationApplied
      ? null
      : 'The screening database migration has not been applied yet: Islamic screening stays fully on and changes cannot be saved.',
  )
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
  }, [confirming])

  const dirty = (Object.keys(draft) as Array<keyof ScreeningSettings>).some(k => draft[k] !== saved[k])
  const weakenings = screeningWeakenings(saved, draft)
  const savedCfg = effectiveScreeningConfig(saved)
  const draftCfg = effectiveScreeningConfig(draft)
  const noPartSelected = draft.islamic_enabled && !draft.business_screen && !draft.financial_screen

  function set<K extends keyof ScreeningSettings>(key: K, value: ScreeningSettings[K]) {
    setDraft(d => ({ ...d, [key]: value }))
  }

  async function save(confirmed: boolean) {
    setBusy(true)
    try {
      const res = await fetch('/api/portfolio/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ screening_settings: draft, ...(confirmed ? { screening_confirm: true } : {}) }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; screening_settings_warning?: string | null }
      if (!res.ok) {
        toast(data.error ?? 'Failed to save screening settings', 'error')
        return
      }
      if (data.screening_settings_warning) {
        setWarning(data.screening_settings_warning)
        toast('Screening settings could not be saved', 'error')
        return
      }
      setSaved(draft)
      setConfirming(false)
      toast('Screening settings saved — they apply to the next analysis and to every buy from now on', 'success')
      router.refresh()
    } catch {
      toast('Failed to save screening settings', 'error')
    } finally {
      setBusy(false)
    }
  }

  function onSave() {
    if (weakenings.length > 0) setConfirming(true)
    else void save(false)
  }

  return (
    <section className={SETTINGS_CARD} aria-labelledby="islamic-screening-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="islamic-screening-heading" className={SETTINGS_CARD_TITLE}>Islamic screening</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            savedCfg.islamic && savedCfg.business && savedCfg.financial
              ? 'bg-green-100 text-green-700'
              : savedCfg.islamic ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {screeningModeLabel(savedCfg)}
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--ink-2)]">
        Applies to every analysis (agents, AI reviewer, allocation) and is checked again before every buy. Holdings that
        fail an active screen are recommended for sale. Max 20% per stock always applies.
      </p>

      {warning && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{warning}</p>
      )}

      <div className="mt-4 space-y-4">
        <Toggle
          id="screen-islamic"
          label="Islamic screening"
          help="Only Shariah-compliant investments (AAOIFI-style screening of every ticker)."
          checked={draft.islamic_enabled}
          onChange={v => set('islamic_enabled', v)}
        />
        <div className="space-y-4 border-l-2 border-[var(--rule)] pl-4">
          <Toggle
            id="screen-business"
            label="Business activity"
            help="Blocks conventional banking / insurance, alcohol, pork, tobacco, gambling, adult entertainment, weapons."
            checked={draft.business_screen}
            disabled={!draft.islamic_enabled}
            onChange={v => set('business_screen', v)}
          />
          <Toggle
            id="screen-financial"
            label="Financial ratios"
            help="Debt, cash + interest-bearing securities and receivables each under 30% of market cap; non-permissible income under 5%."
            checked={draft.financial_screen}
            disabled={!draft.islamic_enabled}
            onChange={v => set('financial_screen', v)}
          />
        </div>
        <Toggle
          id="screen-stocks-only"
          label="Individual stocks only"
          help="Common stocks only — no ETFs, funds, bonds or preferred shares. Works with or without Islamic screening."
          checked={draft.stocks_only}
          onChange={v => set('stocks_only', v)}
        />
      </div>

      {noPartSelected && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          With neither part selected, Islamic screening is effectively off.
        </p>
      )}

      <p className="mt-4 text-xs text-[var(--ink-3)]">{describeScreeningConfig(dirty ? draftCfg : savedCfg)}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || busy}
          className="rounded-lg bg-[var(--blue-700)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save screening'}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => setDraft(saved)}
            disabled={busy}
            className="rounded-lg border border-[var(--rule)] px-4 py-2 text-sm font-semibold text-[var(--ink-2)]"
          >
            Cancel
          </button>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 md:items-center">
          <button type="button" aria-label="Cancel" className="absolute inset-0 bg-black/40" onClick={() => setConfirming(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="screening-confirm-title"
            aria-describedby="screening-confirm-body"
            className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <h4 id="screening-confirm-title" className="text-base font-semibold text-[var(--ink)]">
              {draftCfg.islamic ? 'Reduce screening?' : 'Turn Islamic screening off?'}
            </h4>
            <div id="screening-confirm-body" className="mt-2 space-y-2 text-sm text-[var(--ink-2)]">
              <p>Buys will no longer be checked for:</p>
              <ul className="list-disc space-y-1 pl-5">
                {weakenings.map(w => <li key={w}>{w}</li>)}
              </ul>
              <p>
                Future analyses will no longer exclude or sell holdings for these reasons.
                {draftCfg.islamic || draftCfg.stocks_only
                  ? ' The remaining checks still apply.'
                  : ' No screening will apply at all.'}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-[var(--rule)] px-4 py-2 text-sm font-semibold text-[var(--ink-2)]"
              >
                Keep screening
              </button>
              <button
                type="button"
                onClick={() => void save(true)}
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Confirm change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
