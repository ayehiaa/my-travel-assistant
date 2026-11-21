'use client'

import { useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS, type NotificationType } from '@/lib/notifications/types'
import type { NotificationPrefs } from '@/lib/notifications/prefs'
import { SETTINGS_CARD, SETTINGS_CARD_TITLE } from './settingsCard'

interface Props {
  initial: NotificationPrefs
  emailConfigured: boolean
  migrationApplied: boolean
  email: string
}

const GROUPS: Array<{ title: string; types: NotificationType[] }> = [
  { title: 'Analysis',   types: ['run_completed', 'approval_needed', 'approval_expired', 'shariah_status_change'] },
  { title: 'Execution',  types: ['execution_completed', 'execution_completed_with_errors', 'execution_failed', 'dry_run_completed'] },
  { title: 'Safety',     types: ['trading_paused', 'trading_resumed'] },
  { title: 'Summary',    types: ['weekly_summary'] },
]

const labelClass = 'text-[11px] font-bold uppercase tracking-wider text-gray-500'

/** "Notifications" settings card: master switch, per-type toggles, test email. Self-contained (moves to the hub in phase 6). */
export default function NotificationsCard({ initial, emailConfigured, migrationApplied, email }: Props) {
  const toast = useToast()
  const [saved, setSaved] = useState<NotificationPrefs>(initial)
  const [enabled, setEnabled] = useState(initial.enabled)
  const [types, setTypes] = useState<Record<NotificationType, boolean>>(initial.types)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [warning, setWarning] = useState<string | null>(
    migrationApplied ? null : 'The notifications database migration has not been applied yet: every notification stays enabled and changes cannot be saved.',
  )

  const dirty = enabled !== saved.enabled || NOTIFICATION_TYPES.some(t => types[t] !== saved.types[t])

  async function save() {
    setBusy(true)
    try {
      const res = await fetch('/api/portfolio/notifications', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ enabled, types }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; warning?: string | null; prefs?: NotificationPrefs }
      if (!res.ok) {
        toast(data.error ?? 'Failed to save notification settings', 'error')
        return
      }
      if (data.warning) {
        setWarning(data.warning)
        toast('Notification settings could not be saved', 'error')
        return
      }
      if (data.prefs) {
        setSaved(data.prefs)
        setEnabled(data.prefs.enabled)
        setTypes(data.prefs.types)
      }
      toast('Notification settings saved', 'success')
    } catch {
      toast('Failed to save notification settings', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    try {
      const res = await fetch('/api/portfolio/notifications/test', { method: 'POST' })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        toast(data.error ?? 'Failed to send the test email', 'error')
        return
      }
      toast(`Test email sent to ${email}`, 'success')
    } catch {
      toast('Failed to send the test email', 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className={SETTINGS_CARD} aria-labelledby="notifications-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="notifications-heading" className={SETTINGS_CARD_TITLE}>Notifications</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${saved.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {saved.enabled ? 'Email on' : 'Off'}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Emails go to <span className="font-semibold text-gray-900">{email || 'your account email'}</span>.
      </p>

      {!emailConfigured && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Email sending is not configured on this server yet (RESEND_API_KEY / sender address), so no emails are sent.
        </p>
      )}
      {warning && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{warning}</p>
      )}

      <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
        <span className="text-sm font-semibold text-gray-900">Email notifications</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
          className="h-4 w-4 accent-blue-700"
          aria-label="Email notifications master switch"
        />
      </label>

      <div className={`mt-3 space-y-4 ${enabled ? '' : 'opacity-50'}`}>
        {GROUPS.map(group => (
          <fieldset key={group.title} className="space-y-1" disabled={!enabled}>
            <legend className={labelClass}>{group.title}</legend>
            {group.types.map(t => (
              <label key={t} className="flex cursor-pointer items-start justify-between gap-3 rounded-lg px-1 py-1">
                <span>
                  <span className="block text-sm text-gray-900">{NOTIFICATION_TYPE_LABELS[t].label}</span>
                  <span className="block text-xs text-gray-500">{NOTIFICATION_TYPE_LABELS[t].help}</span>
                </span>
                <input
                  type="checkbox"
                  checked={types[t]}
                  onChange={e => setTypes(prev => ({ ...prev, [t]: e.target.checked }))}
                  className="mt-1 h-4 w-4 accent-blue-700"
                />
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
        >
          {busy ? 'Saving…' : 'Save notifications'}
        </button>
        <button
          type="button"
          onClick={sendTest}
          disabled={!emailConfigured || testing}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-800 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          {testing ? 'Sending…' : 'Send test email'}
        </button>
      </div>
    </section>
  )
}
