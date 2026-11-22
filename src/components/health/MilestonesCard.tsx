'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { sendJson, errorOf } from './api'
import { CARD, CARD_TITLE } from './ui'

export interface MilestoneItem {
  week: number
  dates: string
  state: 'upcoming' | 'current' | 'due' | 'done'
  tasks: Array<{ task: string; done: boolean }>
  expected: string[]
  actual: string[]
}

const STATE: Record<MilestoneItem['state'], { label: string; cls: string }> = {
  upcoming: { label: 'Upcoming', cls: 'bg-[var(--paper-2)] text-[var(--ink-3)]' },
  current:  { label: 'This week', cls: 'bg-blue-100 text-blue-800' },
  due:      { label: 'Open', cls: 'bg-amber-100 text-amber-900' },
  done:     { label: 'Done', cls: 'bg-green-100 text-green-800' },
}

/** Milestones checklist per programme week with expected vs actual (specs/029 US9). */
export default function MilestonesCard({ items }: { items: MilestoneItem[] }) {
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  async function toggle(week: number, task: string, done: boolean) {
    setBusy(`${week}:${task}`)
    const r = await sendJson('/api/health/progress-data', { action: 'milestone', week, task, done })
    setBusy(null)
    if (!r.ok) { toast(errorOf(r, 'Could not save'), 'error'); return }
    router.refresh()
  }
  return (
    <section className={CARD} aria-labelledby="mile-h">
      <h2 id="mile-h" className={CARD_TITLE}>Milestones</h2>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map(m => (
          <li key={m.week} className="border-b border-[var(--rule-soft)] pb-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[var(--ink)]">Week {m.week}</strong>
              <span className="text-xs text-[var(--ink-3)]">{m.dates}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATE[m.state].cls}`}>{STATE[m.state].label}</span>
            </div>
            <ul className="mt-1 flex list-none flex-wrap gap-2 p-0">
              {m.tasks.map(t => (
                <li key={t.task}>
                  <label className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${t.done ? 'border-green-700 bg-green-50 text-green-800' : 'border-[var(--rule)] text-[var(--ink-2)]'}`}>
                    <input type="checkbox" checked={t.done} disabled={busy === `${m.week}:${t.task}`} onChange={e => toggle(m.week, t.task, e.target.checked)} />
                    {t.task}
                  </label>
                </li>
              ))}
            </ul>
            {(m.expected.length > 0 || m.actual.length > 0) && (
              <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {m.expected.length > 0 && <p className="text-[var(--ink-3)]"><strong>Expected:</strong> {m.expected.join(' · ')}</p>}
                {m.actual.length > 0 && <p className="text-[var(--ink-2)]"><strong>Actual:</strong> {m.actual.join(' · ')}</p>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
