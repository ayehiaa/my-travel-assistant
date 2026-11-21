'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import {
  LIVE_TRADING_CONFIRM_TEXT,
  RESUME_CONFIRM_TEXT,
  type RiskLimits,
  type SafetySettings,
} from '@/lib/riskLimits'
import { SETTINGS_CARD, SETTINGS_CARD_TITLE } from './settingsCard'

interface Props {
  initial: SafetySettings
}

type PctKey = Exclude<keyof RiskLimits, 'max_single_order_usd'>

const PCT_FIELDS: Array<{ key: PctKey; label: string; help: string }> = [
  { key: 'max_turnover_pct',     label: 'Max turnover per execution (%)', help: 'Total of all orders as a share of the portfolio' },
  { key: 'max_position_pct',     label: 'Max position size (%)',          help: 'No stock above this weight after buys' },
  { key: 'min_cash_buffer_pct',  label: 'Minimum cash buffer (%)',        help: 'Buys never spend cash below this' },
  { key: 'drift_threshold_pct',  label: 'Drift threshold (%)',            help: 'Ignore rebalances smaller than this (Shariah sells always run)' },
  { key: 'daily_loss_stop_pct',  label: 'Daily loss stop (%)',            help: 'Pause trading if equity falls more than this since the previous close' },
  { key: 'weekly_loss_stop_pct', label: 'Weekly loss stop (%)',           help: 'Pause trading if equity falls more than this over 5 trading days' },
]

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
const labelClass = 'text-[11px] font-bold uppercase tracking-wider text-gray-500'

function toStrings(limits: RiskLimits): Record<keyof RiskLimits, string> {
  return {
    max_turnover_pct:     String(limits.max_turnover_pct),
    max_position_pct:     String(limits.max_position_pct),
    min_cash_buffer_pct:  String(limits.min_cash_buffer_pct),
    drift_threshold_pct:  String(limits.drift_threshold_pct),
    max_single_order_usd: limits.max_single_order_usd === null ? '' : String(limits.max_single_order_usd),
    daily_loss_stop_pct:  String(limits.daily_loss_stop_pct),
    weekly_loss_stop_pct: String(limits.weekly_loss_stop_pct),
  }
}

/** Parse the form; returns null when any field is out of range. */
function parseLimits(values: Record<keyof RiskLimits, string>): RiskLimits | null {
  const out: Partial<RiskLimits> = {}
  for (const f of PCT_FIELDS) {
    const n = Number(values[f.key])
    if (!Number.isFinite(n) || n < 1 || n > 100) return null
    out[f.key] = n
  }
  const single = values.max_single_order_usd.trim()
  if (single === '') {
    out.max_single_order_usd = null
  } else {
    const n = Number(single)
    if (!Number.isFinite(n) || n < 1 || n > 10_000_000) return null
    out.max_single_order_usd = n
  }
  return out as RiskLimits
}

