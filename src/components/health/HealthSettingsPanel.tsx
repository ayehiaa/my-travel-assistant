'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { HEALTH_REMINDER_LABELS, HEALTH_REMINDER_TYPES, type HealthSettings, type HealthReminderType } from '@/lib/health/healthSettings'
import { WEEKDAYS } from '@/lib/health/programmeSchema'
import { sendJson, errorOf } from './api'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_TITLE, INPUT, LABEL } from './ui'

function b64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

type PushState = 'unsupported' | 'unconfigured' | 'off' | 'on' | 'denied' | 'loading'

/** Health settings (specs/029 P2): units, reminders (per type, quiet hours, channels) and this browser's push. */
export default function HealthSettingsPanel({ initial, available, emailConfigured }: { initial: HealthSettings; available: boolean; emailConfigured: boolean }) {
  const toast = useToast()
  const router = useRouter()
  const [s, setS] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [push, setPush] = useState<PushState>('loading')
  const r = s.reminders

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setPush('unsupported'); return }
      const key = await sendJson<{ publicKey: string | null }>('/api/health/push', undefined, 'GET')
      if (cancelled) return
      if (!key.ok || !key.data.publicKey) { setPush('unconfigured'); return }
      if (Notification.permission === 'denied') { setPush('denied'); return }
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (!cancelled) setPush(sub ? 'on' : 'off')
    })().catch(() => { if (!cancelled) setPush('unsupported') })
    return () => { cancelled = true }
  }, [])

  async function save() {
    setSaving(true)
    const res = await sendJson('/api/health/settings', { units: s.units, reminders: s.reminders }, 'PATCH')
    setSaving(false)
    if (!res.ok) { toast(errorOf(res, 'Could not save settings'), 'error'); return }
    toast('Settings saved', 'success')
    router.refresh()
  }

  async function enablePush() {
    setPush('loading')
    try {
      const key = await sendJson<{ publicKey: string | null }>('/api/health/push', undefined, 'GET')
      if (!key.data.publicKey) { setPush('unconfigured'); return }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setPush(perm === 'denied' ? 'denied' : 'off'); return }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key.data.publicKey) })
      const res = await sendJson('/api/health/push', sub.toJSON())
      if (!res.ok) { await sub.unsubscribe(); toast(errorOf(res, 'Could not enable push'), 'error'); setPush('off'); return }
      setPush('on')
      toast('Push notifications on for this device', 'success')
    } catch {
      toast('Push could not be enabled in this browser', 'error')
      setPush('off')
    }
  }

  async function disablePush() {
    setPush('loading')
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await sendJson('/api/health/push', { endpoint: sub.endpoint }, 'DELETE')
        await sub.unsubscribe()
      }
      setPush('off')
    } catch {
      setPush('off')
    }
  }

  const setR = (patch: Partial<HealthSettings['reminders']>) => setS(prev => ({ ...prev, reminders: { ...prev.reminders, ...patch } }))
  const setType = (t: HealthReminderType, v: boolean) => setR({ types: { ...r.types, [t]: v } })

  return (
    <section className={CARD} id="health-settings" aria-labelledby="hs-h">
      <h2 id="hs-h" className={CARD_TITLE}>Reminders &amp; units</h2>
      {!available && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Settings need a database update — the owner must apply <code>supabase/apply_health_p2.sql</code>. Defaults are used until then.</p>}

      <h3 className="text-sm font-bold text-[var(--ink)]">Units</h3>
      <div className="mt-2 grid grid-cols-3 gap-3">
        <label><span className={LABEL}>Weight</span>
          <select className={INPUT} value={s.units.weight} onChange={e => setS({ ...s, units: { ...s.units, weight: e.target.value as 'kg' | 'lb' } })}><option value="kg">kg</option><option value="lb">lb</option></select>
        </label>
        <label><span className={LABEL}>Length</span>
          <select className={INPUT} value={s.units.length} onChange={e => setS({ ...s, units: { ...s.units, length: e.target.value as 'cm' | 'in' } })}><option value="cm">cm</option><option value="in">in</option></select>
        </label>
        <label><span className={LABEL}>Cholesterol</span>
          <select className={INPUT} value={s.units.lipids} onChange={e => setS({ ...s, units: { ...s.units, lipids: e.target.value as 'mmol' | 'mgdl' } })}><option value="mmol">mmol/L</option><option value="mgdl">mg/dL</option></select>
        </label>
      </div>

      <h3 className="mt-5 text-sm font-bold text-[var(--ink)]">Reminders</h3>
      <label className="mt-2 flex items-center gap-2 text-sm text-[var(--ink)]">
        <input type="checkbox" checked={r.enabled} onChange={e => setR({ enabled: e.target.checked })} /> Send me Health reminders
      </label>
      <div className={`mt-2 flex flex-col gap-3 ${r.enabled ? '' : 'opacity-60'}`}>
        <div className="flex flex-wrap gap-4 text-sm text-[var(--ink-2)]">
          <label className="flex items-center gap-2"><input type="checkbox" checked={r.channels.email} onChange={e => setR({ channels: { ...r.channels, email: e.target.checked } })} /> Email{!emailConfigured && <span className="text-xs text-[var(--ink-3)]">(not configured on the server)</span>}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={r.channels.push} onChange={e => setR({ channels: { ...r.channels, push: e.target.checked } })} /> Push</label>
        </div>
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {HEALTH_REMINDER_TYPES.map(t => (
            <li key={t}>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={r.types[t]} onChange={e => setType(t, e.target.checked)} />
                <span><span className="font-semibold text-[var(--ink)]">{HEALTH_REMINDER_LABELS[t].label}</span><span className="block text-xs text-[var(--ink-3)]">{HEALTH_REMINDER_LABELS[t].help}</span></span>
              </label>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <label><span className={LABEL}>Quiet from</span><input type="time" className={INPUT} value={r.quietStart} onChange={e => setR({ quietStart: e.target.value })} /></label>
          <label><span className={LABEL}>Quiet until</span><input type="time" className={INPUT} value={r.quietEnd} onChange={e => setR({ quietEnd: e.target.value })} /></label>
          <label><span className={LABEL}>Training time</span><input type="time" className={INPUT} value={r.trainingTime ?? ''} onChange={e => setR({ trainingTime: e.target.value || null })} /></label>
          <label><span className={LABEL}>Review day</span>
            <select className={INPUT} value={r.weeklyReviewDay} onChange={e => setR({ weeklyReviewDay: e.target.value as typeof r.weeklyReviewDay })}>
              {WEEKDAYS.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
            </select>
          </label>
          <label><span className={LABEL}>Review time</span><input type="time" className={INPUT} value={r.weeklyReviewTime} onChange={e => setR({ weeklyReviewTime: e.target.value })} /></label>
        </div>
        <p className="text-xs text-[var(--ink-3)]">Times are in your Health timezone (or the trip timezone on travel days). Reminders that fall in quiet hours are skipped.</p>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--rule-soft)] p-3 text-sm">
        <span className="font-semibold text-[var(--ink)]">Push on this device: </span>
        {push === 'loading' && <span className="text-[var(--ink-3)]">checking…</span>}
        {push === 'unsupported' && <span className="text-[var(--ink-3)]">not supported in this browser (on iPhone, add Sojourn to the Home Screen first).</span>}
        {push === 'unconfigured' && <span className="text-[var(--ink-3)]">not configured on the server — email reminders still work.</span>}
        {push === 'denied' && <span className="text-[var(--ink-3)]">blocked in the browser settings.</span>}
        {push === 'off' && <button type="button" className={BUTTON_SECONDARY} onClick={enablePush}>Turn on</button>}
        {push === 'on' && <><span className="text-green-700">on</span> <button type="button" className={`${BUTTON_SECONDARY} ml-2`} onClick={disablePush}>Turn off</button></>}
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" className={BUTTON_PRIMARY} disabled={saving || !available} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button>
      </div>
    </section>
  )
}
