'use client'

import type { Assumption } from '@/lib/health/assumptions'
import { fmtNum } from './ui'

interface Props {
  assumptions: Assumption[] | undefined
  /** Omit for a read-only view (saved entry card). */
  onToggle?: (key: string, kept: boolean) => void
}

/**
 * Assumption chips (specs/029 P3.1): "+ butter (assumed) 50 kcal · sat 3.6 g ✕". Dashed amber = assumed by the
 * estimate, not stated by the person. A removed chip stays visible (struck through) so it can be added back.
 */
export default function AssumptionChips({ assumptions, onToggle }: Props) {
  if (!assumptions?.length) return null
  return (
    <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-1.5 p-0" aria-label="Assumptions">
      {assumptions.map(a => {
        const detail = `${Math.round(a.addsKcal)} kcal · sat ${fmtNum(a.addsSatFatG)} g`
        const text = `+ ${a.label} (assumed)`
        return (
          <li
            key={a.key}
            className={`inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs ${
              a.kept ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-[var(--rule)] bg-white text-[var(--ink-3)] line-through'
            }`}
          >
            <span>{text}</span>
            <span className="text-[11px] opacity-80">{detail}{a.grams ? ` · ${fmtNum(a.grams, 0)} g` : ''}</span>
            {onToggle && (
              a.kept ? (
                <button type="button" aria-label={`Remove ${a.label}`} className="ml-0.5 px-1 font-bold no-underline" onClick={() => onToggle(a.key, false)}>✕</button>
              ) : (
                <button type="button" aria-label={`Add back ${a.label}`} className="ml-0.5 px-1 font-bold" onClick={() => onToggle(a.key, true)}>+</button>
              )
            )}
          </li>
        )
      })}
    </ul>
  )
}
