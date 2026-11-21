'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import {
  AUTOPILOT_CONFIRM_TEXT,
  RUN_INTERVALS,
  RUN_INTERVAL_LABELS,
  SCHEDULE_DESCRIPTION,
  autopilotChangeNeedsConfirm,
  formatRunTime,
  parseRunInterval,
  type AutopilotMode,
  type AutopilotSettings,
  type RunInterval,
} from '@/lib/schedule'
import { SETTINGS_CARD, SETTINGS_CARD_TITLE } from './settingsCard'

interface Props {
  initial: AutopilotSettings
  dryRun: boolean
  tradingPaused: boolean
}

const MODE_OPTIONS: Array<{ value: AutopilotMode; label: string; help: string }> = [
  { value: 'off',      label: 'Off',                 help: 'No scheduled runs. Run analyses manually, as before.' },
  { value: 'approval', label: 'Scheduled + approval', help: 'Runs on schedule. You approve each recommendation within 24 hours before anything is executed.' },
  { value: 'auto',     label: 'Fully automatic',      help: 'Runs on schedule and requests execution automatically, within your risk limits, pause and dry-run settings.' },
]

const labelClass = 'text-[11px] font-bold uppercase tracking-wider text-gray-500'

/** "Autopilot" settings card: mode, interval, schedule and next run. Self-contained (moves to the hub in phase 6). */
export default function AutopilotCard({ initial, dryRun, tradingPaused }: Props) {
  const toast = useToast()
  const router = useRouter()

  const [savedMode, setSavedMode] = useState<AutopilotMode>(initial.mode)
  const [mode, setMode] = useState<AutopilotMode>(initial.mode)
  const [interval, setIntervalDays] = useState<RunInterval>(initial.run_interval_days)
  const [savedInterval, setSavedInterval] = useState<RunInterval>(initial.run_interval_days)
  const [nextRunAt, setNextRunAt] = useState<string | null>(initial.next_run_at)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState<string | null>(
    initial.migration_applied
      ? null
      : 'The autopilot database migration has not been applied yet: autopilot stays off and the daily schedule cannot be saved.',
  )

  const needsConfirm = autopilotChangeNeedsConfirm(savedMode, mode)
  const confirmOk = !needsConfirm || confirmText === AUTOPILOT_CONFIRM_TEXT
  const dirty = mode !== savedMode || interval !== savedInterval

  async function save() {
    setBusy(true)
    try {
      const body: Record<string, unknown> = { autopilot_mode: mode, run_interval_days: interval }
      if (needsConfirm) body.autopilot_confirm_text = confirmText
      const res = await fetch('/api/portfolio/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({})) as {
        error?: string
        autopilot_settings_warning?: string | null
        settings?: Record<string, unknown>
      }
      if (!res.ok) {
        toast(data.error ?? 'Failed to save autopilot settings', 'error')
        return
      }
      if (data.autopilot_settings_warning) {
        setWarning(data.autopilot_settings_warning)
        toast('Autopilot settings could not be saved', 'error')
        return
      }
      const s = data.settings ?? {}
      setSavedMode(mode)
      setSavedInterval(parseRunInterval(s.run_interval_days ?? interval))
      setNextRunAt(typeof s.next_run_at === 'string' ? s.next_run_at : null)
      setConfirmText('')
      toast('Autopilot settings saved', 'success')
      router.refresh()
    } catch {
      toast('Failed to save autopilot settings', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={SETTINGS_CARD} aria-labelledby="autopilot-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="autopilot-heading" className={SETTINGS_CARD_TITLE}>Autopilot</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            savedMode === 'off' ? 'bg-gray-100 text-gray-600'
              : savedMode === 'approval' ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-800'
          }`}
        >
          {savedMode === 'off' ? 'Off' : savedMode === 'approval' ? 'Approval' : 'Automatic'}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600">{SCHEDULE_DESCRIPTION}. Exchange holidays are skipped.</p>

      {warning && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{warning}</p>
      )}

      <fieldset className="mt-4 space-y-2">
        <legend className={labelClass}>Mode</legend>
        {MODE_OPTIONS.map(opt => (
          <label
            key={opt.value}
            className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2 ${
              mode === opt.value ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
            }`}
          >
            <input
              type="radio"
              name="autopilot-mode"
              value={opt.value}
              checked={mode === opt.value}
              onChange={() => setMode(opt.value)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">{opt.label}</span>
              <span className="block text-xs text-gray-600">{opt.help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {needsConfirm && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3">
          <p className="text-sm text-red-900">
            Fully automatic mode requests trade executions without asking you.
            {dryRun ? ' Dry run is ON, so executions are simulated until you turn it off.' : ' Dry run is OFF — real orders will be placed.'}
            {' '}Type <span className="font-mono font-bold">{AUTOPILOT_CONFIRM_TEXT}</span> to confirm.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            aria-label="Autopilot confirmation"
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-red-600"
          />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-1">
        <label htmlFor="autopilot-interval" className={labelClass}>Analysis schedule</label>
        <select
          id="autopilot-interval"
          value={interval}
          onChange={e => setIntervalDays(parseRunInterval(Number(e.target.value)))}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-blue-600"
        >
          {RUN_INTERVALS.map(i => (
            <option key={i} value={i}>{RUN_INTERVAL_LABELS[i]}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
        <span className="font-semibold">Next scheduled run: </span>
        {savedMode === 'off'
          ? 'none — autopilot is off'
          : nextRunAt
            ? formatRunTime(nextRunAt)
            : 'next trading day at 10:30 New York time'}
        {savedMode !== 'off' && tradingPaused && (
          <span className="mt-1 block text-red-700">Trading is paused — runs continue but nothing is executed.</span>
        )}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={!dirty || !confirmOk || busy}
        className="mt-4 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
      >
        {busy ? 'Saving…' : 'Save autopilot'}
      </button>
    </section>
  )
}
