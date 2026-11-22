import type { Tone } from '@/lib/health/lifestyleUi'
import { TONE_CHIP } from './tone'

/** Small pill. Tone colours are always paired with text. */
export default function Chip({ children, tone = 'neutral', className = '' }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CHIP[tone]} ${className}`}>{children}</span>
}
