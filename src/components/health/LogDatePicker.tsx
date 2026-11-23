'use client'

import { useRouter } from 'next/navigation'
import { healthHref } from '@/lib/health/healthHub'
import { addDays, shortDayLabel } from '@/lib/health/time'

const ARROW = 'grid h-11 w-11 place-items-center rounded-full border border-[var(--rule)] bg-white text-lg text-[var(--ink)] disabled:opacity-30'

/** Date switcher for the Food tab (‹ Today ›, ?tab=food&date=YYYY-MM-DD); never goes past today. */
export default function LogDatePicker({ date, today }: { date: string; today: string }) {
  const router = useRouter()
  const go = (d: string) => router.push(healthHref({ tab: 'food', date: d === today ? null : d }))
  const label = date === today ? 'Today' : date === addDays(today, -1) ? 'Yesterday' : shortDayLabel(date)
  return (
    <div className="flex items-center justify-center gap-2">
      <button type="button" className={ARROW} aria-label="Previous day" onClick={() => go(addDays(date, -1))}>‹</button>
      <label className="relative flex min-h-11 min-w-36 items-center justify-center rounded-full px-3 text-base font-bold text-[var(--ink)]">
        {label}
        <input
          type="date"
          aria-label="Choose a day"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={date}
          max={today}
          onChange={e => { if (e.target.value) go(e.target.value > today ? today : e.target.value) }}
        />
      </label>
      <button type="button" className={ARROW} aria-label="Next day" disabled={date >= today} onClick={() => go(addDays(date, 1))}>›</button>
    </div>
  )
}
