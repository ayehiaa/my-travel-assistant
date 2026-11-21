import Link from 'next/link'
import type { ChecklistItem } from '@/lib/setupChecklist'

const NUMERALS = ['①', '②', '③', '④']

/** "Getting started" card at the top of the Portfolio Overview until setup is complete (specs/026). */
export default function GettingStartedChecklist({ items, doneCount }: { items: ChecklistItem[]; doneCount: number }) {
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 md:p-5" aria-labelledby="getting-started-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="getting-started-heading" className="text-sm font-semibold text-[var(--ink)]">Getting started</h3>
        <span className="text-xs text-[var(--ink-3)]">{doneCount} of {items.length} done</span>
      </div>
      <ol className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li key={item.key} className="flex items-start gap-3 rounded-lg bg-white px-3 py-2">
            <span className="text-lg leading-6 text-[var(--ink-3)]" aria-hidden>{NUMERALS[i]}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${item.done ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink)]'}`}>
                {item.label}
              </p>
              <p className="text-xs text-[var(--ink-3)]">{item.detail}</p>
            </div>
            {item.done ? (
              <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">✓ Done</span>
            ) : (
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Pending</span>
                <Link href={item.href} className="text-xs font-semibold text-[var(--blue-700)]">{item.cta} →</Link>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