/** "Risk & safety" settings: hard limits, dry-run toggle, kill switch. Self-contained (moves to the hub in phase 6). */
export default function RiskSafetyCard({ initial }: Props) {
  const toast = useToast()
  const router = useRouter()

  const [values, setValues] = useState(() => toStrings(initial.limits))
  const [dryRun, setDryRun] = useState(initial.dry_run)
  const [paused, setPaused] = useState(initial.trading_paused)
  const [pausedReason, setPausedReason] = useState(initial.paused_reason)
  const [warning, setWarning] = useState<string | null>(
    initial.migration_applied
      ? null
      : 'The safety database migration has not been applied yet: default limits and dry run are in force, changes cannot be saved and a pause cannot persist (pausing still cancels open orders).',
  )
  const [busy, setBusy] = useState<null | 'limits' | 'dry' | 'pause' | 'resume'>(null)
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false)
  const [liveConfirmText, setLiveConfirmText] = useState('')
  const [pauseReason, setPauseReason] = useState('')
  const [resumeOpen, setResumeOpen] = useState(false)
  const [resumeText, setResumeText] = useState('')

  const parsed = parseLimits(values)

  async function putSettings(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch('/api/portfolio/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({})) as { error?: string; safety_settings_warning?: string | null }
    if (!res.ok) {
      toast(data.error ?? 'Failed to save safety settings', 'error')
      return false
    }
    if (data.safety_settings_warning) {
      setWarning(data.safety_settings_warning)
      toast('Safety settings could not be saved', 'error')
      return false
    }
    return true
  }

  async function saveLimits() {
    if (!parsed) return
    setBusy('limits')
    try {
      if (await putSettings({ risk_limits: parsed })) toast('Risk limits saved', 'success')
    } catch {
      toast('Failed to save risk limits', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function setDryRunMode(next: boolean) {
    setBusy('dry')
    try {
      const body = next ? { dry_run: true } : { dry_run: false, confirm_text: liveConfirmText }
      if (await putSettings(body)) {
        setDryRun(next)
        setLiveConfirmOpen(false)
        setLiveConfirmText('')
        toast(next ? 'Dry run on — no orders will be placed' : 'Live trading enabled', 'success')
        router.refresh()
      }
    } catch {
      toast('Failed to change dry run', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function pause() {
    setBusy('pause')
    try {
      const res = await fetch('/api/portfolio/trading/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pauseReason.trim() ? { reason: pauseReason.trim() } : {}),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; paused?: boolean; warning?: string | null; executions_cancelled?: number }
      if (!res.ok) {
        toast(data.error ?? 'Failed to pause trading', 'error')
        return
      }
      if (data.paused) {
        setPaused(true)
        setPausedReason(pauseReason.trim() || 'Paused manually')
      }
      if (data.warning) setWarning(data.warning)
      toast(data.paused ? 'Trading paused — open orders cancelled' : 'Open orders cancelled, but the pause could not be saved', data.paused ? 'success' : 'error')
      setPauseReason('')
      router.refresh()
    } catch {
      toast('Failed to pause trading', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function resume() {
    setBusy('resume')
    try {
      const res = await fetch('/api/portfolio/trading/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_text: resumeText }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; warning?: string | null }
      if (!res.ok) {
        toast(data.error ?? 'Failed to resume trading', 'error')
        return
      }
      if (data.warning) setWarning(data.warning)
      setPaused(false)
      setPausedReason(null)
      setResumeOpen(false)
      setResumeText('')
      toast('Trading resumed', 'success')
      router.refresh()
    } catch {
      toast('Failed to resume trading', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={SETTINGS_CARD} aria-labelledby="risk-safety-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="risk-safety-heading" className={SETTINGS_CARD_TITLE}>Risk &amp; safety</h3>
        <div className="flex gap-2">
          {dryRun && <span className="rounded bg-purple-600 px-2 py-0.5 font-mono text-xs font-bold text-white">DRY RUN</span>}
          {paused && <span className="rounded bg-red-600 px-2 py-0.5 font-mono text-xs font-bold text-white">PAUSED</span>}
        </div>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Enforced in code on every execution — manual or automatic. Limits only ever shrink or block orders.
      </p>

      {warning && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{warning}</p>
      )}

      {/* Kill switch */}
      <section className={`mt-5 rounded-lg border p-4 ${paused ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
        <h4 className="text-sm font-bold text-gray-900">Kill switch</h4>
        {paused ? (
          <>
            <p className="mt-1 text-sm font-semibold text-red-800">
              Trading is paused{pausedReason ? ` — ${pausedReason}` : ''}. No orders will be placed.
            </p>
            {resumeOpen ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  className={`${inputClass} max-w-[200px]`}
                  placeholder={`Type ${RESUME_CONFIRM_TEXT}`}
                  value={resumeText}
                  onChange={e => setResumeText(e.target.value)}
                  aria-label="Type RESUME to confirm"
                />
                <button
                  onClick={resume}
                  disabled={resumeText !== RESUME_CONFIRM_TEXT || busy !== null}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {busy === 'resume' ? 'Resuming…' : 'Confirm resume'}
                </button>
                <button onClick={() => { setResumeOpen(false); setResumeText('') }} className="text-sm font-semibold text-gray-600">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setResumeOpen(true)}
                className="mt-3 rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-bold text-gray-800"
              >
                Resume trading…
              </button>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-600">
              Pausing cancels every open order on your Alpaca account, stops executions in progress and blocks new ones
              until you resume.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className={`${inputClass} max-w-[260px] font-normal`}
                placeholder="Reason (optional)"
                maxLength={200}
                value={pauseReason}
                onChange={e => setPauseReason(e.target.value)}
                aria-label="Pause reason"
              />
              <button
                onClick={pause}
                disabled={busy !== null}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {busy === 'pause' ? 'Pausing…' : 'Pause all trading'}
              </button>
            </div>
          </>
        )}
      </section>

      {/* Dry run */}
      <section className="mt-5 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-gray-900">Dry-run mode</h4>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${dryRun ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
            {dryRun ? 'On — no orders placed' : 'Off — live orders'}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          In dry run every execution is fully planned (Shariah guard, settlement, risk limits) and recorded as simulated,
          but nothing is sent to Alpaca.
        </p>
        {dryRun ? (
          liveConfirmOpen ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold text-red-700">
                Real orders will be placed with real money (or your paper account). Type {LIVE_TRADING_CONFIRM_TEXT} to confirm.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`${inputClass} max-w-[260px]`}
                  placeholder={LIVE_TRADING_CONFIRM_TEXT}
                  value={liveConfirmText}
                  onChange={e => setLiveConfirmText(e.target.value)}
                  aria-label="Type confirmation to enable live trading"
                />
                <button
                  onClick={() => setDryRunMode(false)}
                  disabled={liveConfirmText !== LIVE_TRADING_CONFIRM_TEXT || busy !== null}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {busy === 'dry' ? 'Saving…' : 'Turn dry run off'}
                </button>
                <button onClick={() => { setLiveConfirmOpen(false); setLiveConfirmText('') }} className="text-sm font-semibold text-gray-600">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setLiveConfirmOpen(true)}
              className="mt-3 rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-bold text-gray-800"
            >
              Enable live trading…
            </button>
          )
        ) : (
          <button
            onClick={() => setDryRunMode(true)}
            disabled={busy !== null}
            className="mt-3 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {busy === 'dry' ? 'Saving…' : 'Turn dry run on'}
          </button>
        )}
      </section>

      {/* Limits */}
      <section className="mt-5">
        <h4 className="text-sm font-bold text-gray-900">Hard limits</h4>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PCT_FIELDS.map(f => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className={labelClass}>{f.label}</span>
              <input
                type="number"
                min={1}
                max={100}
                step={0.5}
                className={inputClass}
                value={values[f.key]}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              />
              <span className="text-xs text-gray-500">{f.help}</span>
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Max single order (USD)</span>
            <input
              type="number"
              min={1}
              step={1}
              placeholder="No cap"
              className={inputClass}
              value={values.max_single_order_usd}
              onChange={e => setValues(v => ({ ...v, max_single_order_usd: e.target.value }))}
            />
            <span className="text-xs text-gray-500">Leave empty for no cap</span>
          </label>
        </div>
        {!parsed && <p className="mt-3 text-sm text-red-700">Percentages must be between 1 and 100; the order cap at least $1.</p>}
        <button
          onClick={saveLimits}
          disabled={!parsed || busy !== null}
          className="mt-4 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
        >
          {busy === 'limits' ? 'Saving…' : 'Save limits'}
        </button>
      </section>
    </section>
  )
}
