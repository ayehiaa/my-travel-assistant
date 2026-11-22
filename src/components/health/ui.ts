/** Shared Tailwind class strings for Health cards (keeps the tabs visually consistent). */
export const CARD = 'rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5'
export const CARD_TITLE = 'mb-3 text-sm font-bold uppercase tracking-wide text-[var(--ink-3)]'
export const BUTTON_PRIMARY = 'inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--blue-700)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50'
export const BUTTON_SECONDARY = 'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--rule)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50'
export const INPUT = 'min-h-11 w-full rounded-lg border border-[var(--rule)] bg-white px-3 py-2 text-base text-[var(--ink)] md:text-sm'
export const LABEL = 'mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]'

export function fmtNum(v: number, dp = 1): string {
  const r = Math.round(v * 10 ** dp) / 10 ** dp
  return Number.isInteger(r) ? String(r) : r.toFixed(dp)
}
