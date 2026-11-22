import type { Tone } from '@/lib/health/lifestyleUi'

/** Semantic colour per status tone (always paired with a word or icon in the UI — never colour only). */
export const TONE_FILL: Record<Tone, string> = {
  good: 'fill-green-600', close: 'fill-amber-500', bad: 'fill-red-600', neutral: 'fill-[var(--blue-700)]',
}
export const TONE_TEXT_CLASS: Record<Tone, string> = {
  good: 'text-green-700', close: 'text-amber-700', bad: 'text-red-700', neutral: 'text-[var(--ink-3)]',
}
export const TONE_CHIP: Record<Tone, string> = {
  good: 'border-green-200 bg-green-50 text-green-800',
  close: 'border-amber-200 bg-amber-50 text-amber-900',
  bad: 'border-red-200 bg-red-50 text-red-800',
  neutral: 'border-[var(--rule)] bg-white text-[var(--ink-2)]',
}
export const TONE_ICON: Record<Tone, string> = { good: '✓', close: '!', bad: '▲', neutral: '' }
