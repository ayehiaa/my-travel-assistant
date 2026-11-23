import type { Tone } from '@/lib/health/lifestyleUi'
import { TONE_ICON, TONE_TEXT_CLASS } from './tone'

/** Compact number tile with a status tone (Progress summary). */
export default function StatTile({ label, value, sub, tone = 'neutral', status }: {
  label: string; value: string; sub?: string | null; tone?: Tone; status?: string | null
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--rule)] bg-white p-3">
      <p className="truncate text-xs font-semibold text-[var(--ink-3)]">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-[var(--ink)]">{value}</p>
      {(sub || status) && (
        <p className="truncate text-xs text-[var(--ink-3)]">
          {status && <span className={`font-bold ${TONE_TEXT_CLASS[tone]}`}>{TONE_ICON[tone]} {status}</span>}
          {status && sub && ' · '}
          {sub}
        </p>
      )}
    </div>
  )
}
