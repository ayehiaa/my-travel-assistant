'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { sendJson, errorOf } from './api'
import { BUTTON_SECONDARY } from './ui'

/** Set the day-boundary timezone for a trip's days to this device's timezone, or back to home (specs/029 US11). */
export default function DayTimezoneControl({ dates, currentTz, homeTz }: { dates: string[]; currentTz: string; homeTz: string }) {
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [deviceTz] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return null }
  })

  async function apply(tz: string | null) {
    setBusy(true)
    const r = await sendJson('/api/health/day-timezones', { dates: dates.slice(0, 60), timezone: tz })
    setBusy(false)
    if (!r.ok) { toast(errorOf(r, 'Could not update the timezone'), 'error'); return }
    toast(tz ? `Trip days now use ${tz}` : 'Trip days back on your home timezone', 'success')
    router.refresh()
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-2)]">
      <span>Day boundaries: <strong className="text-[var(--ink)]">{currentTz}</strong>{currentTz !== homeTz && <> (home {homeTz})</>}</span>
      {deviceTz && deviceTz !== currentTz && (
        <button type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={() => apply(deviceTz)}>Use {deviceTz} for this trip</button>
      )}
      {currentTz !== homeTz && (
        <button type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={() => apply(null)}>Back to {homeTz}</button>
      )}
    </div>
  )
}
