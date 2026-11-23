'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import type { ComponentChip } from '@/lib/health/lifestyleUi'
import type { FoodItem } from '@/lib/health/nutrition'
import BottomSheet from './ui/BottomSheet'
import { relogItems } from './relog'

export interface ChipSuggestion { id: string; name: string; amount: string; kcal: number; items: FoodItem[] }

interface Props {
  chips: Array<ComponentChip & { sources: string[]; suggestions: ChipSuggestion[] }>
  date: string
  time: string
  slot: string | null
}

const STATE_CLS: Record<ComponentChip['state'], string> = {
  done: 'border-green-200 bg-green-50 text-green-800',
  todo: 'border-[var(--rule)] bg-white text-[var(--ink)]',
  not_due: 'border-dashed border-[var(--rule)] bg-white text-[var(--ink-3)]',
}

/** LDL component chips (✓ / "x left" / "1/2 this week"); tap → foods that close the gap, one tap to log. */
export default function ComponentChipsRow({ chips, date, time, slot }: Props) {
  const toast = useToast()
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const chip = chips.find(c => c.key === open) ?? null

  async function log(s: ChipSuggestion) {
    setBusy(s.id)
    const err = await relogItems({ date, time, slot, items: s.items })
    setBusy(null)
    if (err) { toast(err, 'error'); return }
    toast(`Logged ${s.name}`, 'success')
    setOpen(null)
    router.refresh()
  }

  return (
    <>
      <ul className="relative -mx-4 flex list-none gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Daily food goals">
        {chips.map(c => (
          <li key={c.key} className="shrink-0">
            <button type="button" onClick={() => setOpen(c.key)} className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${STATE_CLS[c.state]}`}>
              {c.state === 'done' && <span aria-hidden="true">✓</span>}
              <span>{c.name}</span>
              {c.state !== 'done' && <span className="font-normal text-[var(--ink-3)]">{c.text}</span>}
              <span className="sr-only">{c.state === 'done' ? ' — done' : ''}</span>
            </button>
          </li>
        ))}
      </ul>
      <BottomSheet open={chip !== null} onClose={() => setOpen(null)} title={chip ? `${chip.name} · ${chip.state === 'done' ? 'done ✓' : chip.text}` : ''}>
        {chip && (
          <div className="flex flex-col gap-3">
            {chip.suggestions.length > 0 ? (
              <ul className="m-0 flex list-none flex-col divide-y divide-[var(--rule-soft)] p-0">
                {chip.suggestions.map(s => (
                  <li key={s.id} className="flex min-h-12 items-center gap-3 py-1">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--ink)]">{s.name}</span>
                      <span className="block text-xs text-[var(--ink-3)]">+{s.amount} · {s.kcal} kcal</span>
                    </span>
                    <button type="button" disabled={busy !== null} onClick={() => log(s)} className="min-h-11 rounded-full bg-[var(--blue-700)] px-4 text-sm font-bold text-white disabled:opacity-50">
                      {busy === s.id ? '…' : 'Log'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--ink-3)]">No saved foods with {chip.name.toLowerCase()} yet.</p>
            )}
            {chip.sources.length > 0 && <p className="text-xs text-[var(--ink-3)]">Ideas: {chip.sources.join(', ')}</p>}
          </div>
        )}
      </BottomSheet>
    </>
  )
}
