import type { Tone } from '@/lib/health/lifestyleUi'
import { TONE_FILL } from './tone'

/** Progress bar as SVG (percent widths as attributes — no inline styles). Optional marker, e.g. a target under a ceiling. */
export default function Bar({ ratio, tone = 'neutral', marker = null, className = 'h-2' }: {
  ratio: number; tone?: Tone; marker?: number | null; className?: string
}) {
  const pct = `${Math.round(Math.max(0, Math.min(1, ratio)) * 1000) / 10}%`
  return (
    <svg className={`block w-full overflow-hidden rounded-full ${className}`} role="presentation" aria-hidden="true" preserveAspectRatio="none">
      <rect width="100%" height="100%" rx="4" className="fill-[var(--paper-3)]" />
      <rect width={pct} height="100%" rx="4" className={TONE_FILL[tone]} />
      {marker !== null && <rect x={`${Math.round(marker * 1000) / 10}%`} width="2" height="100%" className="fill-[var(--ink-2)]" />}
    </svg>
  )
}
