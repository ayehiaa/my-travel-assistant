/** Formatting helpers for emails. Explicit time zones so output never depends on the server's zone. */

export const NY_TZ = 'America/New_York'
export const UK_TZ = 'Europe/London'

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatUsd(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatSignedUsd(n: number): string {
  return n > 0 ? `+${formatUsd(n)}` : formatUsd(n)
}

export function formatPct(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  const s = n.toFixed(2)
  return n > 0 ? `+${s}%` : `${s}%`
}

function timeIn(d: Date, timeZone: string): string {
  return d.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
}

/** "Sat 21 Nov 2026, 10:30 New York / 15:30 UK" (the date is the New York date). */
export function formatNyUk(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'unknown time'
  const date = d.toLocaleDateString('en-GB', {
    timeZone: NY_TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
  return `${date.replace(/,/g, '')}, ${timeIn(d, NY_TZ)} New York / ${timeIn(d, UK_TZ)} UK`
}

/** "21 Nov 2026" in New York. */
export function formatNyDate(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'unknown date'
  return d.toLocaleDateString('en-GB', { timeZone: NY_TZ, day: 'numeric', month: 'short', year: 'numeric' })
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`
}
