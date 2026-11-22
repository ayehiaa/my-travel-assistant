'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import type { RecentFood } from '@/lib/health/lifestyleUi'
import { relogItems } from './relog'

/** Recent meals + favourites with one-tap re-log (specs/032). */
export default function RecentFoods({ foods, date, time, slot }: { foods: RecentFood[]; date: string; time: string; slot: string | null }) {
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  async function log(f: RecentFood) {
    setBusy(f.key)
    const err = await relogItems({ date, time, slot, items: f.items })
    setBusy(null)
    if (err) { toast(err, 'error'); return }
    toast(`Logged ${f.name}`, 'success')
    router.refresh()
  }
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-[var(--rule-soft)] p-0">
      {foods.map(f => (
        <li key={f.key} className="flex min-h-12 items-center gap-3 py-1">
          <span aria-hidden="true" className="w-4 shrink-0 text-center text-[var(--ink-3)]">{f.kind === 'favourite' ? '★' : '↺'}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[var(--ink)]">{f.name}</span>
            <span className="block text-xs text-[var(--ink-3)]">{f.kcal} kcal · protein {f.proteinG} g · sat fat {f.satFatG} g</span>
          </span>
          <button type="button" disabled={busy !== null} onClick={() => log(f)} aria-label={`Log ${f.name}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--rule)] text-lg font-bold text-[var(--blue-700)] disabled:opacity-40">
            {busy === f.key ? '…' : '+'}
          </button>
        </li>
      ))}
    </ul>
  )
}
