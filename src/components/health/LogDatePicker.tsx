'use client'

import { useRouter } from 'next/navigation'
import { healthHref } from '@/lib/health/healthHub'
import { addDays } from '@/lib/health/time'
import { BUTTON_SECONDARY, INPUT } from './ui'

/** Date picker for the Log tab (?tab=log&date=YYYY-MM-DD); never goes past today. */
export default function LogDatePicker({ date, today }: { date: string; today: string }) {
  const router = useRouter()
  const go = (d: string) => router.push(healthHref({ tab: 'log', date: d === today ? null : d }))
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={BUTTON_SECONDARY} aria-label="Previous day" onClick={() => go(addDays(date, -1))}>‹</button>
      <input
        type="date"
        aria-label="Day"
        className={`${INPUT} w-auto`}
        value={date}
        max={today}
        onChange={e => { if (e.target.value) go(e.target.value > today ? today : e.target.value) }}
      />
      <button type="button" className={BUTTON_SECONDARY} aria-label="Next day" disabled={date >= today} onClick={() => go(addDays(date, 1))}>›</button>
    </div>
  )
}
