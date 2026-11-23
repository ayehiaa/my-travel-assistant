import Link from 'next/link'
import type { Tone } from '@/lib/health/lifestyleUi'
import Bar from './Bar'
import { TONE_ICON, TONE_TEXT_CLASS } from './tone'

/** Summary meter: label, big number, small "of target", bar with status word (Today's three meters). */
export default function Meter({ label, value, unit, sub, ratio, tone, status, marker = null, href }: {
  label: string
  value: string
  unit?: string
  sub?: string
  ratio: number
  tone: Tone
  status?: string | null
  marker?: number | null
  href?: string
}) {
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--ink-3)]">{label}</span>
        {status && <span className={`text-xs font-bold ${TONE_TEXT_CLASS[tone]}`}>{TONE_ICON[tone]} {status}</span>}
      </span>
      <span className="mt-0.5 block">
        <span className={`text-2xl font-bold tabular-nums ${tone === 'bad' ? 'text-red-700' : 'text-[var(--ink)]'}`}>{value}</span>
        {unit && <span className="ml-1 text-sm text-[var(--ink-3)]">{unit}</span>}
      </span>
      {sub && <span className="block text-xs text-[var(--ink-3)]">{sub}</span>}
      <span className="mt-2 block"><Bar ratio={ratio} tone={tone} marker={marker} /></span>
    </>
  )
  const cls = 'block min-w-0 rounded-xl border border-[var(--rule)] bg-white p-3'
  return href ? <Link href={href} className={`${cls} hover:border-[var(--blue-700)]`}>{body}</Link> : <div className={cls}>{body}</div>
}
